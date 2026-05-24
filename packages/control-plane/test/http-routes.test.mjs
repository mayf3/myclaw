import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createEvent, okEnvelope } from "../../core/src/envelope.mjs";
import { createApprovalRequest } from "../../core/src/approvals.mjs";
import { recordRun } from "../../core/src/state.mjs";
import { resolveControlGetRoute } from "../src/http-routes.mjs";

test("control get route adapter resolves shared read routes", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-control-route-"));
  await recordRun(
    stateDir,
    "route_test",
    okEnvelope({
      runId: "route_test",
      result: { text: "ok" },
      events: [createEvent("route.test")],
    }),
  );
  const approval = await createApprovalRequest(stateDir, {
    title: "Route approval",
    subject: { type: "test" },
  });
  const context = { stateDir, openclawSource: stateDir, service: "route-test" };

  const health = await resolveControlGetRoute(url("/api/health"), context);
  assert.equal(health.handled, true);
  assert.equal(health.status, 200);
  assert.equal(health.payload.service, "route-test");

  const runs = await resolveControlGetRoute(url("/api/runs?limit=not-a-number"), context);
  assert.equal(runs.status, 200);
  assert.equal(runs.payload.runs.length, 1);

  const run = await resolveControlGetRoute(url("/api/runs/route_test"), context);
  assert.equal(run.status, 200);
  assert.equal(run.payload.run.runId, "route_test");

  const unsafeRun = await resolveControlGetRoute(url("/api/runs/..%2Fsecret"), context);
  assert.equal(unsafeRun.status, 400);

  const experiments = await resolveControlGetRoute(url("/api/experiments"), context);
  assert.equal(experiments.status, 200);
  assert.equal(experiments.payload.experiments.currentPhase, "1.2");
  assert.deepEqual(
    experiments.payload.experiments.layerRoadmap.map((item) => item.id),
    ["L0", "L1", "L2", "L3", "L4", "L5", "L6"],
  );

  const approvals = await resolveControlGetRoute(url("/api/approvals"), context);
  assert.equal(approvals.status, 200);
  assert.equal(approvals.payload.approvals[0].approvalId, approval.approvalId);

  const approvalDetail = await resolveControlGetRoute(url(`/api/approvals/${approval.approvalId}`), context);
  assert.equal(approvalDetail.status, 200);
  assert.equal(approvalDetail.payload.approval.title, "Route approval");

  const missing = await resolveControlGetRoute(url("/nope"), context);
  assert.equal(missing.handled, false);
});

function url(pathname) {
  return new URL(pathname, "http://127.0.0.1");
}
