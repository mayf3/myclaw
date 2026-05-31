export function buildFeishuOutboundPayload(message = {}) {
  const card = message.card || message.metadata?.card;
  if (card) {
    return {
      msg_type: "interactive",
      card,
    };
  }
  const text = String(message.text || "").trim();
  if (!text) {
    throw new Error("Feishu outbound message is missing text.");
  }
  return {
    msg_type: "text",
    content: { text },
  };
}

export function normalizeFeishuSendResult(options = {}) {
  const parsed = parseJson(options.responseText);
  const code = parsed?.code ?? parsed?.StatusCode ?? 0;
  const message = parsed?.msg ?? parsed?.StatusMessage ?? parsed?.message ?? "";
  return {
    provider: "feishu",
    mode: "webhook",
    ok: Number(code) === 0,
    status: options.status,
    code,
    message,
    messageId: parsed?.data?.message_id || parsed?.message_id || null,
    target: options.target || null,
    threadId: options.threadId || null,
    raw: parsed ?? options.responseText ?? "",
  };
}

export function buildFeishuAppTextPayload({ text, replyInThread = true } = {}) {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    throw new Error("Feishu app message is missing text.");
  }
  return {
    msg_type: "text",
    content: JSON.stringify({ text: normalizedText }),
    ...(replyInThread ? { reply_in_thread: true } : {}),
  };
}

export async function sendFeishuAppText(options = {}) {
  const client = options.client;
  if (!client?.im?.message) {
    throw new Error("Feishu app client is missing im.message API.");
  }
  const payload = buildFeishuAppTextPayload({
    text: options.text,
    replyInThread: options.replyInThread !== false,
  });
  const replyToMessageId = String(options.replyToMessageId || "").trim();
  const chatId = String(options.chatId || options.target || "").trim();
  const response = replyToMessageId
    ? await client.im.message.reply({
        path: { message_id: replyToMessageId },
        data: payload,
      })
    : await client.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: chatId,
          msg_type: payload.msg_type,
          content: payload.content,
        },
      });
  return normalizeFeishuAppSendResult({
    response,
    target: chatId || replyToMessageId,
    replyToMessageId: replyToMessageId || null,
  });
}

export function normalizeFeishuAppSendResult(options = {}) {
  const response = options.response ?? {};
  const code = response.code ?? response.StatusCode ?? 0;
  const message = response.msg ?? response.StatusMessage ?? response.message ?? "";
  return {
    provider: "feishu",
    mode: "app",
    ok: Number(code) === 0,
    status: options.status ?? null,
    code,
    message,
    messageId: response.data?.message_id || response.message_id || null,
    target: options.target || null,
    replyToMessageId: options.replyToMessageId || null,
    raw: response,
  };
}

function parseJson(text) {
  if (!String(text || "").trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
