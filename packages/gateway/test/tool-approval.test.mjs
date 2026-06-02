import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { startGateway } from "../src/index.mjs";

test("gateway creates a smoke tool approval and executes only after approval", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-gateway-tool-"));
  const gateway = await startGateway({ port: 0, stateDir, openclawSource: stateDir, token: "secret" });
  try {
    const planned = await fetch(`${gateway.url}/api/tool-requests/smoke-note`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-myclaw-token": "secret" },
      body: JSON.stringify({ note: "human approves this" }),
    }).then((response) => response.json());
    assert.equal(planned.ok, true);
    assert.equal(planned.request.status, "pending_approval");
    assert.equal(planned.approval.subject.toolRequestId, planned.request.toolRequestId);

    const before = await fetch(`${gateway.url}/api/tool-requests`).then((response) => response.json());
    assert.equal(before.toolRequests[0].status, "pending_approval");

    const decision = await fetch(`${gateway.url}/api/approvals/${planned.approval.approvalId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-myclaw-token": "secret" },
      body: JSON.stringify({ decision: "approved", reason: "human smoke" }),
    }).then((response) => response.json());
    assert.equal(decision.ok, true);
    assert.equal(decision.tool.status, "completed");
    assert.equal(decision.tool.request.status, "completed");
    assert.equal(decision.tool.request.result.artifact.startsWith("tool-runs/"), true);

    const artifact = await readFile(path.join(stateDir, decision.tool.request.result.artifact), "utf8");
    assert.match(artifact, /human approves this/);

    const status = await fetch(`${gateway.url}/api/status`).then((response) => response.json());
    assert.equal(status.toolRequests[0].status, "completed");
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("gateway rejected smoke tool approval does not execute", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-gateway-tool-reject-"));
  const gateway = await startGateway({ port: 0, stateDir, openclawSource: stateDir, token: "secret" });
  try {
    const planned = await fetch(`${gateway.url}/api/tool-requests/smoke-note`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-myclaw-token": "secret" },
      body: JSON.stringify({ note: "do not execute" }),
    }).then((response) => response.json());

    const decision = await fetch(`${gateway.url}/api/approvals/${planned.approval.approvalId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-myclaw-token": "secret" },
      body: JSON.stringify({ decision: "rejected", reason: "human smoke" }),
    }).then((response) => response.json());
    assert.equal(decision.tool.status, "rejected");
    assert.equal(decision.tool.request.result, null);

    const listed = await fetch(`${gateway.url}/api/tool-requests`).then((response) => response.json());
    assert.equal(listed.toolRequests[0].status, "rejected");
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});
