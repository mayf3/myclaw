import http from "node:http";
import { URL } from "node:url";
import { renderDashboardHtml } from "../../dashboard/src/index.mjs";
import { receiveMessage } from "../../runtime/src/messages.mjs";
import { resolveStateDir } from "../../core/src/state.mjs";
import { stageOpenClawMigration } from "../../migrate/src/stage.mjs";
import {
  buildEventsPayload,
  buildOpenClawMigrationPayload,
  buildRunsPayload,
  buildStatusPayload,
} from "../../control-plane/src/status.mjs";

const MAX_BODY_BYTES = 1024 * 1024;
const FEISHU_EVENT_TTL_MS = 10 * 60 * 1000;
const seenFeishuEvents = new Map();

export async function startGateway(options = {}) {
  const host = options.host || "127.0.0.1";
  const port = Number(options.port ?? process.env.MYCLAW_GATEWAY_PORT ?? 4321);
  const stateDir = resolveStateDir(options.stateDir);
  const openclawSource = options.openclawSource;
  const token = options.token ?? process.env.MYCLAW_GATEWAY_TOKEN ?? "";
  const feishuVerifyToken = options.feishuVerifyToken ?? process.env.MYCLAW_FEISHU_VERIFY_TOKEN ?? "";
  const server = http.createServer((request, response) => {
    handleGatewayRequest(request, response, { stateDir, openclawSource, host, token, feishuVerifyToken }).catch((error) => {
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
  if (request.method === "POST" && (url.pathname === "/feishu/events" || url.pathname === "/api/feishu/events")) {
    await handlePostFeishuEvent(request, response, context);
    return;
  }
  if (request.method === "POST" && (url.pathname === "/messages" || url.pathname === "/api/messages")) {
    if (!authorizeGatewayMutation(request, response, context)) {
      return;
    }
    await handlePostMessage(request, response, context);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/openclaw-migration/stage") {
    if (!authorizeGatewayMutation(request, response, context)) {
      return;
    }
    await handlePostOpenClawMigrationStage(request, response, context);
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
    sendJson(response, 200, await buildOpenClawMigrationPayload(context));
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

async function handlePostFeishuEvent(request, response, context) {
  const body = await readJsonBody(request);
  if (!authorizeFeishuEvent(request, response, context, body)) {
    return;
  }
  if (body.encrypt) {
    sendJson(response, 501, {
      ok: false,
      error: {
        code: "feishu_encrypt_not_supported",
        message: "Encrypted Feishu callbacks are not supported yet.",
      },
    });
    return;
  }
  if (body.challenge) {
    sendJson(response, 200, { challenge: String(body.challenge) });
    return;
  }

  const eventId = getFeishuEventId(body);
  if (eventId && !reserveFeishuEvent(eventId)) {
    sendJson(response, 200, { ok: true, duplicate: true, eventId });
    return;
  }

  const envelope = await receiveMessage({
    channelId: "feishu-event",
    rawInbound: body,
    stateDir: context.stateDir,
    source: "feishu-event",
  });
  if (eventId && !envelope.ok) {
    seenFeishuEvents.delete(eventId);
  }
  sendJson(response, envelope.ok ? 200 : 422, {
    ...envelope,
    ...(eventId ? { eventId } : {}),
  });
}

async function handlePostOpenClawMigrationStage(request, response, context) {
  const body = await readJsonBody(request);
  const stage = await stageOpenClawMigration({
    source: body.source || context.openclawSource,
    stateDir: context.stateDir,
  });
  sendJson(response, 200, { ok: true, stage });
}

function getFeishuEventId(body = {}) {
  return body.header?.event_id || body.event?.message?.message_id || body.message?.message_id || null;
}

function reserveFeishuEvent(eventId) {
  cleanupFeishuEvents();
  if (seenFeishuEvents.has(eventId)) {
    return false;
  }
  seenFeishuEvents.set(eventId, Date.now());
  return true;
}

function cleanupFeishuEvents() {
  const threshold = Date.now() - FEISHU_EVENT_TTL_MS;
  for (const [eventId, seenAt] of seenFeishuEvents) {
    if (seenAt < threshold) {
      seenFeishuEvents.delete(eventId);
    }
  }
}

function authorizeGatewayMutation(request, response, context) {
  const token = String(context.token || "");
  if (!token && !isLoopbackHost(context.host)) {
    sendJson(response, 403, {
      ok: false,
      error: {
        code: "gateway_token_required",
        message: "Set MYCLAW_GATEWAY_TOKEN before enabling mutations on a non-loopback host.",
      },
    });
    return false;
  }
  if (!token) {
    return true;
  }
  if (readRequestToken(request) === token) {
    return true;
  }
  sendJson(response, 401, { ok: false, error: { code: "unauthorized", message: "Invalid gateway token." } });
  return false;
}

function authorizeFeishuEvent(request, response, context, body) {
  const feishuToken = String(context.feishuVerifyToken || "");
  if (body.token && feishuToken && body.token === feishuToken) {
    return true;
  }
  if (!feishuToken && isLoopbackHost(context.host)) {
    return true;
  }
  const code = feishuToken ? "unauthorized" : "feishu_verification_required";
  const message = feishuToken
    ? "Invalid Feishu verification token."
    : "Set MYCLAW_FEISHU_VERIFY_TOKEN before exposing Feishu callbacks.";
  sendJson(response, code === "unauthorized" ? 401 : 403, { ok: false, error: { code, message } });
  return false;
}

function readRequestToken(request) {
  const authorization = request.headers.authorization || "";
  if (authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  return String(request.headers["x-myclaw-token"] || "");
}

function isLoopbackHost(host) {
  return ["127.0.0.1", "localhost", "::1"].includes(String(host || "").toLowerCase());
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
