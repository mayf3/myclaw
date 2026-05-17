import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createEvent, okEnvelope } from "../../core/src/envelope.mjs";
import { recordRun } from "../../core/src/state.mjs";
import { startDashboard } from "../src/index.mjs";

test("dashboard serves HTML and status API", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-dashboard-"));
  await recordRun(
    stateDir,
    "in_test",
    okEnvelope({
      runId: "in_test",
      result: {
        inbound: {
          channel: "console",
          text: "hi",
        },
      },
      events: [createEvent("message.receive.started")],
    }),
  );

  const dashboard = await startDashboard({ port: 0, stateDir, openclawSource: stateDir });
  try {
    const [htmlResponse, statusResponse] = await Promise.all([
      fetch(`${dashboard.url}/`),
      fetch(`${dashboard.url}/api/status`),
    ]);
    const html = await htmlResponse.text();
    const status = await statusResponse.json();

    assert.equal(htmlResponse.status, 200);
    assert.match(html, /MyClaw Dashboard/);
    assert.equal(status.ok, true);
    assert.equal(status.runs.length, 1);
    assert.equal(status.events.length, 1);
    assert.equal(status.channels.length, 4);
  } finally {
    await new Promise((resolve) => dashboard.server.close(resolve));
  }
});
