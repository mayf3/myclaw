import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createApprovalRequest, decideApproval, listApprovals, readApproval } from "../src/approvals.mjs";

test("approval requests can be listed and decided once", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-approvals-"));
  const approval = await createApprovalRequest(stateDir, {
    title: "Review staged migration",
    summary: "Review before apply",
    subject: { type: "openclaw-migration-stage", stageId: "stage_1" },
  });

  const list = await listApprovals(stateDir);
  assert.equal(list.length, 1);
  assert.equal(list[0].status, "pending");

  const read = await readApproval(stateDir, approval.approvalId);
  assert.equal(read.ok, true);
  assert.equal(read.approval.subject.stageId, "stage_1");

  const decided = await decideApproval(stateDir, approval.approvalId, {
    decision: "rejected",
    decidedBy: "test",
    reason: "not yet",
  });
  assert.equal(decided.ok, true);
  assert.equal(decided.approval.status, "rejected");
  assert.equal(decided.approval.decision.reason, "not yet");

  const repeated = await decideApproval(stateDir, approval.approvalId, { decision: "approved" });
  assert.equal(repeated.ok, false);
  assert.equal(repeated.status, "already_decided");
});

test("approval decisions are atomic under concurrent requests", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-approvals-race-"));
  const approval = await createApprovalRequest(stateDir, {
    title: "Concurrent approval",
    subject: { type: "test" },
  });

  const [first, second] = await Promise.all([
    decideApproval(stateDir, approval.approvalId, { decision: "approved" }),
    decideApproval(stateDir, approval.approvalId, { decision: "rejected" }),
  ]);
  const results = [first, second].map((item) => item.ok);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(results.filter((item) => !item).length, 1);

  const final = await readApproval(stateDir, approval.approvalId);
  assert.equal(["approved", "rejected"].includes(final.approval.status), true);
});
