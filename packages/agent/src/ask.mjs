import { createEvent, createRunId, errorEnvelope, okEnvelope } from "../../core/src/envelope.mjs";
import { recordRun, resolveStateDir } from "../../core/src/state.mjs";
import { createOpenAiResponse } from "../../llm/src/openai-responses.mjs";

export async function askAgent(options = {}) {
  const text = String(options.text || "").trim();
  if (!text) {
    throw new Error("Missing ask text.");
  }

  const started = Date.now();
  const runId = createRunId("ask");
  const events = [
    createEvent("agent.ask.started", {
      source: options.source || "runtime",
      inputLength: text.length,
    }),
    createEvent("llm.request.started", {
      provider: "openai-responses",
      model: options.model || process.env.MYCLAW_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-5.5",
    }),
  ];

  const response = await createOpenAiResponse({
    input: text,
    model: options.model,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    env: options.env,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    maxOutputTokens: options.maxOutputTokens,
  });

  let envelope;
  if (response.ok) {
    events.push(
      createEvent("llm.response.completed", {
        provider: response.provider,
        model: response.model,
        responseId: response.responseId,
      }),
      createEvent("agent.ask.completed"),
    );
    envelope = okEnvelope({
      runId,
      result: {
        type: "agent-answer",
        provider: response.provider,
        model: response.model,
        responseId: response.responseId,
        input: { textPreview: `[redacted ${text.length} chars]` },
        answer: response.text,
        capabilities: { toolCalling: false, memory: false, streaming: false },
        toolCalls: [],
      },
      events,
      usage: {
        elapsedMs: Date.now() - started,
        ...response.usage,
      },
    });
  } else {
    events.push(
      createEvent("llm.response.failed", {
        provider: response.provider,
        model: response.model,
        code: response.error.code,
      }),
    );
    envelope = errorEnvelope({
      runId,
      code: response.error.code,
      message: response.error.message,
      recoverable: response.status === "needs_config",
      events,
      usage: { elapsedMs: Date.now() - started },
    });
  }

  await recordRun(resolveStateDir(options.stateDir), runId, envelope);
  return envelope;
}

export function answerFromEnvelope(envelope) {
  return envelope?.result?.answer || "";
}
