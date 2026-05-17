import http from "node:http";
import { URL } from "node:url";
import { resolveStateDir } from "../../core/src/state.mjs";
import {
  buildEventsPayload,
  buildOpenClawMigrationPayload,
  buildRunsPayload,
  buildStatusPayload,
} from "../../control-plane/src/status.mjs";

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
    sendHtml(response, renderDashboardHtml());
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
    const source = url.searchParams.get("source") || context.openclawSource;
    sendJson(response, 200, await buildOpenClawMigrationPayload(context, { source }));
    return;
  }

  sendJson(response, 404, { ok: false, error: { code: "not_found" } });
}

function sendHtml(response, html) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

export function renderDashboardHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MyClaw Dashboard</title>
    <style>
      :root{color-scheme:light;--bg:#f4f6f8;--panel:#fff;--ink:#17202a;--muted:#637182;--line:#d8dee6;--accent:#0f766e;--accent-soft:#dff3ef;--danger:#991b1b;--danger-soft:#fee2e2;--warn:#9a3412;--warn-soft:#ffedd5;--ok:#166534;--ok-soft:#dcfce7;--code:#111827}
      *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.5}
      a{color:var(--accent);text-decoration:none}a:hover,a:focus{text-decoration:underline}
      .shell{display:grid;grid-template-columns:248px minmax(0,1fr);min-height:100vh}
      aside{position:sticky;top:0;height:100vh;overflow:auto;border-right:1px solid var(--line);background:#fff;padding:20px 16px}
      main{width:100%;max-width:1280px;padding:24px}
      .brand h1{margin:0 0 4px;font-size:21px;line-height:1.2}.brand p{margin:0;color:var(--muted);font-size:12px}
      nav{display:grid;gap:6px;margin-top:20px}nav a{display:block;border-radius:6px;padding:8px 9px;color:#26323d}nav a:hover,nav a:focus{background:var(--accent-soft);text-decoration:none}
      .topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}
      .topbar h2{margin:0 0 4px;font-size:23px}.topbar p{margin:0;color:var(--muted)}
      button{border:1px solid var(--accent);border-radius:6px;background:var(--accent);color:#fff;padding:8px 11px;font:inherit;font-weight:700;cursor:pointer}button.secondary{background:#fff;color:var(--accent)}button:focus{outline:3px solid var(--accent-soft);outline-offset:2px}
      section{margin-bottom:18px}.panel{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:16px}.panel h3{margin:0 0 10px;font-size:16px}
      .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.stat{border:1px solid var(--line);background:#fff;border-radius:8px;padding:13px}.stat strong{display:block;font-size:23px;line-height:1.1}.stat span{color:var(--muted);font-size:12px}
      .grid{display:grid;grid-template-columns:1.25fr .75fr;gap:14px}.split{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:9px 8px;text-align:left;vertical-align:top}th{color:#334155;background:#f1f5f9;font-size:12px}tr:last-child td{border-bottom:0}
      .tag{display:inline-flex;align-items:center;border-radius:999px;background:#eef2f6;color:#334155;padding:2px 8px;font-size:12px;font-weight:700}.tag.ok{background:var(--ok-soft);color:var(--ok)}.tag.fail{background:var(--danger-soft);color:var(--danger)}.tag.warn{background:var(--warn-soft);color:var(--warn)}
      .muted{color:var(--muted)}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.truncate{max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      pre{margin:0;border:1px solid var(--line);border-radius:8px;background:#0f172a;color:#e5e7eb;padding:12px;overflow:auto;max-height:360px}
      .empty{border:1px dashed var(--line);border-radius:8px;padding:18px;color:var(--muted);background:#fafbfc}
      @media (max-width:920px){.shell{display:block}aside{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}nav{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:18px}.stats,.grid,.split{grid-template-columns:1fr}.topbar{display:block}.topbar button{margin-top:12px}}
    </style>
  </head>
  <body>
    <div class="shell">
      <aside>
        <div class="brand">
          <h1>MyClaw Dashboard</h1>
          <p>本地运行状态 · 通道 · OpenClaw 迁移</p>
        </div>
        <nav aria-label="Dashboard 导航">
          <a href="#overview">总览</a>
          <a href="#runs">Runs</a>
          <a href="#events">事件</a>
          <a href="#gateway">Gateway</a>
          <a href="#channels">通道</a>
          <a href="#migration">OpenClaw 迁移</a>
          <a href="#raw">原始状态</a>
        </nav>
      </aside>
      <main>
        <div class="topbar">
          <div>
            <h2>运行控制台</h2>
            <p id="subtitle">正在加载本地状态...</p>
          </div>
          <button type="button" id="refresh">刷新</button>
        </div>

        <section id="overview" class="stats" aria-label="总览指标">
          <div class="stat"><strong id="runCount">-</strong><span>最近 Runs</span></div>
          <div class="stat"><strong id="eventCount">-</strong><span>最近事件</span></div>
          <div class="stat"><strong id="channelCount">-</strong><span>通道数量</span></div>
          <div class="stat"><strong id="migrationRisk">-</strong><span>迁移阻塞项</span></div>
        </section>

        <div class="grid">
          <section id="runs" class="panel">
            <h3>最近 Runs</h3>
            <div id="runsTable" class="empty">暂无运行记录</div>
          </section>

          <section id="events" class="panel">
            <h3>事件 Timeline</h3>
            <div id="eventsTable" class="empty">暂无事件记录</div>
          </section>
        </div>

        <div class="split">
          <section id="gateway" class="panel">
            <h3>Gateway 入口</h3>
            <p class="muted">Dashboard 由 gateway 承载时，可用同源 HTTP 入口模拟外部 channel inbound。</p>
            <pre>POST /messages
Content-Type: application/json

{
  "channel": "console",
  "from": "local-user",
  "conversation": "local-thread",
  "text": "hello",
  "reply": "received"
}</pre>
          </section>

          <section id="channels" class="panel">
            <h3>通道能力</h3>
            <div id="channelsTable" class="empty">暂无通道</div>
          </section>
        </div>

        <div class="split">
          <section id="migration" class="panel">
            <h3>OpenClaw 迁移评估</h3>
            <div id="migrationPanel" class="empty">暂无迁移计划</div>
          </section>
        </div>

        <section id="raw" class="panel">
          <h3>原始状态</h3>
          <pre id="rawJson">{}</pre>
        </section>
      </main>
    </div>
    <script>
      const $ = (id) => document.getElementById(id);
      $("refresh").addEventListener("click", loadStatus);
      loadStatus();

      async function loadStatus() {
        $("subtitle").textContent = "正在读取 /api/status ...";
        const response = await fetch("/api/status");
        const payload = await response.json();
        $("rawJson").textContent = JSON.stringify(payload, null, 2);
        if (!payload.ok) {
          $("subtitle").textContent = payload.error?.message || "加载失败";
          return;
        }
        $("subtitle").textContent = "State: " + payload.stateDir + " · " + payload.at;
        $("runCount").textContent = payload.runs.length;
        $("eventCount").textContent = payload.events.length;
        $("channelCount").textContent = payload.channels.length;
        $("migrationRisk").textContent = payload.openclawMigration.unsupported.length;
        renderRuns(payload.runs);
        renderEvents(payload.events);
        renderChannels(payload.channels);
        renderMigration(payload.openclawMigration);
      }

      function renderRuns(runs) {
        if (!runs.length) {
          $("runsTable").outerHTML = '<div id="runsTable" class="empty">暂无运行记录</div>';
          return;
        }
        $("runsTable").outerHTML = '<div id="runsTable"><table><thead><tr><th>状态</th><th>Run</th><th>摘要</th><th>事件</th><th>更新时间</th></tr></thead><tbody>' +
          runs.map((run) => '<tr><td>' + statusTag(run.status, run.ok) + '</td><td class="mono">' + esc(run.runId) + '</td><td class="truncate">' + esc(run.summary) + '</td><td>' + run.eventCount + '</td><td>' + esc(run.updatedAt || "-") + '</td></tr>').join("") +
          '</tbody></table></div>';
      }

      function renderEvents(events) {
        if (!events.length) {
          $("eventsTable").outerHTML = '<div id="eventsTable" class="empty">暂无事件记录</div>';
          return;
        }
        $("eventsTable").outerHTML = '<div id="eventsTable"><table><thead><tr><th>时间</th><th>类型</th><th>Run</th></tr></thead><tbody>' +
          events.slice(0, 12).map((event) => '<tr><td>' + esc(event.at || "-") + '</td><td class="mono">' + esc(event.type || "-") + '</td><td class="mono">' + esc(event.runId || "-") + '</td></tr>').join("") +
          '</tbody></table></div>';
      }

      function renderChannels(channels) {
        $("channelsTable").outerHTML = '<div id="channelsTable"><table><thead><tr><th>通道</th><th>状态</th><th>能力</th></tr></thead><tbody>' +
          channels.map((channel) => '<tr><td class="mono">' + esc(channel.id) + '</td><td>' + statusTag(channel.configured ? "ready" : "needs config", channel.configured) + '</td><td>' + capabilityText(channel.capabilities) + '</td></tr>').join("") +
          '</tbody></table></div>';
      }

      function renderMigration(plan) {
        const channels = plan.inventory.channels.map((item) => item.id).join(", ") || "无";
        const plugins = plan.inventory.pluginEntries.length;
        const risk = plan.unsupported.length ? '<span class="tag warn">' + plan.unsupported.length + ' 个阻塞项</span>' : '<span class="tag ok">可继续拆解</span>';
        $("migrationPanel").outerHTML = '<div id="migrationPanel">' +
          '<p><strong>来源</strong><br><span class="mono">' + esc(plan.source || "-") + '</span></p>' +
          '<p><strong>配置</strong><br>' + (plan.config.exists ? '已找到' : '未找到') + ' · ' + (plan.config.parsed ? '可解析' : '需人工确认') + '</p>' +
          '<p><strong>通道</strong><br>' + esc(channels) + '</p>' +
          '<p><strong>插件清单</strong><br>' + plugins + ' 个 entries/manifests</p>' +
          '<p>' + risk + '</p>' +
          '</div>';
      }

      function capabilityText(capabilities) {
        return ["outbound", "inbound", "reply"].filter((key) => capabilities[key]).map((key) => '<span class="tag">' + key + '</span>').join(" ");
      }

      function statusTag(status, ok) {
        return '<span class="tag ' + (ok ? "ok" : "fail") + '">' + esc(status) + '</span>';
      }

      function esc(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
      }
    </script>
  </body>
</html>`;
}
