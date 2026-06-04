import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createEvent, okEnvelope } from "../../core/src/envelope.mjs";
import { createApprovalRequest } from "../../core/src/approvals.mjs";
import { recordAuditEvent } from "../../core/src/audit.mjs";
import { recordRun } from "../../core/src/state.mjs";
import { createSmokeNoteToolRequest } from "../../tools/src/smoke-note.mjs";
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
  const tool = await createSmokeNoteToolRequest(stateDir, { note: "route smoke" });
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
  assert.equal(experiments.payload.experiments.currentPhase, "1.8");
  assert.deepEqual(
    experiments.payload.experiments.layerRoadmap.map((item) => item.id),
    ["L0", "L1", "L2", "L3", "L4", "L5", "L6"],
  );
  assert.equal(experiments.payload.experiments.layerRoadmap[3].status, "partial");
  assert.equal(experiments.payload.experiments.experiments.some((item) => item.id === "E6A"), true);
  assert.equal(experiments.payload.experiments.experiments.some((item) => item.id === "E6B"), true);

  const approvals = await resolveControlGetRoute(url("/api/approvals"), context);
  assert.equal(approvals.status, 200);
  assert.equal(approvals.payload.approvals.some((item) => item.approvalId === approval.approvalId), true);

  const toolRequests = await resolveControlGetRoute(url("/api/tool-requests"), context);
  assert.equal(toolRequests.status, 200);
  assert.equal(toolRequests.payload.toolRequests[0].toolRequestId, tool.request.toolRequestId);
  assert.equal(toolRequests.payload.toolRequests[0].input.notePreview, "[redacted 11 chars]");
  assert.equal(JSON.stringify(toolRequests.payload).includes("route smoke"), false);

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
  assert.equal("stateDir" in status.payload, false);
  assert.equal(status.payload.state.label, "local-state");
  assert.equal(status.payload.runs[0].envelope.result.inbound.textPreview, "[redacted 22 chars]");
  assert.equal(run.payload.run.envelope.result.reply.raw, undefined);
  assert.equal(joined.includes("private feishu message"), false);
  assert.equal(joined.includes("private"), false);
  assert.equal(joined.includes("oc_secret"), false);
  assert.equal(joined.includes("ou_secret"), false);
  assert.equal(joined.includes("not-for-api"), false);
});

test("control read routes redact LLM answer payloads by default", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-control-route-"));
  await recordRun(
    stateDir,
    "ask_secret",
    okEnvelope({
      runId: "ask_secret",
      result: {
        type: "agent-answer",
        provider: "openai-responses",
        answer: "sensitive model answer",
        capabilities: { toolCalling: false, memory: false, streaming: false },
        toolCalls: [],
      },
      events: [createEvent("agent.ask.completed")],
    }),
  );
  const context = { stateDir, openclawSource: stateDir, service: "route-test" };

  const status = await resolveControlGetRoute(url("/api/status"), context);
  const run = await resolveControlGetRoute(url("/api/runs/ask_secret"), context);
  const joined = JSON.stringify({ status: status.payload.runs, run: run.payload.run });

  assert.equal(status.payload.runs[0].summary, "agent answer: [redacted 22 chars]");
  assert.equal(status.payload.runs[0].envelope.result.answer, "[redacted]");
  assert.equal(status.payload.runs[0].envelope.result.answerPreview, "[redacted 22 chars]");
  assert.equal(run.payload.run.envelope.result.answer, "[redacted]");
  assert.equal(run.payload.run.envelope.result.capabilities.toolCalling, false);
  assert.equal(joined.includes("sensitive model answer"), false);
});

test("control read routes redact agent config proposals by default", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-control-route-"));
  const approval = await createApprovalRequest(stateDir, {
    requestedBy: "agent.config",
    title: "Review agent config proposal: feishu-llm",
    summary: "configure sensitive group",
    subject: { type: "agent-config-proposal", target: "feishu-llm", proposalId: "cfg_secret", applySupported: false },
    evidence: [{ type: "run", runId: "cfg_secret" }, { type: "target", target: "feishu-llm" }],
  });
  await recordRun(
    stateDir,
    "cfg_secret",
    okEnvelope({
      runId: "cfg_secret",
      result: {
        type: "agent-config-proposal",
        target: "feishu-llm",
        sanitizedContext: { target: "feishu-llm", guardrails: { proposalOnly: true } },
        proposal: {
          summary: "configure sensitive group",
          readiness: "needs_config",
          commands: ["myclaw feishu-bot --reply-provider llm --llm-privacy-ack"],
          risks: ["risk"],
        },
      },
      events: [createEvent("agent.config.proposal.completed")],
    }),
  );
  const context = { stateDir, openclawSource: stateDir, service: "route-test" };

  const status = await resolveControlGetRoute(url("/api/status"), context);
  const run = await resolveControlGetRoute(url("/api/runs/cfg_secret"), context);
  const approvals = await resolveControlGetRoute(url("/api/approvals"), context);
  const approvalDetail = await resolveControlGetRoute(url(`/api/approvals/${approval.approvalId}`), context);
  const joined = JSON.stringify({ status: status.payload, run: run.payload.run, approvals: approvals.payload, approvalDetail: approvalDetail.payload });

  assert.equal(status.payload.runs[0].summary, "config proposal: [redacted 25 chars]");
  assert.equal(status.payload.runs[0].envelope.result.proposal, "[redacted]");
  assert.equal(status.payload.runs[0].envelope.result.proposalPreview.commandCount, 1);
  assert.equal(run.payload.run.envelope.result.proposal, "[redacted]");
  assert.equal(approvals.payload.approvals[0].summary, "Review-only config proposal for feishu-llm; details redacted.");
  assert.equal(approvalDetail.payload.approval.summary, "Review-only config proposal for feishu-llm; details redacted.");
  assert.equal(joined.includes("configure sensitive group"), false);
});

function url(pathname) {
  return new URL(pathname, "http://127.0.0.1");
}
