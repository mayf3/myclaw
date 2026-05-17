import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createChannelRegistry,
  createConsoleChannel,
  createFeishuEventChannel,
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
      ["feishu-event", true, false],
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

test("feishu event channel normalizes text callbacks", () => {
  const channel = createFeishuEventChannel();
  const inbound = channel.normalizeInbound({
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
  assert.equal(inbound.text, "hello feishu");
  assert.equal(inbound.sender.id, "ou_user");
  assert.equal(inbound.conversationId, "oc_group");
});

test("channel list exposes the initial outbound surfaces", () => {
  assert.deepEqual(
    listChannels().map((channel) => channel.id),
    ["console", "webhook", "feishu-webhook", "feishu-event"],
  );
});
