import { getDashboardAsset, renderDashboardHtml } from "../../../dashboard/src/index.mjs";
import {
  buildEventsPayload,
  buildFeishuAdoptionStatusPayload,
  buildMilestonesStatusPayload,
  buildOpenClawMigrationPayload,
  buildReferenceCompletionStatusPayload,
  buildRunPayload,
  buildRunsPayload,
  buildStatusPayload,
} from "../../../control-plane/src/status.mjs";
import { sendHtml, sendJson, sendText } from "../http.mjs";

export async function handleGetRequest(url, response, context) {
  if (url.pathname === "/") {
    sendHtml(response, renderDashboardHtml());
    return true;
  }
  const asset = getDashboardAsset(url.pathname);
  if (asset) {
    sendText(response, 200, asset.contentType, asset.body, "public, max-age=60");
    return true;
  }
  if (url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, service: "myclaw-gateway", at: new Date().toISOString() });
    return true;
  }
  if (url.pathname === "/api/status") {
    sendJson(response, 200, await buildStatusPayload({ ...context, service: "myclaw-gateway" }));
    return true;
  }
  if (url.pathname === "/api/runs") {
    sendJson(response, 200, await buildRunsPayload(context, { limit: Number(url.searchParams.get("limit") || 50) }));
    return true;
  }
  if (url.pathname.startsWith("/api/runs/")) {
    const payload = await buildRunPayload(context, { runId: decodeURIComponent(url.pathname.slice(10)) });
    sendJson(response, runPayloadStatus(payload), payload);
    return true;
  }
  if (url.pathname === "/api/events") {
    sendJson(response, 200, await buildEventsPayload(context, { limit: Number(url.searchParams.get("limit") || 100) }));
    return true;
  }
  if (url.pathname === "/api/openclaw-migration") {
    sendJson(response, 200, await buildOpenClawMigrationPayload(context));
    return true;
  }
  if (url.pathname === "/api/reference-completion") {
    sendJson(response, 200, buildReferenceCompletionStatusPayload());
    return true;
  }
  if (url.pathname === "/api/milestones") {
    sendJson(response, 200, buildMilestonesStatusPayload());
    return true;
  }
  if (url.pathname === "/api/feishu-adoption") {
    sendJson(response, 200, buildFeishuAdoptionStatusPayload(context));
    return true;
  }
  return false;
}

function runPayloadStatus(payload) {
  if (payload.ok) {
    return 200;
  }
  return payload.error?.code === "invalid_run_id" ? 400 : 404;
}
