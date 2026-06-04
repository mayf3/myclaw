const REDACTED = "[redacted]";

export function redactRunRecord(record) {
  const copy = cloneJson(record);
  if (isAgentAnswerRun(copy)) {
    copy.summary = redactAgentSummary(copy.summary, copy.envelope);
    if (copy.envelope) {
      redactEnvelope(copy.envelope);
    }
    return copy;
  }
  if (isConfigProposalRun(copy)) {
    copy.summary = redactConfigProposalSummary(copy.summary, copy.envelope);
    if (copy.envelope) {
      redactEnvelope(copy.envelope);
    }
    return copy;
  }
  if (!isFeishuRun(copy)) {
    return copy;
  }
  copy.summary = redactSummary(copy.summary);
  if (copy.envelope) {
    redactEnvelope(copy.envelope);
  }
  return copy;
}

export function redactRunDetail(run) {
  const copy = cloneJson(run);
  if (isAgentAnswerRun(copy)) {
    copy.summary = redactAgentSummary(copy.summary, copy.envelope);
    if (copy.envelope) {
      redactEnvelope(copy.envelope);
    }
    return copy;
  }
  if (isConfigProposalRun(copy)) {
    copy.summary = redactConfigProposalSummary(copy.summary, copy.envelope);
    if (copy.envelope) {
      redactEnvelope(copy.envelope);
    }
    return copy;
  }
  if (!isFeishuRun(copy)) {
    return copy;
  }
  copy.summary = redactSummary(copy.summary);
  copy.events = redactEvents(copy.events);
  if (copy.envelope) {
    redactEnvelope(copy.envelope);
  }
  return copy;
}

export function redactEvents(events = []) {
  return events.map((event) => redactLocalPaths(isFeishuEvent(event) ? redactEvent(event) : event));
}

export function redactApprovalRecord(approval) {
  if (!approval) {
    return approval;
  }
  const copy = redactLocalPaths(cloneJson(approval));
  if (copy.subject?.type !== "agent-config-proposal") {
    return copy;
  }
  const target = supportedConfigTarget(copy.subject?.target) ? copy.subject.target : "unsupported";
  copy.title = `Review agent config proposal: ${target}`;
  copy.summary = `Review-only config proposal for ${target}; details redacted.`;
  copy.subject = {
    type: "agent-config-proposal",
    target,
    proposalId: copy.subject?.proposalId,
    applySupported: false,
  };
  copy.evidence = (copy.evidence || [])
    .filter((item) => item?.type === "run" || item?.type === "target")
    .map((item) => (item.type === "target" ? { type: "target", target } : item));
  if (copy.decision?.reason) {
    copy.decision = { ...copy.decision, reason: REDACTED };
  }
  return copy;
}

function redactEnvelope(envelope) {
  if (envelope.result?.type === "agent-answer") {
    const answer = String(envelope.result.answer || "");
    envelope.result.answerPreview = summarizeRedactedText(answer);
    envelope.result.answer = REDACTED;
    envelope.result.capabilities = {
      toolCalling: false,
      memory: false,
      streaming: false,
      ...(envelope.result.capabilities || {}),
    };
  }
  if (envelope.result?.type === "agent-config-proposal") {
    const proposal = envelope.result.proposal || {};
    envelope.result.proposalPreview = {
      summaryPreview: summarizeRedactedText(proposal.summary),
      readiness: proposal.readiness || "needs_review",
      proposedChangeCount: Array.isArray(proposal.proposedChanges) ? proposal.proposedChanges.length : 0,
      commandCount: Array.isArray(proposal.commands) ? proposal.commands.length : 0,
      riskCount: Array.isArray(proposal.risks) ? proposal.risks.length : 0,
      blockedCount: Array.isArray(proposal.blocked) ? proposal.blocked.length : 0,
    };
    envelope.result.proposal = REDACTED;
    envelope.result.sanitizedContext = {
      target: envelope.result.sanitizedContext?.target || envelope.result.target,
      guardrails: envelope.result.sanitizedContext?.guardrails || {},
    };
  }
  if (envelope.result?.inbound?.channel === "feishu-event") {
    const inbound = envelope.result.inbound;
    inbound.textPreview = summarizeRedactedText(inbound.text);
    inbound.text = REDACTED;
    inbound.conversationId = REDACTED;
    inbound.sender = { ...(inbound.sender || {}), id: REDACTED };
    delete inbound.raw;
  }
  if (envelope.result?.reply?.provider === "feishu") {
    envelope.result.reply.target = REDACTED;
    envelope.result.reply.replyToMessageId = envelope.result.reply.replyToMessageId ? REDACTED : null;
    redactReplyBuilder(envelope.result.reply.builder);
    delete envelope.result.reply.raw;
  }
  envelope.events = redactEvents(envelope.events);
}

function isAgentAnswerRun(record = {}) {
  const envelope = record.envelope ?? record;
  return envelope.result?.type === "agent-answer" || String(record.runId || envelope.runId || "").startsWith("ask_");
}

function isConfigProposalRun(record = {}) {
  const envelope = record.envelope ?? record;
  return envelope.result?.type === "agent-config-proposal" || String(record.runId || envelope.runId || "").startsWith("cfg_");
}

function redactEvent(event) {
  const copy = { ...event };
  for (const key of ["eventId", "conversationId", "senderId", "target", "replyToMessageId"]) {
    if (copy[key]) {
      copy[key] = REDACTED;
    }
  }
  if (copy.linkedRunId && !isSafeAskRunId(copy.linkedRunId)) {
    copy.linkedRunId = REDACTED;
  }
  return copy;
}

function isFeishuRun(record = {}) {
  const envelope = record.envelope ?? record;
  return (
    String(record.runId || envelope.runId || "").startsWith("fb_") ||
    envelope.result?.inbound?.channel === "feishu-event" ||
    (envelope.events || record.events || []).some((event) => isFeishuEvent(event))
  );
}

function isFeishuEvent(event = {}) {
  return (
    String(event.runId || "").startsWith("fb_") ||
    String(event.type || "").startsWith("feishu.bot.") ||
    event.channel === "feishu-event"
  );
}

function redactSummary(summary) {
  return String(summary || "").replace(/feishu-event inbound:.*/i, "feishu-event inbound: [redacted]");
}

function redactAgentSummary(summary, envelope) {
  const answer = envelope?.result?.answer;
  if (answer) {
    return `agent answer: ${summarizeRedactedText(answer)}`;
  }
  return String(summary || "").replace(/agent answer:.*/i, "agent answer: [redacted]");
}

function redactConfigProposalSummary(summary, envelope) {
  const proposal = envelope?.result?.proposal;
  if (proposal?.summary) {
    return `config proposal: ${summarizeRedactedText(proposal.summary)}`;
  }
  return String(summary || "").replace(/config proposal:.*/i, "config proposal: [redacted]");
}

function redactLocalPaths(value, key = "") {
  if (Array.isArray(value)) {
    return value.map((item) => redactLocalPaths(item));
  }
  if (!value || typeof value !== "object") {
    return shouldRedactPath(key, value) ? REDACTED : value;
  }
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
    entryKey,
    redactLocalPaths(entryValue, entryKey),
  ]));
}

function shouldRedactPath(key, value) {
  const name = String(key || "").toLowerCase();
  const text = String(value || "");
  return (name === "path" || name.endsWith("path") || name === "reporoot") && text.startsWith("/");
}

function summarizeRedactedText(text) {
  const value = String(text || "").trim();
  if (!value) {
    return "";
  }
  return `[redacted ${value.length} chars]`;
}

function redactReplyBuilder(builder) {
  if (!builder || typeof builder !== "object") {
    return;
  }
  if (builder.text) {
    builder.textPreview = summarizeRedactedText(builder.text);
    builder.text = REDACTED;
  }
  if (builder.linkedRunId && !isSafeAskRunId(builder.linkedRunId)) {
    builder.linkedRunId = REDACTED;
  }
}

function isSafeAskRunId(value) {
  return /^ask_[A-Za-z0-9_-]+$/.test(String(value || ""));
}

function supportedConfigTarget(value) {
  return value === "feishu-llm";
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
