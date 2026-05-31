import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createApprovalRequest } from "../../core/src/approvals.mjs";
import { createEvent, okEnvelope } from "../../core/src/envelope.mjs";
import { recordRun } from "../../core/src/state.mjs";
import { handleControlEventStream } from "../src/event-stream.mjs";

test("control event stream emits redacted snapshots", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-event-stream-"));
  await recordRun(
    stateDir,
    "fb_stream_secret",
    okEnvelope({
      runId: "fb_stream_secret",
      result: { inbound: { channel: "feishu-event", text: "private stream message" } },
      events: [
        createEvent("feishu.bot.reply.completed", {
          conversationId: "oc_stream_secret",
          senderId: "ou_stream_secret",
          target: "oc_stream_secret",
        }),
      ],
    }),
  );
  await createApprovalRequest(stateDir, {
    title: "Path must not leak",
    subject: { type: "openclaw-stage", path: path.join(stateDir, "private-stage.json") },
  });

  const server = http.createServer((request, response) => {
    handleControlEventStream(request, response, { stateDir }, { intervalMs: 500 });
  });
  await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/events`);
    const chunk = await readFirstChunk(response);
    assert.match(chunk, /event: snapshot/);
    assert.match(chunk, /\[redacted\]/);
    assert.equal(chunk.includes("oc_stream_secret"), false);
    assert.equal(chunk.includes("ou_stream_secret"), false);
    assert.equal(chunk.includes(stateDir), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function readFirstChunk(response) {
  const reader = response.body.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  return Buffer.from(value).toString("utf8");
}
