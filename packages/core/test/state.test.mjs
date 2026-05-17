import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createEvent, okEnvelope } from "../src/envelope.mjs";
import { listRuns, readEvents, readRun, recordRun } from "../src/state.mjs";

test("state reader lists runs and events", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-state-"));
  const envelope = okEnvelope({
    runId: "msg_test",
    result: {
      channel: "console",
      messageId: "console_test",
      text: "hello",
    },
    events: [createEvent("message.send.started"), createEvent("message.send.completed")],
  });

  await recordRun(stateDir, "msg_test", envelope);
  const runs = await listRuns(stateDir);
  const events = await readEvents(stateDir);

  assert.equal(runs.length, 1);
  assert.equal(runs[0].runId, "msg_test");
  assert.equal(runs[0].summary, "console send: hello");
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "message.send.completed");
});

test("state reader rejects unsafe run ids", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-state-"));
  const invalid = await readRun(stateDir, "../secret");

  assert.equal(invalid.ok, false);
  assert.equal(invalid.status, "invalid_run_id");
  assert.equal(invalid.envelope, null);
});
