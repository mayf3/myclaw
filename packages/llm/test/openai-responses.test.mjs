import assert from "node:assert/strict";
import { test } from "node:test";
import { createOpenAiResponse } from "../src/openai-responses.mjs";

test("OpenAI Responses provider extracts output text without exposing the API key", async () => {
  const calls = [];
  const result = await createOpenAiResponse({
    input: "hello",
    apiKey: "secret-key",
    model: "test-model",
    fetchImpl: async (url, request) => {
      calls.push({ url, request });
      return jsonResponse({
        id: "resp_test",
        model: "test-model",
        output: [{ content: [{ type: "output_text", text: "hello from model" }] }],
        usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 },
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.text, "hello from model");
  assert.equal(result.responseId, "resp_test");
  assert.equal(result.usage.totalTokens, 7);
  assert.equal(JSON.stringify(result).includes("secret-key"), false);
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(JSON.parse(calls[0].request.body).store, false);
});

test("OpenAI Responses provider reports missing API key as needs_config", async () => {
  const result = await createOpenAiResponse({ input: "hello", env: {} });

  assert.equal(result.ok, false);
  assert.equal(result.status, "needs_config");
  assert.equal(result.error.code, "llm_config_required");
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
