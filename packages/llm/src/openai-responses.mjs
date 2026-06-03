const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export function buildOpenAiResponsesConfig(options = {}) {
  const env = options.env || process.env;
  return {
    provider: "openai-responses",
    apiKey: String(options.apiKey || env.OPENAI_API_KEY || "").trim(),
    model: String(options.model || env.MYCLAW_OPENAI_MODEL || env.OPENAI_MODEL || DEFAULT_MODEL).trim(),
    baseUrl: String(options.baseUrl || env.MYCLAW_OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    timeoutMs: Number(options.timeoutMs || env.MYCLAW_OPENAI_TIMEOUT_MS || 30000),
    maxOutputTokens: Number(options.maxOutputTokens || env.MYCLAW_OPENAI_MAX_OUTPUT_TOKENS || 800),
  };
}

export async function createOpenAiResponse(options = {}) {
  const config = buildOpenAiResponsesConfig(options);
  if (!config.apiKey) {
    return {
      ok: false,
      status: "needs_config",
      error: { code: "llm_config_required", message: "Set OPENAI_API_KEY before using LLM replies." },
      provider: config.provider,
      model: config.model,
    };
  }
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(`${config.baseUrl}/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        input: String(options.input || ""),
        instructions: options.instructions || defaultInstructions(),
        max_output_tokens: config.maxOutputTokens,
        store: false,
      }),
    });
    const body = await readJsonBody(response);
    if (!response.ok) {
      return {
        ok: false,
        status: "failed",
        error: normalizeOpenAiError(body, response.status),
        provider: config.provider,
        model: config.model,
      };
    }
    const text = extractOutputText(body);
    return {
      ok: true,
      provider: config.provider,
      model: body.model || config.model,
      responseId: body.id || null,
      text,
      usage: normalizeUsage(body.usage),
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      error: {
        code: error?.name === "AbortError" ? "llm_timeout" : "llm_request_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      provider: config.provider,
      model: config.model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function defaultInstructions() {
  return [
    "You are MyClaw, a local-first personal assistant runtime.",
    "Answer directly and concisely.",
    "Do not claim you used local tools, files, Feishu, memory, or shell unless tool results are explicitly provided.",
    "If the user asks for tool execution, explain that tool calling is not enabled in this smoke phase yet.",
  ].join(" ");
}

async function readJsonBody(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function extractOutputText(body) {
  if (typeof body.output_text === "string") {
    return body.output_text;
  }
  const chunks = [];
  for (const item of body.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function normalizeOpenAiError(body, status) {
  const error = body?.error || {};
  return {
    code: error.code || error.type || `openai_http_${status}`,
    message: error.message || `OpenAI request failed with HTTP ${status}.`,
  };
}

function normalizeUsage(usage = {}) {
  return {
    inputTokens: usage.input_tokens ?? null,
    outputTokens: usage.output_tokens ?? null,
    totalTokens: usage.total_tokens ?? null,
  };
}
