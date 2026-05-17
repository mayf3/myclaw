import http from "node:http";
import { URL } from "node:url";
import { renderDashboardHtml } from "../../dashboard/src/index.mjs";
import { receiveMessage } from "../../runtime/src/messages.mjs";
import { resolveStateDir } from "../../core/src/state.mjs";
import {
  buildEventsPayload,
  buildOpenClawMigrationPayload,
  buildRunsPayload,
  buildStatusPayload,
} from "../../control-plane/src/status.mjs";

const MAX_BODY_BYTES = 1024 * 1024;

export async function startGateway(options = {}) {
  const host = options.host || "127.0.0.1";
  const port = Number(options.port ?? process.env.MYCLAW_GATEWAY_PORT ?? 4321);
  const stateDir = resolveStateDir(options.stateDir);
  const openclawSource = options.openclawSource;
  const server = http.createServer((request, response) => {
    handleGatewayRequest(request, response, { stateDir, openclawSource }).catch((error) => {
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
  if (request.method === "POST" && (url.pathname === "/messages" || url.pathname === "/api/messages")) {
    await handlePostMessage(request, response, context);
    return;
  }

  if (request.method === "GET") {
    await handleGetRequest(url, response, context);
    return;
  }

  sendJson(response, 405, { ok: false, error: { code: "method_not_allowed" } });
}

async function handleGetRequest(url, response, context) {
  if (url.pathname === "/") {
    sendHtml(response, renderDashboardHtml());
    return;
  }
  if (url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, service: "myclaw-gateway", at: new Date().toISOString() });
    return;
  }
  if (url.pathname === "/api/status") {
    sendJson(response, 200, await buildStatusPayload({ ...context, service: "myclaw-gateway" }));
    return;
  }
  if (url.pathname === "/api/runs") {
    sendJson(response, 200, await buildRunsPayload(context, { limit: Number(url.searchParams.get("limit") || 50) }));
    return;
  }
  if (url.pathname === "/api/events") {
    sendJson(response, 200, await buildEventsPayload(context, { limit: Number(url.searchParams.get("limit") || 100) }));
    return;
  }
  if (url.pathname === "/api/openclaw-migration") {
    const source = url.searchParams.get("source") || context.openclawSource;
    sendJson(response, 200, await buildOpenClawMigrationPayload(context, { source }));
    return;
  }
  sendJson(response, 404, { ok: false, error: { code: "not_found" } });
}

async function handlePostMessage(request, response, context) {
  const body = await readJsonBody(request);
  const text = body.text ?? body.message?.text;
  if (!String(text || "").trim()) {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: "missing_text",
        message: "Missing message text.",
      },
    });
    return;
  }

  const envelope = await receiveMessage({
    text,
    channelId: body.channel || body.channelId || "console",
    senderId: body.from || body.senderId || body.sender?.id || "gateway-user",
    senderName: body.senderName || body.sender?.displayName,
    conversationId: body.conversation || body.conversationId || body.target,
    replyText: body.reply || body.replyText || "",
    webhookUrl: body.webhookUrl,
    stateDir: context.stateDir,
    source: "gateway",
    raw: body,
  });

  sendJson(response, envelope.ok ? 200 : 422, envelope);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let text = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large."));
        request.destroy();
        return;
      }
      text += chunk;
    });
    request.on("end", () => {
      if (!text.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendHtml(response, html) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}
