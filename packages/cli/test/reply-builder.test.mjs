import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCliReplyBuilder } from "../src/reply-builder.mjs";

test("LLM Feishu reply builder requires explicit privacy acknowledgement", () => {
  assert.throws(
    () => buildCliReplyBuilder({ replyProvider: "llm" }, {}),
    /llm-privacy-ack|MYCLAW_FEISHU_LLM_ENABLED/,
  );
});

test("LLM Feishu reply builder rejects unsafe open ingress", () => {
  assert.throws(
    () => buildCliReplyBuilder({ replyProvider: "llm", llmPrivacyAck: "true", unsafeOpenIngress: "true" }, {}),
    /unsafe open ingress/,
  );
});

test("LLM Feishu reply builder accepts environment opt-in", () => {
  const builder = buildCliReplyBuilder({ replyProvider: "llm" }, { MYCLAW_FEISHU_LLM_ENABLED: "1" });
  assert.equal(typeof builder, "function");
});
