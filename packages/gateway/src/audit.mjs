import { recordAuditEvent } from "../../core/src/audit.mjs";
import { isLoopbackHost, readRequestToken } from "./auth.mjs";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function attachGatewayAudit(request, response, context, meta = {}) {
  const startedAt = Date.now();
  response.once("finish", () => {
    const tokenProvided = Boolean(readRequestToken(request));
    const local = isLoopbackAddress(request.socket?.remoteAddress) || isLoopbackHost(context.host);
    recordAuditEvent(context.stateDir, {
      source: "gateway",
      action: meta.action,
      method: request.method,
      path: request.url?.split("?")[0] || "",
      status: response.statusCode,
      elapsedMs: Date.now() - startedAt,
      actor: {
        kind: tokenProvided ? "token" : local ? "loopback" : "anonymous",
        local,
        tokenProvided,
      },
      resource: meta.resource,
      errorCode: response.statusCode >= 400 ? meta.errorCode || statusErrorCode(response.statusCode) : "",
    }).catch((error) => {
      context.logger?.error?.(`gateway audit failed: ${redactError(error)}`);
    });
  });
}

export function shouldAuditGatewayRequest(request) {
  return MUTATION_METHODS.has(String(request.method || "").toUpperCase());
}

export function classifyGatewayMutation(url, options = {}) {
  const pathname = url.pathname;
  if (pathname === "/feishu/events" || pathname === "/api/feishu/events") {
    return { action: "gateway.feishu.event", resource: { type: "feishu-event" } };
  }
  if (pathname === "/messages" || pathname === "/api/messages") {
    return { action: "gateway.message.receive", resource: { type: "message" } };
  }
  if (pathname === "/api/openclaw-migration/stage") {
    return { action: "gateway.openclaw.stage", resource: { type: "openclaw-migration" } };
  }
  if (options.approvalDecisionId) {
    return { action: "gateway.approval.decide", resource: { type: "approval", id: options.approvalDecisionId } };
  }
  return { action: "gateway.mutation.unknown", resource: { type: "unknown" } };
}

function statusErrorCode(status) {
  if (status === 401) {
    return "unauthorized";
  }
  if (status === 403) {
    return "forbidden";
  }
  if (status === 400) {
    return "bad_request";
  }
  if (status === 409) {
    return "conflict";
  }
  return status >= 500 ? "server_error" : "";
}

function isLoopbackAddress(value) {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(String(value || ""));
}

function redactError(error) {
  return String(error instanceof Error ? error.message : error).replace(
    /\b((?:token|secret|authorization)\s*[:=]\s*)[^\s&;,]+/gi,
    "$1[redacted]",
  );
}
