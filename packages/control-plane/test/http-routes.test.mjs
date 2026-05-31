import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createEvent, okEnvelope } from "../../core/src/envelope.mjs";
import { createApprovalRequest } from "../../core/src/approvals.mjs";
import { recordAuditEvent } from "../../core/src/audit.mjs";
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
  await recordAuditEvent(stateDir, {
    action: "gateway.message.receive",
    method: "POST",
    path: "/messages",
    status: 200,
    actor: { kind: "loopback", local: true },
    resource: { type: "message" },
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
  assert.equal(experiments.payload.experiments.currentPhase, "1.5");
  assert.deepEqual(
    experiments.payload.experiments.layerRoadmap.map((item) => item.id),
    ["L0", "L1", "L2", "L3", "L4", "L5", "L6"],
  );

  const approvals = await resolveControlGetRoute(url("/api/approvals"), context);
  assert.equal(approvals.status, 200);
  assert.equal(approvals.payload.approvals[0].approvalId, approval.approvalId);

  const audit = await resolveControlGetRoute(url("/api/audit"), context);
  assert.equal(audit.status, 200);
  assert.equal(audit.payload.audit[0].action, "gateway.message.receive");

  const approvalDetail = await resolveControlGetRoute(url(`/api/approvals/${approval.approvalId}`), context);
  assert.equal(approvalDetail.status, 200);
  assert.equal(approvalDetail.payload.approval.title, "Route approval");

  const missing = await resolveControlGetRoute(url("/nope"), context);
  assert.equal(missing.handled, false);
});

test("control read routes redact Feishu message payloads", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-control-route-"));
  await recordRun(
    stateDir,
    "fb_secret",
    okEnvelope({
      runId: "fb_secret",
      result: {
        inbound: {
          channel: "feishu-event",
          id: "om_secret",
          text: "private feishu message",
          conversationId: "oc_secret",
          sender: { id: "ou_secret" },
        },
        reply: {
          provider: "feishu",
          mode: "app",
          ok: true,
          target: "oc_secret",
          raw: { token: "not-for-api" },
        },
      },
      events: [
        createEvent("feishu.bot.reply.completed", {
          conversationId: "oc_secret",
          senderId: "ou_secret",
          target: "oc_secret",
        }),
      ],
    }),
  );
  const context = { stateDir, openclawSource: stateDir, service: "route-test" };

  const status = await resolveControlGetRoute(url("/api/status"), context);
  const run = await resolveControlGetRoute(url("/api/runs/fb_secret"), context);
  const events = await resolveControlGetRoute(url("/api/events"), context);
  const joined = JSON.stringify({ status: status.payload, run: run.payload, events: events.payload });

  assert.equal(status.payload.runs[0].envelope.result.inbound.text, "[redacted]");
  assert.equal(status.payload.runs[0].envelope.result.inbound.textPreview, "[redacted 22 chars]");
  assert.equal(run.payload.run.envelope.result.reply.raw, undefined);
  assert.equal(joined.includes("private feishu message"), false);
  assert.equal(joined.includes("private"), false);
  assert.equal(joined.includes("oc_secret"), false);
  assert.equal(joined.includes("ou_secret"), false);
  assert.equal(joined.includes("not-for-api"), false);
});

function url(pathname) {
  return new URL(pathname, "http://127.0.0.1");
}
