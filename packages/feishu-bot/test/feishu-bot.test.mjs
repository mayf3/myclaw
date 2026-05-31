import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { listRuns } from "../../core/src/state.mjs";
import { handleFeishuMessageEvent, startFeishuBot } from "../src/index.mjs";

test("Feishu bot starts a websocket dispatcher and replies to message events", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-feishu-bot-"));
  const calls = { registered: null, start: null, reply: [] };
  const bot = await startFeishuBot({
    stateDir,
    config: {
      connectionMode: "websocket",
      appId: "app-id",
      appSecret: "app-secret",
      domain: "feishu",
    },
    sdkRuntime: createFakeSdkRuntime(calls),
    replyBuilder: ({ inbound }) => `ack ${inbound.text}`,
    logger: silentLogger(),
  });

  assert.equal(bot.ok, true);
  assert.equal(typeof calls.registered["im.message.receive_v1"], "function");
  assert.equal(calls.start.eventDispatcher, calls.dispatcher);
  await calls.registered["im.message.receive_v1"](feishuTextEvent({ text: "hello" }));

  assert.deepEqual(calls.reply[0], {
    path: { message_id: "om_msg" },
    data: { msg_type: "text", content: JSON.stringify({ text: "ack hello" }), reply_in_thread: true },
  });
  const runs = await listRuns(stateDir);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].envelope.ok, true);
  assert.equal(runs[0].envelope.result.inbound.conversationId, "oc_group");
  bot.stop();
});

test("Feishu bot handler skips app sender messages to avoid reply loops", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-feishu-bot-"));
  const calls = { reply: [] };
  const envelope = await handleFeishuMessageEvent(
    feishuTextEvent({ senderType: "app", text: "bot message" }),
    {
      client: createFakeClient(calls),
      logger: silentLogger(),
      processed: new Set(),
      replyBuilder: () => "should not send",
      stateDir,
    },
  );

  assert.equal(envelope.ok, true);
  assert.equal(envelope.result.skipped, true);
  assert.equal(calls.reply.length, 0);
});

test("Feishu bot handler skips messages outside ingress policy", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-feishu-bot-"));
  const calls = { reply: [] };
  const envelope = await handleFeishuMessageEvent(feishuTextEvent({ text: "hello", chatId: "oc_other" }), {
    client: createFakeClient(calls),
    logger: silentLogger(),
    processed: new Set(),
    replyBuilder: () => "should not send",
    ingressPolicy: { allowedChatIds: ["oc_group"] },
    stateDir,
  });

  assert.equal(envelope.ok, true);
  assert.equal(envelope.result.skipped, true);
  assert.equal(envelope.result.reason, "chat_not_allowed");
  assert.equal(calls.reply.length, 0);
});

test("Feishu bot handler records failed reply when app API returns an error", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-feishu-bot-"));
  const calls = { reply: [], replyResponse: { code: 99991663, msg: "forbidden" } };
  const envelope = await handleFeishuMessageEvent(feishuTextEvent({ text: "hello" }), {
    client: createFakeClient(calls),
    logger: silentLogger(),
    processed: new Set(),
    replyBuilder: () => "ack",
    ingressPolicy: {},
    stateDir,
  });

  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "feishu_bot_reply_failed");
  assert.match(envelope.error.message, /code=99991663/);
  assert.equal(envelope.events.some((event) => event.type === "feishu.bot.reply.completed"), false);
  assert.equal(envelope.events.some((event) => event.type === "feishu.bot.reply.failed"), true);
});

test("Feishu bot handler skips unsupported message types without retrying", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-feishu-bot-"));
  const calls = { reply: [] };
  const envelope = await handleFeishuMessageEvent(feishuTextEvent({ text: "image", messageType: "image" }), {
    client: createFakeClient(calls),
    logger: silentLogger(),
    processed: new Set(),
    replyBuilder: () => "should not send",
    ingressPolicy: {},
    stateDir,
  });

  assert.equal(envelope.ok, true);
  assert.equal(envelope.result.reason, "unsupported_message_type");
  assert.equal(calls.reply.length, 0);
});

function createFakeSdkRuntime(calls) {
  const client = createFakeClient(calls);
  calls.dispatcher = {
    register(handlers) {
      calls.registered = handlers;
    },
  };
  return {
    createClient() {
      return client;
    },
    createEventDispatcher() {
      return calls.dispatcher;
    },
    createWsClient() {
      return {
        async start(input) {
          calls.start = input;
        },
        close() {
          calls.closed = true;
        },
      };
    },
  };
}

function createFakeClient(calls) {
  return {
    im: {
      message: {
        async reply(input) {
          calls.reply.push(input);
          return calls.replyResponse ?? { code: 0, data: { message_id: "om_reply" } };
        },
      },
    },
  };
}

function feishuTextEvent({ text, senderType = "user", chatId = "oc_group", messageType = "text" }) {
  return {
    sender: { sender_type: senderType, sender_id: { open_id: "ou_user" } },
    message: {
      message_id: "om_msg",
      chat_id: chatId,
      chat_type: "group",
      message_type: messageType,
      content: JSON.stringify({ text }),
    },
  };
}

function silentLogger() {
  return { log() {}, error() {} };
}
