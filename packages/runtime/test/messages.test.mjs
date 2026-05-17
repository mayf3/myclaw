import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { receiveMessage, sendMessage } from "../src/messages.mjs";

test("runtime send and receive persist shared envelopes", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-runtime-"));
  const sent = await sendMessage({ text: "hello", stateDir, source: "test" });
  const received = await receiveMessage({
    text: "hi",
    senderId: "ou_user",
    conversationId: "oc_group",
    replyText: "received",
    stateDir,
    source: "test",
  });

  assert.equal(sent.ok, true);
  assert.equal(received.ok, true);
  assert.equal(received.result.inbound.conversationId, "oc_group");
  assert.equal(received.result.reply.target, "oc_group");

  const events = await readFile(path.join(stateDir, "events.jsonl"), "utf8");
  assert.match(events, /message\.send\.completed/);
  assert.match(events, /message\.receive\.completed/);
  assert.match(events, /message\.reply\.completed/);
});
