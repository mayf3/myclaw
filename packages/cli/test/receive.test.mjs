import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLI = path.resolve("packages/cli/src/index.mjs");

test("receive command normalizes inbound messages, replies, and records events", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-receive-"));
  const { stdout } = await execFileAsync(process.execPath, [
    CLI,
    "receive",
    "--channel",
    "console",
    "--from",
    "ou_user",
    "--conversation",
    "oc_group",
    "--text",
    "hello from inbound test",
    "--reply",
    "received",
    "--json",
    "--state-dir",
    stateDir,
  ]);

  const envelope = JSON.parse(stdout);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.status, "ok");
  assert.equal(envelope.result.inbound.channel, "console");
  assert.equal(envelope.result.inbound.sender.id, "ou_user");
  assert.equal(envelope.result.inbound.conversationId, "oc_group");
  assert.equal(envelope.result.inbound.text, "hello from inbound test");
  assert.equal(envelope.result.reply.channel, "console");
  assert.equal(envelope.result.reply.target, "oc_group");
  assert.equal(envelope.result.reply.text, "received");
  assert.equal(envelope.events.length, 4);

  const events = await readFile(path.join(stateDir, "events.jsonl"), "utf8");
  assert.match(events, /message\.receive\.started/);
  assert.match(events, /message\.receive\.completed/);
  assert.match(events, /message\.reply\.started/);
  assert.match(events, /message\.reply\.completed/);
});
