import { listChannels } from "../../channels/src/index.mjs";
import { listRuns, readEvents, readRun } from "../../core/src/state.mjs";
import { buildFeishuAdapterConfig, describeFeishuAdapterReadiness } from "../../feishu-adapter/src/index.mjs";
import { planOpenClawMigration } from "../../migrate/src/openclaw.mjs";
import { readLatestOpenClawStage } from "../../migrate/src/stage.mjs";
import { buildHumanExperimentsPayload } from "./experiments.mjs";
import { buildMilestonesPayload } from "./milestones.mjs";
import { buildFeishuAdoptionPayload, buildReferenceCompletionPayload } from "./reference-completion.mjs";

const MIGRATION_PLAN_CACHE_MS = 5000;
const migrationPlanCache = new Map();

export async function buildStatusPayload(context) {
  const [runs, events, migrationPlan, migrationStage] = await Promise.all([
    listRuns(context.stateDir, { limit: 20 }),
    readEvents(context.stateDir, { limit: 50 }),
    cachedOpenClawPlan(context.openclawSource),
    readLatestOpenClawStage(context.stateDir),
  ]);
  const stageSummary = buildOpenClawStageSummary(migrationPlan, migrationStage);
  return {
    ok: true,
    service: context.service || "myclaw-control-plane",
    at: new Date().toISOString(),
    stateDir: context.stateDir,
    channels: listChannels(),
    milestones: buildMilestonesPayload(),
    experiments: buildHumanExperimentsPayload(),
    runs,
    events,
    openclawMigration: migrationPlan,
    openclawStage: migrationStage,
    openclawStageSummary: stageSummary,
    openclawStageDiff: stageSummary,
  };
}

export async function buildRunsPayload(context, options = {}) {
  return {
    ok: true,
    runs: await listRuns(context.stateDir, { limit: options.limit || 50 }),
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
    run,
  };
}

export async function buildEventsPayload(context, options = {}) {
  return {
    ok: true,
    events: await readEvents(context.stateDir, { limit: options.limit || 100 }),
  };
}

export async function buildOpenClawMigrationPayload(context, options = {}) {
  const [plan, stage] = await Promise.all([
    cachedOpenClawPlan(options.source || context.openclawSource),
    readLatestOpenClawStage(context.stateDir),
  ]);
  const stageSummary = buildOpenClawStageSummary(plan, stage);
  return {
    ok: true,
    plan,
    stage,
    stageSummary,
    diff: stageSummary,
  };
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
