import { createEvent, createRunId, errorEnvelope, okEnvelope } from "../../core/src/envelope.mjs";
import { recordRun, resolveStateDir } from "../../core/src/state.mjs";
import {
  buildFeishuAdapterConfig,
  describeFeishuAdapterReadiness,
  getFeishuEventId,
  normalizeFeishuEvent,
  sendFeishuAppText,
} from "../../feishu-adapter/src/index.mjs";
import { buildDefaultFeishuReply } from "./reply-policy.mjs";
import { evaluateFeishuIngressPolicy, isSupportedTextEvent, loadFeishuIngressPolicy } from "./ingress-policy.mjs";
import { createFeishuReplayStore } from "./replay-store.mjs";
import { loadFeishuSdkRuntime } from "./sdk-runtime.mjs";

export async function startFeishuBot(options = {}) {
  const config = buildFeishuAdapterConfig(options.config ? { ...options.config, env: {} } : options);
  const readiness = describeFeishuAdapterReadiness(config);
  if (!readiness.appCredentialsReady) {
    throw new Error("Feishu bot requires MYCLAW_FEISHU_APP_ID and MYCLAW_FEISHU_APP_SECRET.");
  }
  if (config.connectionMode !== "websocket") {
    throw new Error("Feishu bot currently requires MYCLAW_FEISHU_CONNECTION_MODE=websocket.");
  }

  const replyMode = normalizeReplyMode(options.replyMode);
  const stateDir = resolveStateDir(options.stateDir);
  const ingressPolicy = await loadFeishuIngressPolicy(options.ingressPolicy);
  const sdkRuntime = options.sdkRuntime ?? (await loadFeishuSdkRuntime());
  const client = sdkRuntime.createClient(config);
  const eventDispatcher = sdkRuntime.createEventDispatcher(config);
  const processed = new Set();
  const context = {
    client,
    config,
    logger: options.logger ?? console,
    replyBuilder: options.replyBuilder ?? ((input) => buildDefaultFeishuReply(input)),
    ingressPolicy,
    replyMode,
    replayStore: options.replayStore ?? createFeishuReplayStore({ stateDir, staleMs: options.replayStaleMs }),
    stateDir,
    processed,
  };

  eventDispatcher.register({
    "im.message.receive_v1": (event) => handleFeishuMessageEvent(event, context),
  });

  const wsClient = sdkRuntime.createWsClient(config, {
    onError: (error) => context.logger.error?.(`feishu-bot websocket error: ${redactError(error)}`),
    onReady: () => context.logger.log?.("feishu-bot websocket ready"),
    onReconnected: () => context.logger.log?.("feishu-bot websocket reconnected"),
    onReconnecting: () => context.logger.log?.("feishu-bot websocket reconnecting"),
  });
  await wsClient.start({ eventDispatcher });

  return {
    ok: true,
    mode: "websocket",
    stateDir: context.stateDir,
    stop() {
      wsClient.close?.();
    },
  };
}

export async function handleFeishuMessageEvent(event, context) {
  const eventId = getFeishuEventId(event);
  if (eventId && context.processed.has(eventId)) {
    return { ok: true, duplicate: true, eventId };
  }
  if (eventId) {
    context.processed.add(eventId);
  }

  const runId = createRunId("fb");
  const events = [createEvent("feishu.bot.message.received", { eventId: eventId || null })];
  let replyOutput = null;
  try {
    const reservation = eventId && context.replayStore ? await context.replayStore.reserve(eventId) : { duplicate: false };
    if (reservation.duplicate) {
      context.processed.delete(eventId);
      return { ok: true, duplicate: true, eventId, status: reservation.status || "seen" };
    }
    if (event?.sender?.sender_type === "app") {
      return await recordSkipped(context, runId, events, eventId, "bot_sender");
    }
    if (!isSupportedTextEvent(event)) {
      return await recordSkipped(context, runId, events, eventId, "unsupported_message_type");
    }

    const inbound = normalizeFeishuEvent(event);
    const policyDecision = evaluateFeishuIngressPolicy({ event, inbound, policy: context.ingressPolicy });
    if (!policyDecision.ok) {
      return await recordSkipped(context, runId, events, eventId, policyDecision.reason);
    }

    replyOutput = normalizeReplyOutput(await context.replyBuilder({ inbound, event }));
    if (!replyOutput.text) {
      throw new Error("Feishu reply builder returned empty text.");
    }
    const replyMode = normalizeReplyMode(context.replyMode);
    events.push(
      createEvent("feishu.bot.reply.started", {
        messageId: inbound.id,
        conversationId: inbound.conversationId,
        replyMode,
      }),
    );
    const reply = await sendFeishuAppText({
      client: context.client,
      text: replyOutput.text,
      chatId: inbound.conversationId,
      replyToMessageId: replyMode === "thread" ? inbound.id : null,
      replyInThread: replyMode === "thread",
    });
    if (!reply.ok) {
      throw new Error(`Feishu app reply failed: code=${reply.code}${reply.message ? ` message=${reply.message}` : ""}`);
    }
    events.push(
      createEvent("feishu.bot.reply.completed", {
        messageId: reply.messageId,
        target: reply.target,
        replyMode,
        replyProvider: replyOutput.provider,
        linkedRunId: replyOutput.linkedRunId,
      }),
    );
    const envelope = okEnvelope({ runId, result: { inbound, reply: { ...reply, builder: replyMetadata(replyOutput) } }, events });
    await recordRun(context.stateDir, runId, envelope);
    await context.replayStore?.complete(eventId, { status: "completed", runId });
    return envelope;
  } catch (error) {
    if (eventId) {
      context.processed.delete(eventId);
    }
    await context.replayStore?.fail(eventId, { runId, message: redactError(error) });
    events.push(createEvent("feishu.bot.reply.failed", {
      message: redactError(error),
      replyProvider: replyOutput?.provider || null,
      linkedRunId: replyOutput?.linkedRunId || null,
    }));
    const envelope = errorEnvelope({
      runId,
      code: "feishu_bot_reply_failed",
      message: redactError(error),
      recoverable: true,
      events,
    });
    await recordRun(context.stateDir, runId, envelope);
    return envelope;
  }
}

async function recordSkipped(context, runId, events, eventId, reason) {
  events.push(createEvent("feishu.bot.message.skipped", { reason }));
  const envelope = okEnvelope({ runId, result: { skipped: true, reason }, events });
  await recordRun(context.stateDir, runId, envelope);
  await context.replayStore?.complete(eventId, { status: "skipped", runId, reason });
  return envelope;
}

function normalizeReplyMode(value) {
  const mode = String(value || "direct").toLowerCase();
  if (mode === "direct" || mode === "thread") {
    return mode;
  }
  throw new Error(`Invalid Feishu reply mode: ${mode}. Expected direct or thread.`);
}

function normalizeReplyOutput(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      text: String(value.text || "").trim(),
      provider: String(value.provider || "custom").trim() || "custom",
      linkedRunId: safeRunId(value.linkedRunId),
      model: value.model ? String(value.model) : null,
    };
  }
  return {
    text: String(value || "").trim(),
    provider: "static",
    linkedRunId: null,
    model: null,
  };
}

function safeRunId(value) {
  const id = String(value || "").trim();
  return /^ask_[A-Za-z0-9_-]+$/.test(id) ? id : null;
}

function replyMetadata(output) {
  return {
    provider: output.provider,
    linkedRunId: output.linkedRunId,
    model: output.model,
    textPreview: summarizeText(output.text),
  };
}

function summarizeText(text) {
  const value = String(text || "").trim();
  return value ? `[redacted ${value.length} chars]` : "";
}

function redactError(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/g, "$1[redacted]")
    .replace(/\b((?:app[_-]?secret|tenant[_-]?access[_-]?token|access[_-]?token|token|secret)\s*[:=]\s*)[^\s&;,]+/gi, "$1[redacted]");
}
