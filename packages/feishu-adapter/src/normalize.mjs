import { randomUUID } from "node:crypto";

export function getFeishuEventId(body = {}) {
  return body.header?.event_id || body.event?.message?.message_id || body.message?.message_id || null;
}

export function normalizeFeishuEvent(input = {}) {
  const header = input.header ?? {};
  const event = input.event ?? input;
  const message = event.message ?? input.message ?? {};
  const sender = event.sender ?? input.sender ?? {};
  const content = parseFeishuContent(message.content ?? input.content ?? {});
  const text = content.text ?? message.text ?? input.text ?? event.text;
  if (!String(text || "").trim()) {
    throw new Error("Inbound Feishu event is missing text.");
  }

  const senderId =
    sender.sender_id?.open_id ||
    sender.sender_id?.user_id ||
    sender.sender_id?.union_id ||
    sender.open_id ||
    sender.user_id ||
    input.senderId ||
    "feishu-user";
  const conversationId =
    message.chat_id || event.chat_id || input.chatId || input.conversationId || input.conversation || senderId;
  return {
    id: String(message.message_id || header.event_id || input.id || input.messageId || `in_${randomUUID().slice(0, 8)}`),
    channel: "feishu-event",
    conversationId: String(conversationId),
    sender: { id: String(senderId) },
    text: String(text).trim(),
    receivedAt: normalizeFeishuTime(header.create_time) || input.receivedAt || new Date().toISOString(),
    raw: input,
  };
}

function parseFeishuContent(value) {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return { text: value };
    }
  }
  return typeof value === "object" ? value : {};
}

function normalizeFeishuTime(value) {
  if (!value) {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1000;
  return new Date(milliseconds).toISOString();
}
