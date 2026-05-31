import { listChannels } from "../../channels/src/index.mjs";
import { listApprovals, readApproval } from "../../core/src/approvals.mjs";
import { listAuditEvents } from "../../core/src/audit.mjs";
import { listRuns, readEvents, readRun } from "../../core/src/state.mjs";
import { buildFeishuAdapterConfig, describeFeishuAdapterReadiness } from "../../feishu-adapter/src/index.mjs";
import { planOpenClawMigration } from "../../migrate/src/openclaw.mjs";
import { readLatestOpenClawStage } from "../../migrate/src/stage.mjs";
import { buildHumanExperimentsPayload } from "./experiments.mjs";
import { buildMilestonesPayload } from "./milestones.mjs";
import { buildOpenClawStageReview } from "./openclaw-diff.mjs";
import { buildFeishuAdoptionPayload, buildReferenceCompletionPayload } from "./reference-completion.mjs";
import { redactEvents, redactRunDetail, redactRunRecord } from "./redaction.mjs";

const MIGRATION_PLAN_CACHE_MS = 5000;
const migrationPlanCache = new Map();

export async function buildStatusPayload(context) {
  const [runs, events, approvals, migrationPlan, migrationStage] = await Promise.all([
    listRuns(context.stateDir, { limit: 20 }),
    readEvents(context.stateDir, { limit: 50 }),
    listApprovals(context.stateDir, { limit: 20 }),
    cachedOpenClawPlan(context.openclawSource),
    readLatestOpenClawStage(context.stateDir),
  ]);
  const [audit, health] = await Promise.all([
    listAuditEvents(context.stateDir, { limit: 20 }),
    buildRuntimeHealthPayload(context),
  ]);
  const stageSummary = buildOpenClawStageSummary(migrationPlan, migrationStage);
  const stageReview = buildOpenClawStageReview(migrationPlan, migrationStage);
  return {
    ok: true,
    service: context.service || "myclaw-control-plane",
    at: new Date().toISOString(),
    stateDir: context.stateDir,
    channels: listChannels(),
    milestones: buildMilestonesPayload(),
    experiments: buildHumanExperimentsPayload(),
    health,
    approvals,
    runs: runs.map(redactRunRecord),
    events: redactEvents(events),
    audit,
    openclawMigration: migrationPlan,
    openclawStage: migrationStage,
    openclawStageSummary: stageSummary,
    openclawStageReview: stageReview,
    openclawStageDiff: stageReview,
  };
}

export async function buildRunsPayload(context, options = {}) {
  return {
    ok: true,
    runs: (await listRuns(context.stateDir, { limit: options.limit || 50 })).map(redactRunRecord),
  };
}

export async function buildRunPayload(context, options = {}) {
  const run = await readRun(context.stateDir, options.runId);
  if (run.status === "invalid_run_id" || run.status === "not_found") {
    return {
      ok: false,
      error: { code: run.status, message: run.summary },
      run,
    };
  }
  return {
    ok: true,
    run: redactRunDetail(run),
  };
}

export async function buildEventsPayload(context, options = {}) {
  return {
    ok: true,
    events: redactEvents(await readEvents(context.stateDir, { limit: options.limit || 100 })),
  };
}

export async function buildAuditPayload(context, options = {}) {
  return {
    ok: true,
    audit: await listAuditEvents(context.stateDir, { limit: options.limit || 100 }),
  };
}

export async function buildOpenClawMigrationPayload(context, options = {}) {
  const [plan, stage] = await Promise.all([
    cachedOpenClawPlan(options.source || context.openclawSource),
    readLatestOpenClawStage(context.stateDir),
  ]);
  const stageSummary = buildOpenClawStageSummary(plan, stage);
  const review = buildOpenClawStageReview(plan, stage);
  return {
    ok: true,
    plan,
    stage,
    stageSummary,
    review,
    diff: review,
  };
}

export async function buildApprovalsPayload(context, options = {}) {
  return {
    ok: true,
    approvals: await listApprovals(context.stateDir, {
      limit: options.limit || 50,
      status: options.status,
    }),
  };
}

export async function buildApprovalPayload(context, options = {}) {
  const payload = await readApproval(context.stateDir, options.approvalId);
  if (!payload.ok) {
    return {
      ok: false,
      error: { code: payload.status, message: "Approval not found or invalid" },
      approval: payload.approval,
    };
  }
  return { ok: true, approval: payload.approval };
}

export function buildReferenceCompletionStatusPayload() {
  return {
    ok: true,
    referenceCompletion: buildReferenceCompletionPayload(),
  };
}

export function buildMilestonesStatusPayload() {
  return {
    ok: true,
    milestones: buildMilestonesPayload(),
  };
}

export function buildHumanExperimentsStatusPayload() {
  return {
    ok: true,
    experiments: buildHumanExperimentsPayload(),
  };
}

export function buildFeishuAdoptionStatusPayload(context = {}) {
  const adapterConfig = buildFeishuAdapterConfig({
    verificationToken: context.feishuVerifyToken,
    encryptKey: context.feishuEncryptKey,
  });
  return {
    ok: true,
    feishuAdoption: buildFeishuAdoptionPayload(),
    feishuAdapter: describeFeishuAdapterReadiness(adapterConfig),
  };
}

export async function buildRuntimeHealthPayload(context = {}) {
  const adapter = describeFeishuAdapterReadiness(
    buildFeishuAdapterConfig({
      verificationToken: context.feishuVerifyToken,
      encryptKey: context.feishuEncryptKey,
    }),
  );
  const htmlCenter = await checkHttpHealth(context.htmlCenterUrl || process.env.HTML_CENTER_URL || "http://127.0.0.1:4177");
  const auth = mutationAuthHealth(context);
  const items = [
    healthItem("control-plane", "Control API", "ok", context.service || "myclaw-control-plane"),
    healthItem("state-store", "Local state", "ok", "runs/events/audit readable"),
    healthItem("html-center", "HTML Center", htmlCenter.ok ? "ok" : "warn", htmlCenter.summary),
    healthItem("feishu-adapter", "Feishu adapter", adapter.level === "blocked" ? "fail" : adapter.level === "ready" ? "ok" : "warn", adapter.level),
    healthItem("mutation-auth", "Mutation auth", auth.status, auth.summary),
  ];
  return {
    schemaVersion: 1,
    at: new Date().toISOString(),
    summary: healthSummary(items),
    items,
  };
}

async function cachedOpenClawPlan(source) {
  const key = source || "<default>";
  const now = Date.now();
  const cached = migrationPlanCache.get(key);
  if (cached && now - cached.at < MIGRATION_PLAN_CACHE_MS) {
    return cached.plan;
  }
  try {
    const plan = await planOpenClawMigration({ source });
    migrationPlanCache.set(key, { at: now, plan });
    return plan;
  } catch (error) {
    return {
      kind: "openclaw-migration-plan",
      generatedAt: new Date().toISOString(),
      source,
      repoRoot: null,
      configPath: null,
      config: { exists: false, parsed: false, parseError: error instanceof Error ? error.message : String(error), sections: [] },
      inventory: { channels: [], pluginEntries: [], bundledPluginManifests: 0 },
      myclawDraft: { source: "openclaw", configPath: null, repoRoot: null, channels: [], plugins: [] },
      unsupported: [{ type: "planner-error", id: "openclaw", reason: error instanceof Error ? error.message : String(error) }],
      recommendedSteps: ["Fix OpenClaw source access before staging migration."],
      destructive: false,
    };
  }
}

async function checkHttpHealth(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 600);
  try {
    const response = await fetch(`${String(baseUrl).replace(/\/$/, "")}/api/health`, { signal: controller.signal });
    return { ok: response.ok, summary: response.ok ? "ready" : `http ${response.status}` };
  } catch {
    return { ok: false, summary: "unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}

function mutationAuthHealth(context) {
  const token = String(context.token ?? process.env.MYCLAW_GATEWAY_TOKEN ?? "");
  if (token) {
    return { status: "ok", summary: "token configured" };
  }
  if (isLoopbackHost(context.host || "127.0.0.1")) {
    return { status: "warn", summary: "loopback mutations allowed without token" };
  }
  return { status: "fail", summary: "non-loopback mutations require token" };
}

function isLoopbackHost(host) {
  return ["127.0.0.1", "localhost", "::1"].includes(String(host || "").toLowerCase());
}

function healthItem(id, label, status, summary) {
  return { id, label, status, summary };
}

function healthSummary(items) {
  return {
    ok: items.filter((item) => item.status === "ok").length,
    warn: items.filter((item) => item.status === "warn").length,
    fail: items.filter((item) => item.status === "fail").length,
  };
}

export function buildOpenClawStageSummary(plan, stage) {
  if (!stage) {
    return {
      kind: "openclaw-stage-summary",
      schemaVersion: 1,
      forReviewOnly: true,
      status: "not-staged",
      modules: [],
      missingExpected: [],
      blocked: plan.unsupported.length,
      counts: {
        planChannels: plan.inventory.channels.length,
        planPlugins: plan.inventory.pluginEntries.length,
        planUnsupported: plan.unsupported.length,
        stagedModules: 0,
      },
    };
  }
  const stagedIds = new Set((stage.modules || []).map((module) => module.id));
  const expected = ["feishu", "plugins", "config", "unsupported"].filter((id) => {
    if (id === "feishu") {
      return plan.inventory.channels.some((channel) => ["feishu", "lark"].includes(channel.id));
    }
    if (id === "plugins") {
      return plan.inventory.pluginEntries.length > 0;
    }
    if (id === "config") {
      return plan.config.sections.length > 0;
    }
    return plan.unsupported.length > 0;
  });
  return {
    kind: "openclaw-stage-summary",
    schemaVersion: 1,
    forReviewOnly: true,
    status: stage.status || "staged",
    stageId: stage.stageId,
    checksum: stage.checksum,
    blocked: stage.blocked?.length || 0,
    modules: (stage.modules || []).map((module) => ({
      id: module.id,
      status: module.status,
      nextAction: module.nextAction,
      expected: expected.includes(module.id),
    })),
    missingExpected: expected.filter((id) => !stagedIds.has(id)),
    counts: {
      planChannels: plan.inventory.channels.length,
      planPlugins: plan.inventory.pluginEntries.length,
      planUnsupported: plan.unsupported.length,
      stagedModules: stage.modules?.length || 0,
    },
  };
}
