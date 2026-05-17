import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
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
