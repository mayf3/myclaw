import {
  buildApprovalPayload,
  buildApprovalsPayload,
  buildEventsPayload,
  buildFeishuAdoptionStatusPayload,
  buildHumanExperimentsStatusPayload,
  buildMilestonesStatusPayload,
  buildOpenClawMigrationPayload,
  buildReferenceCompletionStatusPayload,
  buildRunPayload,
  buildRunsPayload,
  buildStatusPayload,
} from "./status.mjs";

export async function resolveControlGetRoute(url, context = {}) {
  if (url.pathname === "/api/health") {
    return route(200, { ok: true, service: context.service || "myclaw-control-plane", at: new Date().toISOString() });
  }
  if (url.pathname === "/api/status") {
    return route(200, await buildStatusPayload(context));
  }
  if (url.pathname === "/api/runs") {
    return route(200, await buildRunsPayload(context, { limit: numberParam(url, "limit", 50) }));
  }
  if (url.pathname.startsWith("/api/runs/")) {
    const payload = await buildRunPayload(context, { runId: decodeURIComponent(url.pathname.slice(10)) });
    return route(runPayloadStatus(payload), payload);
  }
  if (url.pathname === "/api/events") {
    return route(200, await buildEventsPayload(context, { limit: numberParam(url, "limit", 100) }));
  }
  if (url.pathname === "/api/approvals") {
    return route(200, await buildApprovalsPayload(context, { limit: numberParam(url, "limit", 50), status: url.searchParams.get("status") || "" }));
  }
  if (url.pathname.startsWith("/api/approvals/")) {
    const approvalId = decodeURIComponent(url.pathname.slice(15));
    const payload = await buildApprovalPayload(context, { approvalId });
    return route(approvalPayloadStatus(payload), payload);
  }
  if (url.pathname === "/api/openclaw-migration") {
    return route(200, await buildOpenClawMigrationPayload(context));
  }
  if (url.pathname === "/api/reference-completion") {
    return route(200, buildReferenceCompletionStatusPayload());
  }
  if (url.pathname === "/api/milestones") {
    return route(200, buildMilestonesStatusPayload());
  }
  if (url.pathname === "/api/experiments") {
    return route(200, buildHumanExperimentsStatusPayload());
  }
  if (url.pathname === "/api/feishu-adoption") {
    return route(200, buildFeishuAdoptionStatusPayload(context));
  }
  return { handled: false };
}

function route(status, payload) {
  return { handled: true, status, payload };
}

function numberParam(url, key, fallback) {
  const value = Number(url.searchParams.get(key) || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function runPayloadStatus(payload) {
  if (payload.ok) {
    return 200;
  }
  return payload.error?.code === "invalid_run_id" ? 400 : 404;
}

function approvalPayloadStatus(payload) {
  if (payload.ok) {
    return 200;
  }
  return payload.error?.code === "invalid_approval_id" ? 400 : 404;
}
