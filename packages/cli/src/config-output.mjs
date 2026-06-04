const REDACTED = "[redacted]";

export function printConfigEnvelope(envelope, options = {}) {
  const asJson = Boolean(options.json);
  if (options.unsafeFullLocal) {
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }
  const projection = safeConfigProjection(envelope);
  if (asJson) {
    console.log(JSON.stringify(projection, null, 2));
    return;
  }
  if (!projection.ok) {
    console.error(`${projection.error.code}: ${projection.error.message}`);
    return;
  }
  console.log(`config proposal: ${projection.result.proposalPreview.summaryPreview}`);
  console.log(`readiness: ${projection.result.proposalPreview.readiness}`);
  console.log(`approval: ${projection.result.approval.approvalId}`);
}

export function safeConfigProjection(envelope = {}) {
  if (!envelope.ok) {
    return {
      ok: false,
      status: envelope.status,
      runId: envelope.runId,
      error: envelope.error,
      usage: envelope.usage,
    };
  }
  const proposal = envelope.result?.proposal || {};
  return {
    ok: true,
    status: envelope.status,
    runId: envelope.runId,
    result: {
      type: "agent-config-proposal",
      target: envelope.result?.target,
      provider: envelope.result?.provider,
      model: envelope.result?.model,
      proposal: REDACTED,
      proposalPreview: {
        summaryPreview: summarizeRedactedText(proposal.summary),
        readiness: proposal.readiness || "needs_review",
        proposedChangeCount: Array.isArray(proposal.proposedChanges) ? proposal.proposedChanges.length : 0,
        commandCount: Array.isArray(proposal.commands) ? proposal.commands.length : 0,
        riskCount: Array.isArray(proposal.risks) ? proposal.risks.length : 0,
        blockedCount: Array.isArray(proposal.blocked) ? proposal.blocked.length : 0,
      },
      approval: envelope.result?.approval,
      capabilities: envelope.result?.capabilities,
    },
    usage: envelope.usage,
  };
}

function summarizeRedactedText(text) {
  const value = String(text || "").trim();
  return value ? `[redacted ${value.length} chars]` : "";
}
