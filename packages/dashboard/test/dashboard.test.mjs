import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createApprovalRequest } from "../../core/src/approvals.mjs";
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
  await createApprovalRequest(stateDir, {
    title: "Dashboard approval",
    subject: { type: "openclaw-migration-stage", stageId: "stage_dashboard" },
  });

  const dashboard = await startDashboard({ port: 0, stateDir, openclawSource: stateDir });
  try {
  const [
    htmlResponse,
    cssResponse,
    jsResponse,
    statusResponse,
    referenceResponse,
    feishuResponse,
    experimentsResponse,
    approvalsResponse,
    runResponse,
    badRun,
  ] =
    await Promise.all([
      fetch(`${dashboard.url}/`),
      fetch(`${dashboard.url}/assets/dashboard.css`),
        fetch(`${dashboard.url}/assets/dashboard.js`),
        fetch(`${dashboard.url}/api/status`),
      fetch(`${dashboard.url}/api/reference-completion`),
      fetch(`${dashboard.url}/api/feishu-adoption`),
      fetch(`${dashboard.url}/api/experiments`),
      fetch(`${dashboard.url}/api/approvals`),
      fetch(`${dashboard.url}/api/runs/in_test`),
      fetch(`${dashboard.url}/api/runs/..%2Fsecret`),
    ]);
    const html = await htmlResponse.text();
    const css = await cssResponse.text();
    const js = await jsResponse.text();
    const status = await statusResponse.json();
    const reference = await referenceResponse.json();
    const feishu = await feishuResponse.json();
    const experiments = await experimentsResponse.json();
    const approvals = await approvalsResponse.json();
    const run = await runResponse.json();

    assert.equal(htmlResponse.status, 200);
    assert.match(html, /MyClaw Dashboard/);
    assert.match(html, /assets\/dashboard\.js/);
    assert.match(css, /reference-row/);
    assert.match(js, /renderReferenceCompletion/);
    assert.match(js, /renderMilestones/);
    assert.match(js, /renderExperiments/);
    assert.match(js, /renderApprovals/);
    assert.match(js, /renderRunDetail/);
    assert.equal(status.ok, true);
    assert.equal(status.runs.length, 1);
    assert.equal(status.events.length, 2);
    assert.equal(status.channels.length, 4);
    assert.equal(status.milestones.currentPhase, "1.2");
    assert.equal(status.experiments.currentPhase, "1.2");
    assert.equal(status.approvals.length, 1);
    assert.equal(reference.referenceCompletion.modules.length, 8);
    assert.equal(reference.referenceCompletion.modules[0].criteria.length, 4);
    assert.equal(feishu.feishuAdoption.directUse, false);
    assert.equal(feishu.feishuAdapter.connectionMode, "webhook");
    assert.equal(experiments.experiments.experiments.some((item) => item.id === "E1"), true);
    assert.equal(approvals.approvals[0].title, "Dashboard approval");
    assert.equal(run.run.runId, "in_test");
    assert.equal(run.run.events.length, 1);
    assert.equal(badRun.status, 400);
  } finally {
    await new Promise((resolve) => dashboard.server.close(resolve));
  }
});
