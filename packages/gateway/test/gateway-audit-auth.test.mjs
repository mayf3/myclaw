import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { startGateway } from "../src/index.mjs";

test("gateway writes mutation audit records without request bodies or tokens", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-gateway-audit-"));
  const gateway = await startGateway({ port: 0, stateDir, openclawSource: stateDir, token: "secret" });
  try {
    const denied = await fetch(`${gateway.url}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "audit body must not leak" }),
    });
    assert.equal(denied.status, 401);

    const allowed = await fetch(`${gateway.url}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-myclaw-token": "secret" },
      body: JSON.stringify({ text: "allowed audit body must not leak" }),
    });
    assert.equal(allowed.status, 200);

    await waitForAuditFlush();
    const payload = await fetch(`${gateway.url}/api/audit`).then((response) => response.json());
    assert.equal(payload.ok, true);
    assert.equal(payload.audit.length, 2);
    assert.equal(payload.audit.some((item) => item.status === 401 && item.outcome === "blocked"), true);
    assert.equal(payload.audit.some((item) => item.status === 200 && item.outcome === "allowed"), true);
    assert.equal(payload.audit.some((item) => item.actor.tokenProvided), true);
    const joined = JSON.stringify(payload);
    assert.equal(joined.includes("secret"), false);
    assert.equal(joined.includes("audit body must not leak"), false);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("gateway accepts scoped tokens for matching routes only", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-gateway-scoped-token-"));
  const gateway = await startGateway({
    host: "0.0.0.0",
    port: 0,
    stateDir,
    openclawSource: stateDir,
    scopedTokens: [
      { token: "message-token", scopes: ["message:write"] },
      { token: "events-token", scopes: ["events:read"] },
      { token: "control-token", scopes: ["control:read"] },
    ],
  });
  const localUrl = `http://127.0.0.1:${gateway.server.address().port}`;
  try {
    const health = await fetch(`${localUrl}/api/health`);
    assert.equal(health.status, 200);

    const deniedStatus = await fetch(`${localUrl}/api/status`);
    assert.equal(deniedStatus.status, 401);

    const deniedStatusByMessageToken = await fetch(`${localUrl}/api/status`, {
      headers: { "x-myclaw-token": "message-token" },
    });
    assert.equal(deniedStatusByMessageToken.status, 403);

    const allowedStatus = await fetch(`${localUrl}/api/status`, {
      headers: { "x-myclaw-token": "control-token" },
    });
    assert.equal(allowedStatus.status, 200);

    const deniedWrite = await fetch(`${localUrl}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-myclaw-token": "events-token" },
      body: JSON.stringify({ text: "blocked by scope" }),
    });
    assert.equal(deniedWrite.status, 403);
    assert.equal((await deniedWrite.json()).error.code, "insufficient_scope");

    const allowedWrite = await fetch(`${localUrl}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-myclaw-token": "message-token" },
      body: JSON.stringify({ text: "allowed by scope" }),
    });
    assert.equal(allowedWrite.status, 200);

    const deniedStream = await fetch(`${localUrl}/api/events/stream`, {
      headers: { "x-myclaw-token": "message-token" },
    });
    assert.equal(deniedStream.status, 403);

    const stream = await fetch(`${localUrl}/api/events/stream`, {
      headers: { "x-myclaw-token": "events-token" },
    });
    assert.equal(stream.status, 200);
    assert.match(await readFirstChunk(stream), /event: snapshot/);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("gateway audits unknown mutating requests before returning method errors", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-gateway-audit-unknown-"));
  const gateway = await startGateway({ port: 0, stateDir, openclawSource: stateDir });
  try {
    const response = await fetch(`${gateway.url}/api/not-a-route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "unknown body must not leak" }),
    });
    assert.equal(response.status, 405);

    await waitForAuditFlush();
    const payload = await fetch(`${gateway.url}/api/audit`).then((auditResponse) => auditResponse.json());
    assert.equal(payload.audit.length, 1);
    assert.equal(payload.audit[0].action, "gateway.mutation.unknown");
    assert.equal(payload.audit[0].status, 405);
    assert.equal(payload.audit[0].outcome, "blocked");
    assert.equal(JSON.stringify(payload).includes("unknown body must not leak"), false);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

function waitForAuditFlush() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

async function readFirstChunk(response) {
  const reader = response.body.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  return Buffer.from(value).toString("utf8");
}
