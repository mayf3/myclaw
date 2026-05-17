import { receiveMessage } from "../../../runtime/src/messages.mjs";
import { readJsonBody, sendJson } from "../http.mjs";

export async function handlePostMessage(request, response, context) {
  const { body } = await readJsonBody(request);
  const text = body.text ?? body.message?.text;
  if (!String(text || "").trim()) {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: "missing_text",
        message: "Missing message text.",
      },
    });
    return;
  }

  const envelope = await receiveMessage({
    text,
    channelId: body.channel || body.channelId || "console",
    senderId: body.from || body.senderId || body.sender?.id || "gateway-user",
    senderName: body.senderName || body.sender?.displayName,
    conversationId: body.conversation || body.conversationId || body.target,
    replyText: body.reply || body.replyText || "",
    webhookUrl: body.webhookUrl,
    stateDir: context.stateDir,
    source: "gateway",
    raw: body,
  });

  sendJson(response, envelope.ok ? 200 : 422, envelope);
}
