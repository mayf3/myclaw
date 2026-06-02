import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { decideApproval } from "../../core/src/approvals.mjs";
import { createSmokeNoteToolRequest, listToolRequests, settleToolApprovalDecision } from "../src/smoke-note.mjs";

test("smoke note tool waits for approval before writing a tool run", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-tool-smoke-"));
  const { request, approval } = await createSmokeNoteToolRequest(stateDir, { note: "human checked" });
  assert.equal(request.status, "pending_approval");

  const approved = await decideApproval(stateDir, approval.approvalId, { decision: "approved" });
  const settled = await settleToolApprovalDecision(stateDir, approved.approval);
  assert.equal(settled.status, "completed");
  assert.equal(settled.request.result.artifact, `tool-runs/${settled.request.result.toolRunId}.json`);

  const runJson = await readFile(path.join(stateDir, settled.request.result.artifact), "utf8");
  assert.match(runJson, /human checked/);

  const listed = await listToolRequests(stateDir);
  assert.equal(listed[0].toolRequestId, request.toolRequestId);
  assert.equal(listed[0].status, "completed");
});

test("rejected smoke note approval never executes the tool", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-tool-reject-"));
  const { approval } = await createSmokeNoteToolRequest(stateDir, { note: "must not run" });
  const rejected = await decideApproval(stateDir, approval.approvalId, { decision: "rejected" });
  const settled = await settleToolApprovalDecision(stateDir, rejected.approval);

  assert.equal(settled.status, "rejected");
  assert.equal(settled.request.result, null);
});

test("smoke note tool request ignores unsafe caller-provided ids", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-tool-id-"));
  const { request } = await createSmokeNoteToolRequest(stateDir, {
    toolRequestId: "../escape",
    note: "id check",
  });

  assert.notEqual(request.toolRequestId, "../escape");
  assert.match(request.toolRequestId, /^tool_/);
});
