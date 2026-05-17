import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createChannelRegistry,
  createConsoleChannel,
  listChannels,
  normalizeInboundMessage,
  resolveChannel,
} from "../src/index.mjs";

test("console channel returns a send result", async () => {
  const channel = createConsoleChannel();
  const result = await channel.send({ text: "hello", target: "local" });
  assert.equal(result.channel, "console");
  assert.equal(result.target, "local");
  assert.equal(result.text, "hello");
  assert.match(result.messageId, /^console_/);
});

test("lark-webhook alias resolves to feishu-webhook", () => {
  const channel = resolveChannel("lark-webhook", { webhookUrl: "http://127.0.0.1/hook" });
  assert.equal(channel.id, "feishu-webhook");
});

test("registry lists channel capabilities", () => {
  const registry = createChannelRegistry({ env: {} });
  assert.deepEqual(
    registry.list().map((channel) => [channel.id, channel.capabilities.inbound, channel.capabilities.outbound]),
    [
      ["console", true, true],
      ["webhook", false, true],
      ["feishu-webhook", false, true],
    ],
  );
});

test("console channel normalizes inbound messages", () => {
  const channel = createConsoleChannel();
  const inbound = channel.normalizeInbound({
    text: " hi ",
    senderId: "ou_user",
    senderName: "Yanfen",
    conversationId: "oc_group",
  });
  assert.equal(inbound.channel, "console");
  assert.equal(inbound.text, "hi");
  assert.equal(inbound.sender.id, "ou_user");
  assert.equal(inbound.sender.displayName, "Yanfen");
  assert.equal(inbound.conversationId, "oc_group");
  assert.match(inbound.id, /^in_/);
});

test("generic inbound normalizer rejects empty text", () => {
  assert.throws(() => normalizeInboundMessage({ text: "" }), /missing text/);
});

test("channel list exposes the initial outbound surfaces", () => {
  assert.deepEqual(
    listChannels().map((channel) => channel.id),
    ["console", "webhook", "feishu-webhook"],
  );
});
