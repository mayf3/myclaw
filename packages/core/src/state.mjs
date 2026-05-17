import { mkdir, appendFile, writeFile, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export function resolveStateDir(input) {
  if (input) {
    return path.resolve(input);
  }
  if (process.env.MYCLAW_STATE_DIR) {
    return path.resolve(process.env.MYCLAW_STATE_DIR);
  }
  return path.resolve(process.cwd(), ".myclaw", "state");
}

export async function ensureStateDir(stateDir) {
  await mkdir(stateDir, { recursive: true });
  await mkdir(path.join(stateDir, "runs"), { recursive: true });
}

export async function appendJsonl(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function listRuns(stateDir, options = {}) {
  const limit = Math.max(1, Number(options.limit || 50));
  const runsDir = path.join(stateDir, "runs");
  let names;
  try {
    names = await readdir(runsDir);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const records = [];
  for (const name of names.filter((file) => file.endsWith(".json"))) {
    const filePath = path.join(runsDir, name);
    try {
      const [fileStat, envelope] = await Promise.all([stat(filePath), readJson(filePath)]);
      records.push({
        runId: envelope.runId || name.replace(/\.json$/, ""),
        ok: Boolean(envelope.ok),
        status: envelope.status || (envelope.ok ? "ok" : "failed"),
        startedAt: envelope.events?.[0]?.at || fileStat.birthtime.toISOString(),
        updatedAt: fileStat.mtime.toISOString(),
        elapsedMs: envelope.usage?.elapsedMs ?? null,
        eventCount: envelope.events?.length ?? 0,
        summary: summarizeEnvelope(envelope),
        envelope,
      });
    } catch {
      records.push({
        runId: name.replace(/\.json$/, ""),
        ok: false,
        status: "unreadable",
        startedAt: null,
        updatedAt: null,
        elapsedMs: null,
        eventCount: 0,
        summary: "Unreadable run file",
        envelope: null,
      });
    }
  }

  return records
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, limit);
}

export async function readRun(stateDir, runId) {
  const id = String(runId || "").trim();
  if (!isSafeRunId(id)) {
    return missingRun(id, "invalid_run_id", "Invalid run id");
  }
  let envelope;
  try {
    envelope = await readJson(runStatePath(stateDir, id, ".json"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return missingRun(id, "not_found", "Run not found");
    }
    throw error;
  }
  let events = [];
  try {
    const text = await readFile(runStatePath(stateDir, id, ".jsonl"), "utf8");
    events = text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
  return {
    runId: envelope.runId || id,
    ok: Boolean(envelope.ok),
    status: envelope.status || (envelope.ok ? "ok" : "failed"),
    summary: summarizeEnvelope(envelope),
    events,
    envelope,
  };
}

export async function readEvents(stateDir, options = {}) {
  const limit = Math.max(1, Number(options.limit || 100));
  let text;
  try {
    text = await readFile(path.join(stateDir, "events.jsonl"), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { type: "state.event.unreadable", raw: line };
      }
    })
    .slice(-limit)
    .reverse();
}

export async function recordRun(stateDir, runId, envelope) {
  await ensureStateDir(stateDir);
  await writeJson(runStatePath(stateDir, runId, ".json"), envelope);
  for (const event of envelope.events ?? []) {
    await appendJsonl(path.join(stateDir, "events.jsonl"), { runId, ...event });
    await appendJsonl(runStatePath(stateDir, runId, ".jsonl"), event);
  }
}

function isSafeRunId(value) {
  return /^[A-Za-z0-9_-]+$/.test(String(value || ""));
}

function runStatePath(stateDir, runId, suffix) {
  const id = String(runId || "").trim();
  if (!isSafeRunId(id)) {
    const error = new Error("Invalid run id");
    error.code = "INVALID_RUN_ID";
    throw error;
  }
  return path.join(stateDir, "runs", `${id}${suffix}`);
}

function missingRun(runId, status, summary) {
  return {
    runId,
    ok: false,
    status,
    summary,
    events: [],
    envelope: null,
  };
}

function summarizeEnvelope(envelope) {
  if (envelope.result?.inbound) {
    return `${envelope.result.inbound.channel} inbound: ${envelope.result.inbound.text}`;
  }
  if (envelope.result?.text) {
    return `${envelope.result.channel} send: ${envelope.result.text}`;
  }
  if (envelope.error) {
    return `${envelope.error.code}: ${envelope.error.message}`;
  }
  return envelope.status || "run";
}
