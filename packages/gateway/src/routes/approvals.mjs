import { decideApproval } from "../../../core/src/approvals.mjs";
import { readJsonBody, sendJson } from "../http.mjs";

export async function handlePostApprovalDecision(request, response, context, approvalId) {
  const { body } = await readJsonBody(request);
  const result = await decideApproval(context.stateDir, approvalId, {
    decision: body.decision,
    decidedBy: body.decidedBy,
    reason: body.reason,
  });
  if (result.ok) {
    sendJson(response, 200, result);
    return;
  }
  sendJson(response, decisionStatus(result.status), {
    ok: false,
    error: { code: result.status, message: approvalErrorMessage(result.status) },
    approval: result.approval,
  });
}

export function parseApprovalDecisionPath(pathname) {
  const match = pathname.match(/^\/api\/approvals\/([^/]+)\/decision$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function decisionStatus(status) {
  if (status === "invalid_approval_id" || status === "invalid_decision") {
    return 400;
  }
  if (status === "already_decided") {
    return 409;
  }
  return 404;
}

function approvalErrorMessage(status) {
  if (status === "invalid_decision") {
    return "Decision must be approved or rejected.";
  }
  if (status === "already_decided") {
    return "Approval has already been decided.";
  }
  return "Approval not found or invalid.";
}
