export const dashboardClientJs = `
const $ = (id) => document.getElementById(id);

$("refresh").addEventListener("click", loadStatus);
loadStatus();

async function loadStatus() {
  $("subtitle").textContent = "正在读取 /api/status ...";
  try {
    const [statusResponse, referenceResponse, feishuResponse] = await Promise.all([
      fetch("/api/status"),
      fetch("/api/reference-completion"),
      fetch("/api/feishu-adoption"),
    ]);
    const statusPayload = await statusResponse.json();
    const referencePayload = await referenceResponse.json();
    const feishuPayload = await feishuResponse.json();
    const runDetail = statusPayload.runs?.[0]?.runId ? await fetchRunDetail(statusPayload.runs[0].runId) : null;
    const payload = {
      ...statusPayload,
      referenceCompletion: referencePayload.referenceCompletion,
      feishuAdoption: feishuPayload.feishuAdoption,
      feishuAdapter: feishuPayload.feishuAdapter,
      runDetail,
    };
    $("rawJson").textContent = JSON.stringify(payload, null, 2);
    if (!payload.ok) {
      $("subtitle").textContent = payload.error?.message || "加载失败";
      return;
    }
    renderOverview(payload);
    renderReferenceCompletion(payload.referenceCompletion);
    renderFeishu(payload.feishuAdoption, payload.feishuAdapter);
    renderMigration(payload.openclawMigration, payload.openclawStage, payload.openclawStageSummary);
    renderRunDetail(payload.runDetail);
    renderRuns(payload.runs || []);
    renderEvents(payload.events || []);
    renderChannels(payload.channels || []);
  } catch (error) {
    $("subtitle").textContent = error instanceof Error ? error.message : String(error);
  }
}

async function fetchRunDetail(runId) {
  const response = await fetch("/api/runs/" + encodeURIComponent(runId));
  if (!response.ok) {
    return null;
  }
  const payload = await response.json();
  return payload.run || null;
}

function renderOverview(payload) {
  $("subtitle").textContent = "State: " + payload.stateDir + " · " + payload.at;
  $("completionScore").textContent = (payload.referenceCompletion?.average ?? "-") + "%";
  $("runCount").textContent = (payload.runs || []).length;
  $("eventCount").textContent = (payload.events || []).length;
  $("migrationRisk").textContent = payload.openclawMigration?.unsupported?.length ?? "-";
}

function renderReferenceCompletion(payload) {
  if (!payload?.modules?.length) {
    $("referenceMatrix").outerHTML = '<div id="referenceMatrix" class="empty">暂无参考矩阵</div>';
    return;
  }
  $("referenceUpdated").textContent = payload.average + "% · " + payload.scale;
  $("referenceMatrix").outerHTML = '<div id="referenceMatrix" class="reference-list">' +
    '<div class="reference-row reference-header"><strong>模块</strong><strong>MyClaw</strong><strong>差距与证据</strong><strong>OpenClaw</strong><strong>Hermes</strong><strong>OpenHuman</strong></div>' +
    payload.modules.map((item) => {
      const barClass = item.myclaw < 25 ? "bar bad" : item.myclaw < 55 ? "bar weak" : "bar";
      return '<div class="reference-row">' +
        '<div class="reference-name"><strong>' + esc(item.label) + '</strong><span>Phase ' + esc(item.phase) + ' · ' + esc(item.next) + '</span></div>' +
        '<div><span class="score">' + item.myclaw + '%</span><div class="' + barClass + '"><span style="width:' + item.myclaw + '%"></span></div></div>' +
        '<div><div class="small">' + esc(item.gap) + '</div>' + criteriaList(item.criteria) + '</div>' +
        refScore("OpenClaw", item.openclaw) +
        refScore("Hermes", item.hermes) +
        refScore("OpenHuman", item.openhuman) +
      '</div>';
    }).join("") +
    '</div>';
}

function criteriaList(criteria = []) {
  const done = criteria.filter((item) => item.status === "done").length;
  const partial = criteria.filter((item) => item.status === "partial").length;
  const missing = criteria.filter((item) => item.status === "missing").length;
  return '<details class="criteria"><summary>验收项 ' + done + ' done / ' + partial + ' partial / ' + missing + ' missing</summary>' +
    criteria.map((item) => '<p><span class="tag ' + criteriaTone(item.status) + '">' + esc(item.status) + '</span> ' + esc(item.label) + '<br><span class="small mono">' + esc(item.evidence) + '</span></p>').join("") +
    '</details>';
}

function criteriaTone(status) {
  return status === "done" ? "ok" : status === "partial" ? "warn" : "fail";
}

function refScore(label, score) {
  return '<div class="ref-score"><span class="small">' + esc(label) + '</span><br><strong>' + score + '%</strong></div>';
}

function renderFeishu(payload, adapter) {
  if (!payload) {
    $("feishuPanel").outerHTML = '<div id="feishuPanel" class="empty">暂无 Feishu 决策</div>';
    return;
  }
  const readyClass = adapter?.level === "ready" ? "ok" : adapter?.level === "blocked" ? "fail" : "warn";
  $("feishuDecision").className = "pill " + readyClass;
  $("feishuDecision").textContent = adapter ? "adapter " + adapter.level : "参考，不直接加载";
  $("feishuPanel").outerHTML = '<div id="feishuPanel">' +
    '<p><strong>结论</strong><br>' + esc(payload.verdict) + '</p>' +
    '<p><strong>来源</strong><br><span class="mono">' + esc(payload.source) + '</span> · <span class="mono">' + esc(payload.packageName) + '</span></p>' +
    adapterSummary(adapter) +
    '<div class="decision-grid">' +
      decisionList("可复用设计", payload.reuse, "ok") +
      decisionList("直接加载阻塞", payload.blockers, "warn") +
    '</div>' +
    '<p><strong>下一步</strong><br>' + esc(payload.next) + '</p>' +
    '</div>';
}

function adapterSummary(adapter) {
  if (!adapter) {
    return "";
  }
  const issues = [...(adapter.issues || []), ...(adapter.warnings || [])];
  return '<div class="decision-card"><strong>MyClaw adapter facade</strong>' +
    '<p><span class="tag ' + (adapter.level === "ready" ? "ok" : adapter.level === "blocked" ? "fail" : "warn") + '">' + esc(adapter.level) + '</span> ' +
    esc(adapter.connectionMode) + ' · signed webhook ' + (adapter.signedWebhookReady ? "ready" : "not ready") + '</p>' +
    readinessItem("verification token", adapter.verificationTokenReady) +
    readinessItem("x-lark signature", adapter.signedWebhookReady) +
    readinessItem("outbound app credentials", adapter.outboundReady) +
    issues.map((item) => '<p><span class="small">' + esc(item) + '</span></p>').join("") +
    '</div>';
}

function readinessItem(label, ok) {
  return '<p><span class="tag ' + (ok ? "ok" : "warn") + '">' + (ok ? "ready" : "missing") + '</span> ' + esc(label) + '</p>';
}

function decisionList(title, items, tone) {
  return '<div class="decision-card"><strong>' + esc(title) + '</strong>' +
    (items || []).map((item) => '<p><span class="tag ' + tone + '">' + esc(item) + '</span></p>').join("") +
    '</div>';
}

function renderMigration(plan, stage, summary) {
  if (!plan) {
    $("migrationPanel").outerHTML = '<div id="migrationPanel" class="empty">暂无迁移计划</div>';
    return;
  }
  const channels = (plan.inventory?.channels || []).map((item) => item.id).join(", ") || "无";
  const plugins = plan.inventory?.pluginEntries?.length || 0;
  const unsupported = plan.unsupported || [];
  $("stageStatus").className = stage ? "pill ok" : "pill";
  $("stageStatus").textContent = stage ? "staged" : "未 stage";
  $("migrationPanel").outerHTML = '<div id="migrationPanel">' +
    '<p><strong>来源</strong><br><span class="mono">' + esc(plan.source || "-") + '</span></p>' +
    '<p><strong>配置</strong><br>' + (plan.config?.exists ? "已找到" : "未找到") + ' · ' + (plan.config?.parsed ? "可解析" : "需人工确认") + '</p>' +
    '<p><strong>通道</strong><br>' + esc(channels) + '</p>' +
    '<p><strong>插件清单</strong><br>' + plugins + ' 个 entries/manifests</p>' +
    '<p><strong>Latest stage</strong><br>' + (stage ? '<span class="mono">' + esc(stage.stageId || stage.status) + '</span>' : "尚未 stage") + '</p>' +
    stageSummaryText(summary) +
    '<p>' + (unsupported.length ? '<span class="tag warn">' + unsupported.length + ' 个阻塞项</span>' : '<span class="tag ok">可继续拆解</span>') + '</p>' +
    '</div>';
}

function stageSummaryText(summary) {
  if (!summary) {
    return "";
  }
  return '<p><strong>Stage summary</strong><br>' +
    '<span class="tag info">modules ' + esc(summary.counts?.stagedModules ?? 0) + '</span> ' +
    '<span class="tag ' + ((summary.missingExpected || []).length ? "warn" : "ok") + '">missing ' + esc((summary.missingExpected || []).length) + '</span> ' +
    '<span class="tag ' + (summary.blocked ? "warn" : "ok") + '">blocked ' + esc(summary.blocked || 0) + '</span> ' +
    '<span class="tag warn">review only</span></p>' +
    '<details class="criteria"><summary>模块摘要</summary>' +
    (summary.modules || []).map((item) => '<p><span class="tag info">' + esc(item.id) + '</span> ' + esc(item.status) + '<br><span class="small">' + esc(item.nextAction || "-") + '</span></p>').join("") +
    '</details>';
}

function renderRunDetail(run) {
  if (!run) {
    $("runDetailStatus").className = "pill";
    $("runDetailStatus").textContent = "无 run";
    $("runDetailPanel").outerHTML = '<div id="runDetailPanel" class="empty">暂无 run detail</div>';
    return;
  }
  $("runDetailStatus").className = "pill " + (run.ok ? "ok" : "fail");
  $("runDetailStatus").textContent = run.status || "-";
  const inbound = run.envelope?.result?.inbound;
  const resultText = inbound ? inbound.text : run.envelope?.result?.text || run.envelope?.error?.message || "-";
  $("runDetailPanel").outerHTML = '<div id="runDetailPanel" class="decision-grid">' +
    '<div class="decision-card"><strong>' + esc(run.runId) + '</strong><p>' + esc(run.summary) + '</p><p><span class="small">' + esc(resultText) + '</span></p></div>' +
    '<div class="decision-card"><strong>事件</strong>' +
    (run.events || []).map((event) => '<p><span class="tag info">' + esc(event.type) + '</span><br><span class="small">' + esc(event.at || "-") + '</span></p>').join("") +
    '</div></div>';
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

function capabilityText(capabilities = {}) {
  return ["outbound", "inbound", "reply"]
    .filter((key) => capabilities[key])
    .map((key) => '<span class="tag info">' + key + '</span>')
    .join(" ");
}

function statusTag(status, ok) {
  return '<span class="tag ' + (ok ? "ok" : "fail") + '">' + esc(status) + '</span>';
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
`;
