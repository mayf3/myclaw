import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { listApprovals } from "../../core/src/approvals.mjs";
import { buildSanitizedConfigContext, proposeAgentConfig } from "../src/config-proposal.mjs";

test("config proposal agent records a review-only proposal and approval", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-config-agent-"));
  let requestBody = null;
  const envelope = await proposeAgentConfig({
    target: "feishu-llm",
    text: "configure group oc_secret with key sk-secret-token",
    stateDir,
    apiKey: "secret-key",
    env: {
      OPENAI_API_KEY: "sk-env-secret",
      MYCLAW_FEISHU_APP_ID: "app-id",
      MYCLAW_FEISHU_APP_SECRET: "app-secret",
      MYCLAW_FEISHU_ALLOWED_CHAT_IDS: "oc_secret",
      MYCLAW_FEISHU_LLM_ENABLED: "1",
    },
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return jsonResponse({
        id: "resp_config",
        model: "test-model",
        output_text: JSON.stringify({
          summary: "Enable Feishu LLM with [redacted] allowlist.",
          readiness: "needs_config",
          commands: ["myclaw feishu-bot --reply-provider llm --llm-privacy-ack"],
          risks: ["Do not use unsafeOpenIngress."],
        }),
      });
    },
  });

  assert.equal(envelope.ok, true);
  assert.equal(envelope.result.type, "agent-config-proposal");
  assert.equal(envelope.result.capabilities.appliesChanges, false);
  assert.equal(envelope.result.sanitizedContext.feishu.allowedChatIdsCount, 1);
  assert.equal(envelope.result.approval.status, "pending");
  assert.equal(envelope.result.proposal.summary.includes("oc_secret"), false);
  assert.equal(JSON.stringify(requestBody).includes("sk-env-secret"), false);
  assert.equal(JSON.stringify(requestBody).includes("sk-secret-token"), false);
  assert.equal(JSON.stringify(requestBody).includes("app-secret"), false);
  assert.equal(JSON.stringify(requestBody).includes("oc_secret"), false);

  const approvals = await listApprovals(stateDir);
  assert.equal(approvals[0].subject.type, "agent-config-proposal");
  assert.equal(approvals[0].summary.includes("Enable Feishu"), false);
  assert.equal(approvals[0].summary.includes("oc_secret"), false);
  const events = await readFile(path.join(stateDir, "events.jsonl"), "utf8");
  assert.match(events, /agent\.config\.proposal\.completed/);
  assert.equal(events.includes("sk-secret"), false);
});

test("config proposal rejects unsupported targets without echoing them", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-config-agent-target-"));
  const envelope = await proposeAgentConfig({
    target: "oc_secret",
    stateDir,
    apiKey: "secret-key",
    env: { OPENAI_API_KEY: "sk-env-secret" },
  });

  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "invalid_config_target");
  assert.equal(JSON.stringify(envelope).includes("oc_secret"), false);
});

test("config proposal agent reports missing LLM config", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-config-agent-missing-"));
  const envelope = await proposeAgentConfig({ target: "feishu-llm", stateDir, apiKey: "", env: {} });

  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "llm_config_required");
});

test("config context exposes counts but not identifiers", () => {
  const context = buildSanitizedConfigContext({
    env: {
      MYCLAW_FEISHU_ALLOWED_CHAT_IDS: "oc_a,oc_b",
      MYCLAW_FEISHU_ALLOWED_SENDER_IDS: "ou_a",
    },
  });
  const text = JSON.stringify(context);

  assert.equal(context.feishu.allowedChatIdsCount, 2);
  assert.equal(context.feishu.allowedSenderIdsCount, 1);
  assert.equal(text.includes("oc_a"), false);
  assert.equal(text.includes("ou_a"), false);
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}
