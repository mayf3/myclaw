import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { startGateway } from "../src/index.mjs";

test("gateway serves dashboard status and accepts inbound messages", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-gateway-"));
  const gateway = await startGateway({ port: 0, stateDir, openclawSource: stateDir });
  try {
    const health = await fetch(`${gateway.url}/api/health`).then((response) => response.json());
    assert.equal(health.service, "myclaw-gateway");

    const response = await fetch(`${gateway.url}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: "console",
        from: "ou_user",
        conversation: "oc_group",
        text: "hello through gateway",
        reply: "received",
      }),
    });
    const envelope = await response.json();
    assert.equal(response.status, 200);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.result.inbound.channel, "console");
    assert.equal(envelope.result.reply.target, "oc_group");

    const status = await fetch(`${gateway.url}/api/status`).then((statusResponse) => statusResponse.json());
    assert.equal(status.ok, true);
    assert.equal(status.runs.length, 1);

    const reference = await fetch(`${gateway.url}/api/reference-completion`).then((response) => response.json());
    assert.equal(reference.referenceCompletion.modules.some((module) => module.id === "feishu"), true);

    const feishu = await fetch(`${gateway.url}/api/feishu-adoption`).then((response) => response.json());
    assert.equal(feishu.feishuAdoption.referenceUse, true);

    const asset = await fetch(`${gateway.url}/assets/dashboard.js`);
    assert.equal(asset.status, 200);
    assert.match(await asset.text(), /renderFeishu/);

    const events = await readFile(path.join(stateDir, "events.jsonl"), "utf8");
    assert.match(events, /message\.receive\.completed/);
    assert.match(events, /message\.reply\.completed/);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("gateway handles feishu challenge, event normalization, and duplicate event ids", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-feishu-"));
  const gateway = await startGateway({ port: 0, stateDir, openclawSource: stateDir });
  try {
    const challengeResponse = await fetch(`${gateway.url}/feishu/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challenge: "plain_challenge" }),
    });
    assert.deepEqual(await challengeResponse.json(), { challenge: "plain_challenge" });

    const eventBody = {
      header: { event_id: "evt_gateway_1" },
      event: {
        sender: { sender_id: { open_id: "ou_user" } },
        message: {
          message_id: "om_gateway_1",
          chat_id: "oc_group",
          content: JSON.stringify({ text: "hello from feishu" }),
        },
      },
    };
    const eventResponse = await fetch(`${gateway.url}/api/feishu/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(eventBody),
    });
    const envelope = await eventResponse.json();
    assert.equal(eventResponse.status, 200);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.result.inbound.channel, "feishu-event");
    assert.equal(envelope.result.inbound.conversationId, "oc_group");

    const duplicateResponse = await fetch(`${gateway.url}/api/feishu/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(eventBody),
    });
    assert.equal(duplicateResponse.status, 200);
    assert.deepEqual(await duplicateResponse.json(), { ok: true, duplicate: true, eventId: "evt_gateway_1" });

    const status = await fetch(`${gateway.url}/api/status`).then((statusResponse) => statusResponse.json());
    assert.equal(status.runs.length, 1);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("gateway protects mutations with tokens when configured", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-gateway-token-"));
  const gateway = await startGateway({ port: 0, stateDir, openclawSource: stateDir, token: "secret" });
  try {
    const denied = await fetch(`${gateway.url}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "blocked" }),
    });
    assert.equal(denied.status, 401);

    const allowed = await fetch(`${gateway.url}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-myclaw-token": "secret" },
      body: JSON.stringify({ text: "allowed" }),
    });
    const envelope = await allowed.json();
    assert.equal(allowed.status, 200);
    assert.equal(envelope.ok, true);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("gateway stages OpenClaw migration snapshots behind mutation auth", async () => {
  const source = await mkdtemp(path.join(tmpdir(), "myclaw-openclaw-gateway-"));
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-gateway-stage-"));
  await mkdir(path.join(source, "extensions", "lark"), { recursive: true });
  await writeFile(path.join(source, "openclaw.json"), "{ channels: { lark: { enabled: true } } }", "utf8");
  await writeFile(
    path.join(source, "extensions", "lark", "openclaw.plugin.json"),
    JSON.stringify({ id: "lark", channels: ["lark"] }),
    "utf8",
  );

  const gateway = await startGateway({ port: 0, stateDir, openclawSource: source, token: "secret" });
  try {
    const response = await fetch(`${gateway.url}/api/openclaw-migration/stage`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer secret" },
      body: JSON.stringify({}),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.stage.status, "staged");
    assert.equal(payload.stage.modules.some((module) => module.id === "feishu"), true);

    const migration = await fetch(`${gateway.url}/api/openclaw-migration`).then((migrationResponse) =>
      migrationResponse.json(),
    );
    assert.equal(migration.stage.stageId, payload.stage.stageId);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("gateway validates Feishu verification tokens and rejects encrypted callbacks", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-feishu-token-"));
  const gateway = await startGateway({ port: 0, stateDir, openclawSource: stateDir, feishuVerifyToken: "verify" });
  try {
    const denied = await fetch(`${gateway.url}/feishu/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challenge: "plain_challenge" }),
    });
    assert.equal(denied.status, 401);

    const encrypted = await fetch(`${gateway.url}/feishu/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "verify", encrypt: "cipher" }),
    });
    assert.equal(encrypted.status, 501);

    const challenge = await fetch(`${gateway.url}/feishu/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "verify", challenge: "plain_challenge" }),
    });
    assert.deepEqual(await challenge.json(), { challenge: "plain_challenge" });
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("gateway token does not replace Feishu verification on non-loopback hosts", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-feishu-nonloopback-"));
  const gateway = await startGateway({ host: "0.0.0.0", port: 0, stateDir, openclawSource: stateDir, token: "secret" });
  const address = gateway.server.address();
  const localUrl = `http://127.0.0.1:${address.port}`;
  try {
    const denied = await fetch(`${localUrl}/feishu/events`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer secret" },
      body: JSON.stringify({ challenge: "plain_challenge" }),
    });
    assert.equal(denied.status, 403);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});
