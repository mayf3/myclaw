import { listChannels } from "../../channels/src/index.mjs";
import { listRuns, readEvents } from "../../core/src/state.mjs";
import { planOpenClawMigration } from "../../migrate/src/openclaw.mjs";
import { readLatestOpenClawStage } from "../../migrate/src/stage.mjs";

const MIGRATION_PLAN_CACHE_MS = 5000;
const migrationPlanCache = new Map();

export async function buildStatusPayload(context) {
  const [runs, events, migrationPlan, migrationStage] = await Promise.all([
    listRuns(context.stateDir, { limit: 20 }),
    readEvents(context.stateDir, { limit: 50 }),
    cachedOpenClawPlan(context.openclawSource),
    readLatestOpenClawStage(context.stateDir),
  ]);
  return {
    ok: true,
    service: context.service || "myclaw-control-plane",
    at: new Date().toISOString(),
    stateDir: context.stateDir,
    channels: listChannels(),
    runs,
    events,
    openclawMigration: migrationPlan,
    openclawStage: migrationStage,
  };
}

export async function buildRunsPayload(context, options = {}) {
  return {
    ok: true,
    runs: await listRuns(context.stateDir, { limit: options.limit || 50 }),
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
  return {
    ok: true,
    plan,
    stage,
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
