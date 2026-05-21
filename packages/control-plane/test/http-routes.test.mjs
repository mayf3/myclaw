import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createEvent, okEnvelope } from "../../core/src/envelope.mjs";
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
  assert.equal(experiments.payload.experiments.currentPhase, "1.0");

  const missing = await resolveControlGetRoute(url("/nope"), context);
  assert.equal(missing.handled, false);
});

function url(pathname) {
  return new URL(pathname, "http://127.0.0.1");
}
