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
