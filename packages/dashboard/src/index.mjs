import http from "node:http";
import { URL } from "node:url";
import { resolveStateDir } from "../../core/src/state.mjs";
import {
  buildEventsPayload,
  buildFeishuAdoptionStatusPayload,
  buildOpenClawMigrationPayload,
  buildReferenceCompletionStatusPayload,
  buildRunsPayload,
  buildStatusPayload,
} from "../../control-plane/src/status.mjs";
import { getDashboardAsset } from "./assets.mjs";
import { renderDashboardHtml } from "./view.mjs";

export { getDashboardAsset, renderDashboardHtml };

export async function startDashboard(options = {}) {
  const host = options.host || "127.0.0.1";
  const port = Number(options.port ?? process.env.MYCLAW_DASHBOARD_PORT ?? 4321);
  const stateDir = resolveStateDir(options.stateDir);
  const openclawSource = options.openclawSource;
  const server = http.createServer((request, response) => {
    handleDashboardRequest(request, response, { stateDir, openclawSource }).catch((error) => {
      sendJson(response, 500, {
        ok: false,
        error: {
          code: "dashboard_error",
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

export async function handleDashboardRequest(request, response, context) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (request.method !== "GET") {
    sendJson(response, 405, { ok: false, error: { code: "method_not_allowed" } });
    return;
  }

  if (url.pathname === "/") {
    sendText(response, 200, "text/html; charset=utf-8", renderDashboardHtml());
    return;
  }

  const asset = getDashboardAsset(url.pathname);
  if (asset) {
    sendText(response, 200, asset.contentType, asset.body, "public, max-age=60");
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, service: "myclaw-dashboard", at: new Date().toISOString() });
    return;
  }
  if (url.pathname === "/api/status") {
    sendJson(response, 200, await buildStatusPayload({ ...context, service: "myclaw-dashboard" }));
    return;
  }
  if (url.pathname === "/api/runs") {
    const limit = Number(url.searchParams.get("limit") || 50);
    sendJson(response, 200, await buildRunsPayload(context, { limit }));
    return;
  }
  if (url.pathname === "/api/events") {
    const limit = Number(url.searchParams.get("limit") || 100);
    sendJson(response, 200, await buildEventsPayload(context, { limit }));
    return;
  }
  if (url.pathname === "/api/openclaw-migration") {
    sendJson(response, 200, await buildOpenClawMigrationPayload(context));
    return;
  }
  if (url.pathname === "/api/reference-completion") {
    sendJson(response, 200, buildReferenceCompletionStatusPayload());
    return;
  }
  if (url.pathname === "/api/feishu-adoption") {
    sendJson(response, 200, buildFeishuAdoptionStatusPayload());
    return;
  }

  sendJson(response, 404, { ok: false, error: { code: "not_found" } });
}

function sendJson(response, status, payload) {
  sendText(response, status, "application/json; charset=utf-8", JSON.stringify(payload, null, 2));
}

function sendText(response, status, contentType, body, cacheControl = "no-store") {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": cacheControl,
  });
  response.end(body);
}
