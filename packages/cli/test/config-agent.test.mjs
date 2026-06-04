import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLI = path.resolve("packages/cli/src/index.mjs");

test("configure-agent command reports missing LLM config", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-config-agent-cli-"));
  let error;
  try {
    await execFileAsync(process.execPath, [
      CLI,
      "configure-agent",
      "--target",
      "feishu-llm",
      "--text",
      "check config",
      "--json",
      "--state-dir",
      stateDir,
    ], { env: { ...process.env, OPENAI_API_KEY: "" } });
  } catch (caught) {
    error = caught;
  }

  assert.equal(error.code, 1);
  const envelope = JSON.parse(error.stdout);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "llm_config_required");
});

test("configure-agent json output is a safe projection by default", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-config-agent-cli-ok-"));
  const server = await startMockResponsesServer({
    output_text: JSON.stringify({
      summary: "Enable Feishu LLM for sensitive group",
      readiness: "needs_review",
      commands: ["myclaw feishu-bot --reply-provider llm --llm-privacy-ack"],
      risks: ["review privacy"],
    }),
  });
  try {
    const result = await execFileAsync(process.execPath, [
      CLI,
      "configure-agent",
      "--target",
      "feishu-llm",
      "--text",
      "check config",
      "--json",
      "--state-dir",
      stateDir,
    ], {
      env: {
        ...process.env,
        OPENAI_API_KEY: "test-key",
        MYCLAW_OPENAI_BASE_URL: server.baseUrl,
        OPENAI_MODEL: "test-model",
      },
    });
    const payload = JSON.parse(result.stdout);

    assert.equal(payload.ok, true);
    assert.equal(payload.result.type, "agent-config-proposal");
    assert.equal(payload.result.proposal, "[redacted]");
    assert.equal(payload.result.proposalPreview.summaryPreview, "[redacted 37 chars]");
    assert.equal(result.stdout.includes("Enable Feishu"), false);
  } finally {
    await server.close();
  }
});

function startMockResponsesServer(responseBody) {
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/responses") {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: "resp_cli_config", model: "test-model", ...responseBody }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
