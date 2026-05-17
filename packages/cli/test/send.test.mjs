import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLI = path.resolve("packages/cli/src/index.mjs");

test("send command returns a JSON envelope and records events", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-send-"));
  const { stdout } = await execFileAsync(process.execPath, [
    CLI,
    "send",
    "--text",
    "hello from test",
    "--json",
    "--state-dir",
    stateDir,
  ]);
  const envelope = JSON.parse(stdout);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.status, "ok");
  assert.equal(envelope.result.channel, "console");
  assert.equal(envelope.result.text, "hello from test");
  assert.equal(envelope.events.length, 2);

  const events = await readFile(path.join(stateDir, "events.jsonl"), "utf8");
  assert.match(events, /message\.send\.started/);
  assert.match(events, /message\.send\.completed/);
});
