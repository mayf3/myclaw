import { createEvent, createRunId, errorEnvelope, okEnvelope } from "../../core/src/envelope.mjs";
import { recordRun, resolveStateDir } from "../../core/src/state.mjs";
import { resolveChannel } from "../../channels/src/index.mjs";

export async function sendMessage(options = {}) {
  const text = String(options.text || "").trim();
  if (!text) {
    throw new Error("Missing message text.");
  }

  const started = Date.now();
  const runId = createRunId("msg");
  const channelId = options.channelId || options.channel || "console";
  const events = [
    createEvent("message.send.started", {
      channel: channelId,
      target: options.target || null,
    }),
  ];

  let envelope;
  try {
    const channel = resolveChannel(channelId, { webhookUrl: options.webhookUrl });
    const result = await channel.send({
      text,
      target: options.target,
      metadata: {
        runId,
        source: options.source || "runtime",
      },
    });
    events.push(
      createEvent("message.send.completed", {
        channel: result.channel,
        messageId: result.messageId,
        target: result.target,
      }),
    );
    envelope = okEnvelope({
      runId,
      result,
      events,
      usage: {
        elapsedMs: Date.now() - started,
      },
    });
  } catch (error) {
    events.push(
      createEvent("message.send.failed", {
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    envelope = errorEnvelope({
      runId,
      code: "send_failed",
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
      events,
      usage: {
        elapsedMs: Date.now() - started,
      },
    });
  }

  await persistEnvelope(options.stateDir, runId, envelope);
  return envelope;
}

export async function receiveMessage(options = {}) {
  const text = String(options.text || "").trim();
  if (!text) {
    throw new Error("Missing message text.");
  }

  const started = Date.now();
  const runId = createRunId("in");
  const channelId = options.channelId || options.channel || "console";
  const conversationId = options.conversationId || options.conversation || options.target;
  const senderId = options.senderId || options.from || "local-user";
  const events = [
    createEvent("message.receive.started", {
      channel: channelId,
      conversationId: conversationId || null,
      senderId,
    }),
  ];

  let envelope;
  try {
    const channel = resolveChannel(channelId, { webhookUrl: options.webhookUrl });
    if (typeof channel.normalizeInbound !== "function") {
      throw new Error(`Channel ${channel.id} does not support inbound messages.`);
    }

    const inbound = channel.normalizeInbound({
      text,
      senderId,
      senderName: options.senderName,
      conversationId,
      raw: {
        source: options.source || "runtime",
        channel: channel.id,
        ...(options.raw && typeof options.raw === "object" ? options.raw : {}),
      },
    });
    events.push(
      createEvent("message.receive.completed", {
        channel: inbound.channel,
        messageId: inbound.id,
        conversationId: inbound.conversationId,
        senderId: inbound.sender.id,
      }),
    );

    const replyText = String(options.replyText || options.reply || "").trim();
    let reply;
    if (replyText) {
      if (typeof channel.send !== "function") {
        throw new Error(`Channel ${channel.id} does not support replies.`);
      }
      events.push(
        createEvent("message.reply.started", {
          channel: channel.id,
          target: inbound.conversationId,
        }),
      );
      reply = await channel.send({
        text: replyText,
        target: inbound.conversationId,
        metadata: {
          runId,
          inboundMessageId: inbound.id,
          source: options.source || "runtime",
        },
      });
      events.push(
        createEvent("message.reply.completed", {
          channel: reply.channel,
          messageId: reply.messageId,
          target: reply.target,
        }),
      );
    }

    envelope = okEnvelope({
      runId,
      result: {
        inbound,
        ...(reply ? { reply } : {}),
      },
      events,
      usage: {
        elapsedMs: Date.now() - started,
      },
    });
  } catch (error) {
    events.push(
      createEvent("message.receive.failed", {
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    envelope = errorEnvelope({
      runId,
      code: "receive_failed",
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
      events,
      usage: {
        elapsedMs: Date.now() - started,
      },
    });
  }

  await persistEnvelope(options.stateDir, runId, envelope);
  return envelope;
}

async function persistEnvelope(stateDirInput, runId, envelope) {
  const stateDir = resolveStateDir(stateDirInput);
  await recordRun(stateDir, runId, envelope);
}
