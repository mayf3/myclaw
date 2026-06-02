import http from "node:http";
import { URL } from "node:url";
import { handleControlEventStream } from "../../control-plane/src/event-stream.mjs";
import { resolveStateDir } from "../../core/src/state.mjs";
import { authorizeGatewayMutation, authorizeGatewayRead, authorizeGatewayToken } from "./auth.mjs";
import { attachGatewayAudit, classifyGatewayMutation, shouldAuditGatewayRequest } from "./audit.mjs";
import { sendJson } from "./http.mjs";
import { handlePostApprovalDecision, parseApprovalDecisionPath } from "./routes/approvals.mjs";
import { handleGetRequest } from "./routes/control.mjs";
import { handlePostFeishuEvent } from "./routes/feishu.mjs";
import { handlePostOpenClawMigrationStage } from "./routes/migration.mjs";
import { handlePostMessage } from "./routes/messages.mjs";
import { handlePostSmokeNoteToolRequest } from "./routes/tools.mjs";

export async function startGateway(options = {}) {
  const host = options.host || "127.0.0.1";
  const port = Number(options.port ?? process.env.MYCLAW_GATEWAY_PORT ?? 4321);
  const stateDir = resolveStateDir(options.stateDir);
  const context = {
    stateDir,
    openclawSource: options.openclawSource,
    host,
    token: options.token ?? process.env.MYCLAW_GATEWAY_TOKEN ?? "",
    scopedTokens: options.scopedTokens ?? process.env.MYCLAW_GATEWAY_SCOPED_TOKENS ?? "",
    logger: options.logger ?? console,
    feishuVerifyToken: options.feishuVerifyToken ?? process.env.MYCLAW_FEISHU_VERIFY_TOKEN ?? "",
    feishuEncryptKey: options.feishuEncryptKey ?? process.env.MYCLAW_FEISHU_ENCRYPT_KEY ?? "",
  };
  const server = http.createServer((request, response) => {
    handleGatewayRequest(request, response, context).catch((error) => {
      sendJson(response, 500, {
        ok: false,
        error: {
          code: "gateway_error",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    server,
    url: `http://${host}:${actualPort}`,
    stateDir,
  };
}

export async function handleGatewayRequest(request, response, context) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  const approvalDecisionId = parseApprovalDecisionPath(url.pathname);
  if (shouldAuditGatewayRequest(request)) {
    attachGatewayAudit(request, response, context, classifyGatewayMutation(url, { approvalDecisionId }));
  }
  if (request.method === "POST" && (url.pathname === "/feishu/events" || url.pathname === "/api/feishu/events")) {
    await handlePostFeishuEvent(request, response, context);
    return;
  }
  if (request.method === "POST" && (url.pathname === "/messages" || url.pathname === "/api/messages")) {
    if (!authorizeMutation(request, response, context, ["mutation", "message:write"])) {
      return;
    }
    await handlePostMessage(request, response, context);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/openclaw-migration/stage") {
    if (!authorizeMutation(request, response, context, ["mutation", "migration:stage"])) {
      return;
    }
    await handlePostOpenClawMigrationStage(request, response, context);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/tool-requests/smoke-note") {
    if (!authorizeMutation(request, response, context, ["mutation", "tool:request"])) {
      return;
    }
    await handlePostSmokeNoteToolRequest(request, response, context);
    return;
  }
  if (request.method === "POST" && approvalDecisionId) {
    if (!authorizeApprovalDecision(request, response, context)) {
      return;
    }
    await handlePostApprovalDecision(request, response, context, approvalDecisionId);
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/health") {
    await handleGetRequest(url, response, context);
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/events/stream") {
    if (!authorizeRead(request, response, context, ["read", "events:read"])) {
      return;
    }
    await handleControlEventStream(request, response, context);
    return;
  }

  if (request.method === "GET") {
    if (!authorizeRead(request, response, context, ["read", "control:read"])) {
      return;
    }
    if (await handleGetRequest(url, response, context)) {
      return;
    }
  }

  sendJson(response, request.method === "GET" ? 404 : 405, {
    ok: false,
    error: { code: request.method === "GET" ? "not_found" : "method_not_allowed" },
  });
}

function authorizeMutation(request, response, context, scopes) {
  const auth = authorizeGatewayMutation(request, context, { scopes });
  if (!auth.ok) {
    sendJson(response, auth.status, auth.payload);
    return false;
  }
  return true;
}

function authorizeRead(request, response, context, scopes) {
  const auth = authorizeGatewayRead(request, context, { scopes });
  if (!auth.ok) {
    sendJson(response, auth.status, auth.payload);
    return false;
  }
  return true;
}

function authorizeApprovalDecision(request, response, context) {
  const auth = authorizeGatewayToken(request, context, {
    code: "approval_token_required",
    message: "Set MYCLAW_GATEWAY_TOKEN before recording approval decisions.",
    scopes: ["mutation", "approval:decide"],
  });
  if (!auth.ok) {
    sendJson(response, auth.status, auth.payload);
    return false;
  }
  return true;
}
