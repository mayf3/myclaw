import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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
    ingressPolicy: { unsafeOpenIngress: true, policyFile: false },
    replyBuilder: ({ inbound }) => `ack ${inbound.text}`,
    logger: silentLogger(),
  });

  assert.equal(bot.ok, true);
  assert.equal(typeof calls.registered["im.message.receive_v1"], "function");
  assert.equal(calls.start.eventDispatcher, calls.dispatcher);
  await calls.registered["im.message.receive_v1"](feishuTextEvent({ text: "hello" }));

  assert.deepEqual(calls.create[0], {
    params: { receive_id_type: "chat_id" },
    data: { receive_id: "oc_group", msg_type: "text", content: JSON.stringify({ text: "ack hello" }) },
  });
  const runs = await listRuns(stateDir);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].envelope.ok, true);
  assert.equal(runs[0].envelope.result.inbound.conversationId, "oc_group");
  assert.equal(runs[0].envelope.result.inbound.raw, undefined);
  assert.equal(runs[0].envelope.events.find((event) => event.type === "feishu.bot.reply.completed").replyMode, "direct");
  bot.stop();
});

test("Feishu bot stores replay state and skips duplicate events after restart", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-feishu-bot-"));
  const firstCalls = { registered: null, start: null, create: [] };
  const first = await startFeishuBot({
    stateDir,
    config: {
      connectionMode: "websocket",
      appId: "app-id",
      appSecret: "app-secret",
      domain: "feishu",
    },
    sdkRuntime: createFakeSdkRuntime(firstCalls),
    ingressPolicy: { unsafeOpenIngress: true, policyFile: false },
    replyBuilder: () => "ack",
    logger: silentLogger(),
  });
  await firstCalls.registered["im.message.receive_v1"](feishuTextEvent({ text: "hello" }));
  first.stop();

  const secondCalls = { registered: null, start: null, create: [] };
  const second = await startFeishuBot({
    stateDir,
    config: {
      connectionMode: "websocket",
      appId: "app-id",
      appSecret: "app-secret",
      domain: "feishu",
    },
    sdkRuntime: createFakeSdkRuntime(secondCalls),
    ingressPolicy: { unsafeOpenIngress: true, policyFile: false },
    replyBuilder: () => "ack again",
    logger: silentLogger(),
  });
  const duplicate = await secondCalls.registered["im.message.receive_v1"](feishuTextEvent({ text: "hello" }));

  assert.equal(duplicate.duplicate, true);
  assert.equal(firstCalls.create.length, 1);
  assert.equal(secondCalls.create.length, 0);
  second.stop();
});

test("Feishu bot records linked LLM run metadata from reply builders", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-feishu-bot-"));
  const calls = { reply: [], create: [] };
  const envelope = await handleFeishuMessageEvent(feishuTextEvent({ text: "hello" }), {
    client: createFakeClient(calls),
    logger: silentLogger(),
    processed: new Set(),
    replyBuilder: () => ({ text: "llm ack", provider: "llm", linkedRunId: "ask_123", model: "test-model" }),
    ingressPolicy: { unsafeOpenIngress: true },
    replyMode: "direct",
    stateDir,
  });

  assert.equal(envelope.ok, true);
  assert.equal(calls.create[0].data.content, JSON.stringify({ text: "llm ack" }));
  assert.equal(envelope.result.reply.builder.provider, "llm");
  assert.equal(envelope.result.reply.builder.linkedRunId, "ask_123");
  assert.equal(envelope.result.reply.builder.text, undefined);
  assert.equal(envelope.result.reply.builder.textPreview, "[redacted 7 chars]");
  assert.equal(envelope.events.find((event) => event.type === "feishu.bot.reply.completed").linkedRunId, "ask_123");
});

test("Feishu bot only accepts ask run ids as linked reply metadata", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-feishu-bot-"));
  const calls = { reply: [], create: [] };
  const envelope = await handleFeishuMessageEvent(feishuTextEvent({ text: "hello" }), {
    client: createFakeClient(calls),
    logger: silentLogger(),
    processed: new Set(),
    replyBuilder: () => ({ text: "llm ack", provider: "llm", linkedRunId: "oc_secret" }),
    ingressPolicy: { unsafeOpenIngress: true },
    stateDir,
  });

  assert.equal(envelope.ok, true);
  assert.equal(envelope.result.reply.builder.linkedRunId, null);
  assert.equal(JSON.stringify(envelope).includes("oc_secret"), false);
});

test("Feishu bot loads ingress policy from a local policy file", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-feishu-bot-"));
  const policyFile = path.join(stateDir, "feishu-policy.json");
  await writeFile(policyFile, `${JSON.stringify({ allowedChatIds: ["oc_group"] })}\n`, "utf8");
  const calls = { registered: null, start: null, create: [] };
  const bot = await startFeishuBot({
    stateDir,
    config: {
      connectionMode: "websocket",
      appId: "app-id",
      appSecret: "app-secret",
      domain: "feishu",
    },
    sdkRuntime: createFakeSdkRuntime(calls),
    ingressPolicy: { policyFile },
    replyBuilder: () => "should not send",
    logger: silentLogger(),
  });

  const skipped = await calls.registered["im.message.receive_v1"](feishuTextEvent({ text: "hello", chatId: "oc_other" }));

  assert.equal(skipped.result.reason, "chat_not_allowed");
  assert.equal(calls.create.length, 0);
  assert.match(await readFile(policyFile, "utf8"), /allowedChatIds/);
  bot.stop();
});

test("Feishu bot blocks open ingress unless a policy or unsafe override is explicit", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-feishu-bot-"));
  const calls = { reply: [] };
  const blocked = await handleFeishuMessageEvent(feishuTextEvent({ text: "hello" }), {
    client: createFakeClient(calls),
    logger: silentLogger(),
    processed: new Set(),
    replyBuilder: () => "should not send",
    ingressPolicy: {},
    stateDir,
  });

  assert.equal(blocked.ok, true);
  assert.equal(blocked.result.reason, "ingress_policy_required");
  assert.equal(calls.reply.length, 0);

  const allowed = await handleFeishuMessageEvent(feishuTextEvent({ text: "hello" }), {
    client: createFakeClient(calls),
    logger: silentLogger(),
    processed: new Set(),
    replyBuilder: () => "ack",
    ingressPolicy: { unsafeOpenIngress: true },
    stateDir,
  });

  assert.equal(allowed.ok, true);
  assert.equal(calls.create.length, 1);
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

test("Feishu bot handler can reply in thread when explicitly configured", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-feishu-bot-"));
  const calls = { reply: [], create: [] };
  const envelope = await handleFeishuMessageEvent(feishuTextEvent({ text: "hello" }), {
    client: createFakeClient(calls),
    logger: silentLogger(),
    processed: new Set(),
    replyBuilder: () => "thread ack",
    ingressPolicy: { unsafeOpenIngress: true },
    replyMode: "thread",
    stateDir,
  });

  assert.equal(envelope.ok, true);
  assert.equal(calls.create.length, 0);
  assert.deepEqual(calls.reply[0], {
    path: { message_id: "om_msg" },
    data: { msg_type: "text", content: JSON.stringify({ text: "thread ack" }), reply_in_thread: true },
  });
  assert.equal(envelope.events.find((event) => event.type === "feishu.bot.reply.completed").replyMode, "thread");
});

test("Feishu bot rejects invalid reply modes", async () => {
  await assert.rejects(
    () =>
      startFeishuBot({
        stateDir: "/tmp/myclaw-invalid-reply-mode",
        config: {
          connectionMode: "websocket",
          appId: "app-id",
          appSecret: "app-secret",
          domain: "feishu",
        },
        sdkRuntime: createFakeSdkRuntime({}),
        replyMode: "topic",
        logger: silentLogger(),
      }),
    /Invalid Feishu reply mode/,
  );
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
    ingressPolicy: { unsafeOpenIngress: true },
    stateDir,
  });

  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "feishu_bot_reply_failed");
  assert.match(envelope.error.message, /code=99991663/);
  assert.equal(envelope.events.some((event) => event.type === "feishu.bot.reply.completed"), false);
  assert.equal(envelope.events.some((event) => event.type === "feishu.bot.reply.failed"), true);
});

test("Feishu bot failed app replies preserve safe linked ask run ids", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-feishu-bot-"));
  const calls = { reply: [], replyResponse: { code: 99991663, msg: "forbidden" } };
  const envelope = await handleFeishuMessageEvent(feishuTextEvent({ text: "hello" }), {
    client: createFakeClient(calls),
    logger: silentLogger(),
    processed: new Set(),
    replyBuilder: () => ({ text: "llm ack", provider: "llm", linkedRunId: "ask_456" }),
    ingressPolicy: { unsafeOpenIngress: true },
    stateDir,
  });
  const failed = envelope.events.find((event) => event.type === "feishu.bot.reply.failed");

  assert.equal(envelope.ok, false);
  assert.equal(failed.linkedRunId, "ask_456");
  assert.equal(failed.replyProvider, "llm");
});

test("Feishu bot handler skips unsupported message types without retrying", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-feishu-bot-"));
  const calls = { reply: [] };
  const envelope = await handleFeishuMessageEvent(feishuTextEvent({ text: "image", messageType: "image" }), {
    client: createFakeClient(calls),
    logger: silentLogger(),
    processed: new Set(),
    replyBuilder: () => "should not send",
    ingressPolicy: { unsafeOpenIngress: true },
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
  calls.reply ??= [];
  calls.create ??= [];
  return {
    im: {
      message: {
        async reply(input) {
          calls.reply.push(input);
          return calls.replyResponse ?? { code: 0, data: { message_id: "om_reply" } };
        },
        async create(input) {
          calls.create.push(input);
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
