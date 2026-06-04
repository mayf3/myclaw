import { createApprovalRequest } from "../../core/src/approvals.mjs";
import { createEvent, createRunId, errorEnvelope, okEnvelope } from "../../core/src/envelope.mjs";
import { recordRun, resolveStateDir } from "../../core/src/state.mjs";
import { createOpenAiResponse } from "../../llm/src/openai-responses.mjs";

export const SUPPORTED_CONFIG_TARGETS = ["feishu-llm"];

export async function proposeAgentConfig(options = {}) {
  const started = Date.now();
  const stateDir = resolveStateDir(options.stateDir);
  const target = normalizeTarget(options.target);
  const runId = createRunId("cfg");
  if (!isSupportedConfigTarget(target)) {
    const envelope = errorEnvelope({
      runId,
      code: "invalid_config_target",
      message: `Unsupported config target. Supported targets: ${SUPPORTED_CONFIG_TARGETS.join(", ")}.`,
      recoverable: true,
      events: [createEvent("agent.config.proposal.failed", { code: "invalid_config_target", supportedTargets: SUPPORTED_CONFIG_TARGETS })],
      usage: { elapsedMs: Date.now() - started },
    });
    await recordRun(stateDir, runId, envelope);
    return envelope;
  }
  const requestText = String(options.text || defaultRequest(target)).trim();
  const redactedRequestText = redactSensitiveValues(requestText);
  const sanitizedContext = buildSanitizedConfigContext({ ...options, target });
  const events = [
    createEvent("agent.config.proposal.started", {
      target,
      inputLength: requestText.length,
    }),
    createEvent("llm.request.started", {
      provider: "openai-responses",
      model: options.model || envValue(options.env, "MYCLAW_OPENAI_MODEL") || envValue(options.env, "OPENAI_MODEL") || "gpt-5.5",
    }),
  ];

  const response = await createOpenAiResponse({
    input: JSON.stringify({ target, request: redactedRequestText, context: sanitizedContext }, null, 2),
    instructions: configProposalInstructions(),
    model: options.model,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    env: options.env,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    maxOutputTokens: options.maxOutputTokens || 1200,
  });

  if (!response.ok) {
    events.push(createEvent("llm.response.failed", { provider: response.provider, model: response.model, code: response.error.code }));
    const envelope = errorEnvelope({
      runId,
      code: response.error.code,
      message: response.error.message,
      recoverable: response.status === "needs_config",
      events,
      usage: { elapsedMs: Date.now() - started },
    });
    await recordRun(stateDir, runId, envelope);
    return envelope;
  }

  const proposal = normalizeProposal(parseProposal(response.text));
  const approvalSummary = `Review-only config proposal for ${target}; full proposal redacted in control-plane.`;
  const approval = await createApprovalRequest(stateDir, {
    requestedBy: "agent.config",
    title: `Review agent config proposal: ${target}`,
    summary: approvalSummary,
    severity: "medium",
    subject: { type: "agent-config-proposal", target, proposalId: runId, applySupported: false },
    evidence: [{ type: "run", runId }, { type: "target", target }],
  });
  events.push(
    createEvent("llm.response.completed", { provider: response.provider, model: response.model, responseId: response.responseId }),
    createEvent("agent.config.approval.created", { approvalId: approval.approvalId, target }),
    createEvent("agent.config.proposal.completed", { target }),
  );
  const envelope = okEnvelope({
    runId,
    result: {
      type: "agent-config-proposal",
      target,
      provider: response.provider,
      model: response.model,
      responseId: response.responseId,
      input: { textPreview: `[redacted ${requestText.length} chars]` },
      sanitizedContext,
      proposal,
      approval: { approvalId: approval.approvalId, status: approval.status, title: approval.title },
      capabilities: { appliesChanges: false, readsSecrets: false, toolCalling: false, memory: false },
    },
    events,
    usage: { elapsedMs: Date.now() - started, ...response.usage },
  });
  await recordRun(stateDir, runId, envelope);
  return envelope;
}

export function buildSanitizedConfigContext(options = {}) {
  const env = options.env || process.env;
  const target = normalizeTarget(options.target);
  return {
    phase: "1.9",
    target: isSupportedConfigTarget(target) ? target : "unsupported",
    llm: {
      openAiKeyConfigured: Boolean(envValue(env, "OPENAI_API_KEY")),
      model: envValue(env, "MYCLAW_OPENAI_MODEL") || envValue(env, "OPENAI_MODEL") || "gpt-5.5",
    },
    feishu: {
      appCredentialsConfigured: Boolean(envValue(env, "MYCLAW_FEISHU_APP_ID") && envValue(env, "MYCLAW_FEISHU_APP_SECRET")),
      connectionMode: envValue(env, "MYCLAW_FEISHU_CONNECTION_MODE") || "websocket",
      allowedChatIdsCount: countList(envValue(env, "MYCLAW_FEISHU_ALLOWED_CHAT_IDS")),
      allowedSenderIdsCount: countList(envValue(env, "MYCLAW_FEISHU_ALLOWED_SENDER_IDS")),
      requireMention: boolValue(envValue(env, "MYCLAW_FEISHU_REQUIRE_MENTION")),
      llmPrivacyAckConfigured: boolValue(envValue(env, "MYCLAW_FEISHU_LLM_ENABLED")),
      unsafeOpenIngressConfigured: boolValue(envValue(env, "MYCLAW_FEISHU_UNSAFE_OPEN_INGRESS")),
    },
    guardrails: {
      proposalOnly: true,
      approvalRequiredBeforeApply: true,
      applySupported: false,
      neverExposeSecrets: true,
      feishuLlmRequiresPrivacyAck: true,
      unsafeOpenIngressWithLlmForbidden: true,
    },
  };
}

function configProposalInstructions() {
  return [
    "You are MyClaw's configuration proposal agent.",
    "Return only a strict JSON object.",
    "Never include secret values, chat IDs, sender IDs, webhook URLs, tokens, app secrets, or API keys.",
    "Use [redacted] or counts instead of identifiers.",
    "Do not suggest unsafeOpenIngress for LLM replies.",
    "Do not claim changes were applied; this phase creates review-only proposals.",
    'Shape: {"summary":string,"readiness":"ready|needs_config|blocked|needs_review","proposedChanges":[],"commands":[],"risks":[],"blocked":[],"questions":[]}.',
  ].join(" ");
}

function parseProposal(text) {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(raw);
  } catch {
    return { summary: raw.slice(0, 400), readiness: "needs_review", risks: ["model_output_not_json"] };
  }
}

function normalizeProposal(value = {}) {
  return redactSensitiveValues({
    summary: stringValue(value.summary || "Configuration proposal requires review."),
    readiness: ["ready", "needs_config", "blocked", "needs_review"].includes(value.readiness) ? value.readiness : "needs_review",
    proposedChanges: arrayValue(value.proposedChanges, 8),
    commands: arrayValue(value.commands, 8),
    risks: arrayValue(value.risks, 8),
    blocked: arrayValue(value.blocked, 8),
    questions: arrayValue(value.questions, 8),
  });
}

function redactSensitiveValues(value) {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveValues);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactSensitiveValues(item)]));
  }
  return typeof value === "string"
    ? value
      .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
      .replace(/\b(?:oc|ou|om)_[A-Za-z0-9_-]{6,}\b/g, "[redacted]")
      .replace(/\bhttps:\/\/open\.feishu\.cn\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9_-]+/g, "[redacted]")
    : value;
}

function defaultRequest(target) {
  return `Create a safe review-only configuration proposal for ${target}.`;
}

function normalizeTarget(value) {
  const target = String(value || "feishu-llm").trim().toLowerCase();
  return target || "feishu-llm";
}

function isSupportedConfigTarget(target) {
  return SUPPORTED_CONFIG_TARGETS.includes(target);
}

function envValue(env = {}, key) {
  return String(env[key] || "").trim();
}

function countList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean).length;
}

function boolValue(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function arrayValue(value, limit) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, limit).map((item) => (typeof item === "string" ? item : item && typeof item === "object" ? item : String(item)));
}

function stringValue(value) {
  return String(value || "").trim().slice(0, 600);
}
