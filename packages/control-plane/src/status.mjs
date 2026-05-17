import { listChannels } from "../../channels/src/index.mjs";
import { listRuns, readEvents } from "../../core/src/state.mjs";
import { planOpenClawMigration } from "../../migrate/src/openclaw.mjs";

export async function buildStatusPayload(context) {
  const [runs, events, migrationPlan] = await Promise.all([
    listRuns(context.stateDir, { limit: 20 }),
    readEvents(context.stateDir, { limit: 50 }),
    planOpenClawMigration({ source: context.openclawSource }),
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
  return {
    ok: true,
    plan: await planOpenClawMigration({ source: options.source || context.openclawSource }),
  };
}
