import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFeishuAdapterConfig,
  buildFeishuWebhookSignature,
  createFeishuReplayGuard,
  describeFeishuAdapterReadiness,
  normalizeFeishuEvent,
  validateFeishuVerificationToken,
  validateFeishuWebhookSignature,
} from "../src/index.mjs";

test("adapter config mirrors the OpenClaw Feishu security fields", () => {
  const config = buildFeishuAdapterConfig({
    env: {},
    verificationToken: " verify ",
    encryptKey: " encrypt ",
    domain: "lark",
  });
  const readiness = describeFeishuAdapterReadiness(config);

  assert.equal(config.domain, "lark");
  assert.equal(config.verificationToken, "verify");
  assert.equal(config.encryptKey, "encrypt");
  assert.equal(readiness.ok, true);
  assert.equal(readiness.signedWebhookReady, true);
});

test("adapter reports token-only webhook mode as partial", () => {
  const config = buildFeishuAdapterConfig({ env: {}, verificationToken: "verify" });
  const readiness = describeFeishuAdapterReadiness(config);

  assert.equal(readiness.ok, true);
  assert.equal(readiness.level, "partial");
  assert.equal(readiness.signedWebhookReady, false);
  assert.match(readiness.warnings[0], /encryptKey/);
});

test("adapter validates OpenClaw-compatible Feishu webhook signatures", () => {
  const rawBody = JSON.stringify({ token: "verify", challenge: "ok" });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = "nonce-test";
  const signature = buildFeishuWebhookSignature({ timestamp, nonce, encryptKey: "encrypt", rawBody });

  assert.equal(
    validateFeishuWebhookSignature({
      headers: {
        "x-lark-request-timestamp": timestamp,
        "x-lark-request-nonce": nonce,
        "x-lark-signature": signature,
      },
      rawBody,
      encryptKey: "encrypt",
    }).ok,
    true,
  );
  assert.equal(
    validateFeishuWebhookSignature({
      headers: {
        "x-lark-request-timestamp": timestamp,
        "x-lark-request-nonce": nonce,
        "x-lark-signature": signature.slice(2),
      },
      rawBody,
      encryptKey: "encrypt",
    }).code,
    "invalid_signature",
  );
  assert.equal(
    validateFeishuWebhookSignature({
      headers: {
        "x-lark-request-timestamp": "1711111111",
        "x-lark-request-nonce": nonce,
        "x-lark-signature": signature,
      },
      rawBody,
      encryptKey: "encrypt",
    }).code,
    "stale_signature",
  );
});

test("adapter validates verification tokens and replay ids", () => {
  assert.equal(validateFeishuVerificationToken({ body: { token: "verify" }, verificationToken: "verify" }).ok, true);
  assert.equal(validateFeishuVerificationToken({ body: { token: "bad" }, verificationToken: "verify" }).status, 401);

  const guard = createFeishuReplayGuard();
  assert.equal(guard.reserve("evt_1"), true);
  assert.equal(guard.reserve("evt_1"), false);
  assert.equal(guard.reserve(null), false);
  guard.release("evt_1");
  assert.equal(guard.reserve("evt_1"), true);
});

test("adapter normalizes Feishu text event callbacks", () => {
  const inbound = normalizeFeishuEvent({
    header: { event_id: "evt_1", create_time: "1710000000000" },
    event: {
      sender: { sender_id: { open_id: "ou_user" } },
      message: {
        message_id: "om_msg",
        chat_id: "oc_group",
        content: JSON.stringify({ text: " hello feishu " }),
      },
    },
  });

  assert.equal(inbound.id, "om_msg");
  assert.equal(inbound.channel, "feishu-event");
  assert.equal(inbound.sender.id, "ou_user");
  assert.equal(inbound.conversationId, "oc_group");
  assert.equal(inbound.text, "hello feishu");
});
