import http from "node:http";
import { URL } from "node:url";
import { resolveStateDir } from "../../core/src/state.mjs";
import { authorizeGatewayMutation, authorizeGatewayToken } from "./auth.mjs";
import { sendJson } from "./http.mjs";
import { handlePostApprovalDecision, parseApprovalDecisionPath } from "./routes/approvals.mjs";
import { handleGetRequest } from "./routes/control.mjs";
import { handlePostFeishuEvent } from "./routes/feishu.mjs";
import { handlePostOpenClawMigrationStage } from "./routes/migration.mjs";
import { handlePostMessage } from "./routes/messages.mjs";

export async function startGateway(options = {}) {
  const host = options.host || "127.0.0.1";
  const port = Number(options.port ?? process.env.MYCLAW_GATEWAY_PORT ?? 4321);
  const stateDir = resolveStateDir(options.stateDir);
  const context = {
    stateDir,
    openclawSource: options.openclawSource,
    host,
    token: options.token ?? process.env.MYCLAW_GATEWAY_TOKEN ?? "",
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
  if (request.method === "POST" && (url.pathname === "/feishu/events" || url.pathname === "/api/feishu/events")) {
    await handlePostFeishuEvent(request, response, context);
    return;
  }
  if (request.method === "POST" && (url.pathname === "/messages" || url.pathname === "/api/messages")) {
    if (!authorizeMutation(request, response, context)) {
      return;
    }
    await handlePostMessage(request, response, context);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/openclaw-migration/stage") {
    if (!authorizeMutation(request, response, context)) {
      return;
    }
    await handlePostOpenClawMigrationStage(request, response, context);
    return;
  }
  if (request.method === "POST" && approvalDecisionId) {
    if (!authorizeApprovalDecision(request, response, context)) {
      return;
    }
    await handlePostApprovalDecision(request, response, context, approvalDecisionId);
    return;
  }

  if (request.method === "GET" && (await handleGetRequest(url, response, context))) {
    return;
  }

  sendJson(response, request.method === "GET" ? 404 : 405, {
    ok: false,
    error: { code: request.method === "GET" ? "not_found" : "method_not_allowed" },
  });
}

function authorizeMutation(request, response, context) {
  const auth = authorizeGatewayMutation(request, context);
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
  });
  if (!auth.ok) {
    sendJson(response, auth.status, auth.payload);
    return false;
  }
  return true;
}
