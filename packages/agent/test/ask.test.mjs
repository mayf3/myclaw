import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { askAgent } from "../src/ask.mjs";

test("ask agent records a real-provider shaped LLM answer", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-ask-"));
  const envelope = await askAgent({
    text: "hello agent",
    stateDir,
    apiKey: "secret-key",
    fetchImpl: async () =>
      jsonResponse({
        id: "resp_agent",
        model: "test-model",
        output_text: "agent answer",
        usage: { input_tokens: 5, output_tokens: 6, total_tokens: 11 },
      }),
  });

  assert.equal(envelope.ok, true);
  assert.equal(envelope.result.answer, "agent answer");
  assert.deepEqual(envelope.result.capabilities, { toolCalling: false, memory: false, streaming: false });
  assert.deepEqual(envelope.result.toolCalls, []);
  assert.equal(envelope.result.input.textPreview, "[redacted 11 chars]");
  assert.equal(envelope.usage.totalTokens, 11);

  const events = await readFile(path.join(stateDir, "events.jsonl"), "utf8");
  assert.match(events, /agent\.ask\.completed/);
  assert.equal(events.includes("hello agent"), false);
  assert.equal(events.includes("secret-key"), false);
});

test("ask agent records missing LLM config without pretending to answer", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-ask-missing-"));
  const envelope = await askAgent({ text: "hello", stateDir, apiKey: "", env: {} });

  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "llm_config_required");
  const events = await readFile(path.join(stateDir, "events.jsonl"), "utf8");
  assert.match(events, /llm\.response\.failed/);
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
