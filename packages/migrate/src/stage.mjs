import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { readJson, resolveStateDir } from "../../core/src/state.mjs";
import { planOpenClawMigration } from "./openclaw.mjs";

export async function stageOpenClawMigration(options = {}) {
  const stateDir = resolveStateDir(options.stateDir);
  const plan = options.plan || (await planOpenClawMigration({ source: options.source }));
  const snapshot = buildStageSnapshot(plan);
  const outputPath = options.outputPath
    ? path.resolve(options.outputPath)
    : path.join(stateDir, "migrations", "openclaw", `${snapshot.stageId}.json`);
  await writeJsonAtomic(outputPath, snapshot);
  await writeJsonAtomic(path.join(stateDir, "migrations", "openclaw", "latest.json"), {
    stageId: snapshot.stageId,
    path: outputPath,
    generatedAt: snapshot.generatedAt,
    source: snapshot.source,
    status: snapshot.status,
  });
  return { ...snapshot, path: outputPath };
}

export async function readLatestOpenClawStage(stateDirInput) {
  const stateDir = resolveStateDir(stateDirInput);
  try {
    const latest = await readJson(path.join(stateDir, "migrations", "openclaw", "latest.json"));
    const snapshot = await readJson(latest.path);
    return { ...snapshot, path: latest.path };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    return {
      kind: "openclaw-migration-stage",
      status: "unreadable",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildStageSnapshot(plan) {
  const modules = buildModules(plan);
  return {
    kind: "openclaw-migration-stage",
    schemaVersion: 1,
    stageId: `openclaw_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomUUID().slice(0, 8)}`,
    generatedAt: new Date().toISOString(),
    source: plan.source,
    status: "staged",
    destructive: false,
    summary: {
      channels: plan.inventory.channels.length,
      plugins: plan.inventory.pluginEntries.length,
      unsupported: plan.unsupported.length,
      modules: modules.length,
    },
    modules,
    applyOrder: modules.filter((module) => module.status !== "blocked").map((module) => module.id),
    blocked: plan.unsupported,
    rollback: {
      supported: false,
      strategy: "Stage mode does not mutate runtime config; deleting this snapshot only discards the proposal.",
    },
    plan,
    checksum: createSnapshotChecksum(plan, modules),
  };
}

function buildModules(plan) {
  const modules = [];
  const feishuLike = plan.inventory.channels.filter((channel) => ["feishu", "lark"].includes(channel.id));
  if (feishuLike.length) {
    modules.push({
      id: "feishu",
      status: "ready-for-review",
      sourceChannels: feishuLike.map((channel) => channel.id),
      myclawTargets: ["feishu-event", "feishu-webhook"],
      nextAction: "Review credentials and enable only after gateway verification is configured.",
    });
  }
  if (plan.inventory.pluginEntries.length) {
    modules.push({
      id: "plugins",
      status: "draft-only",
      count: plan.inventory.pluginEntries.length,
      nextAction: "Convert manifests into MyClaw plugin draft records; do not execute plugin code yet.",
    });
  }
  if (plan.config.sections.length) {
    modules.push({
      id: "config",
      status: "preserved",
      sections: plan.config.sections,
      nextAction: "Map supported sections one by one and preserve unsupported raw config for manual review.",
    });
  }
  if (plan.unsupported.length) {
    modules.push({
      id: "unsupported",
      status: "blocked",
      count: plan.unsupported.length,
      nextAction: "Implement dedicated MyClaw schemas before apply.",
    });
  }
  return modules;
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

function createSnapshotChecksum(plan, modules) {
  return createHash("sha256")
    .update(JSON.stringify({ source: plan.source, generatedAt: plan.generatedAt, modules, unsupported: plan.unsupported }))
    .digest("hex");
}
