import {
  buildFeishuAdapterConfig,
  createFeishuReplayGuard,
  getFeishuEventId,
  parseFeishuWebhookBody,
  validateFeishuVerificationToken,
  validateFeishuWebhookSignature,
} from "../../../feishu-adapter/src/index.mjs";
import { receiveMessage } from "../../../runtime/src/messages.mjs";
import { isLoopbackHost } from "../auth.mjs";
import { readTextBody, sendJson } from "../http.mjs";

const replayGuard = createFeishuReplayGuard();

export async function handlePostFeishuEvent(request, response, context) {
  const rawBody = await readTextBody(request);
  const config = buildFeishuAdapterConfig({
    verificationToken: context.feishuVerifyToken,
    encryptKey: context.feishuEncryptKey,
  });

  if (config.encryptKey) {
    const signature = validateFeishuWebhookSignature({
      headers: request.headers,
      rawBody,
      encryptKey: config.encryptKey,
    });
    if (!signature.ok) {
      sendJson(response, 401, { ok: false, error: { code: signature.code, message: signature.message } });
      return;
    }
  }

  let body;
  try {
    body = parseFeishuWebhookBody(rawBody);
  } catch {
    sendJson(response, 400, { ok: false, error: { code: "invalid_json", message: "Request body must be valid JSON." } });
    return;
  }

  if (body.encrypt) {
    sendJson(response, 501, {
      ok: false,
      error: {
        code: "feishu_encrypt_not_supported",
        message: "Encrypted Feishu callbacks are not supported yet.",
      },
    });
    return;
  }
  const token = validateFeishuVerificationToken({
    body,
    verificationToken: config.verificationToken,
    allowUnsignedDev: isLoopbackHost(context.host),
  });
  if (!token.ok) {
    sendJson(response, token.status, { ok: false, error: { code: token.code, message: token.message } });
    return;
  }
  if (body.challenge) {
    sendJson(response, 200, { challenge: String(body.challenge) });
    return;
  }

  const eventId = getFeishuEventId(body);
  if (!eventId) {
    sendJson(response, 400, { ok: false, error: { code: "missing_feishu_event_id" } });
    return;
  }
  if (!replayGuard.reserve(eventId)) {
    sendJson(response, 200, { ok: true, duplicate: true, eventId });
    return;
  }

  const envelope = await receiveMessage({
    channelId: "feishu-event",
    rawInbound: body,
    stateDir: context.stateDir,
    source: "feishu-event",
  });
  if (eventId && !envelope.ok) {
    replayGuard.release(eventId);
  }
  sendJson(response, envelope.ok ? 200 : 422, {
    ...envelope,
    ...(eventId ? { eventId } : {}),
  });
}
