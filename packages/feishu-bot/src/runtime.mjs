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
import { buildFeishuIngressPolicy, evaluateFeishuIngressPolicy, isSupportedTextEvent } from "./ingress-policy.mjs";
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

  const sdkRuntime = options.sdkRuntime ?? (await loadFeishuSdkRuntime());
  const client = sdkRuntime.createClient(config);
  const eventDispatcher = sdkRuntime.createEventDispatcher(config);
  const processed = new Set();
  const context = {
    client,
    config,
    logger: options.logger ?? console,
    replyBuilder: options.replyBuilder ?? ((input) => buildDefaultFeishuReply(input)),
    ingressPolicy: buildFeishuIngressPolicy(options.ingressPolicy),
    stateDir: resolveStateDir(options.stateDir),
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
  try {
    if (event?.sender?.sender_type === "app") {
      return await recordSkipped(context.stateDir, runId, events, "bot_sender");
    }
    if (!isSupportedTextEvent(event)) {
      return await recordSkipped(context.stateDir, runId, events, "unsupported_message_type");
    }

    const inbound = normalizeFeishuEvent(event);
    const policyDecision = evaluateFeishuIngressPolicy({ event, inbound, policy: context.ingressPolicy });
    if (!policyDecision.ok) {
      return await recordSkipped(context.stateDir, runId, events, policyDecision.reason);
    }

    const replyText = String(await context.replyBuilder({ inbound, event })).trim();
    if (!replyText) {
      throw new Error("Feishu reply builder returned empty text.");
    }
    events.push(
      createEvent("feishu.bot.reply.started", {
        messageId: inbound.id,
        conversationId: inbound.conversationId,
      }),
    );
    const reply = await sendFeishuAppText({
      client: context.client,
      text: replyText,
      chatId: inbound.conversationId,
      replyToMessageId: inbound.id,
      replyInThread: true,
    });
    if (!reply.ok) {
      throw new Error(`Feishu app reply failed: code=${reply.code}${reply.message ? ` message=${reply.message}` : ""}`);
    }
    events.push(
      createEvent("feishu.bot.reply.completed", {
        messageId: reply.messageId,
        target: reply.target,
      }),
    );
    const envelope = okEnvelope({ runId, result: { inbound, reply }, events });
    await recordRun(context.stateDir, runId, envelope);
    return envelope;
  } catch (error) {
    if (eventId) {
      context.processed.delete(eventId);
    }
    events.push(createEvent("feishu.bot.reply.failed", { message: redactError(error) }));
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

async function recordSkipped(stateDir, runId, events, reason) {
  events.push(createEvent("feishu.bot.message.skipped", { reason }));
  const envelope = okEnvelope({ runId, result: { skipped: true, reason }, events });
  await recordRun(stateDir, runId, envelope);
  return envelope;
}

function redactError(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/g, "$1[redacted]")
    .replace(/\b((?:app[_-]?secret|tenant[_-]?access[_-]?token|access[_-]?token|token|secret)\s*[:=]\s*)[^\s&;,]+/gi, "$1[redacted]");
}
