import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_STALE_MS = 5 * 60 * 1000;

export function createFeishuReplayStore(options = {}) {
  const stateDir = options.stateDir;
  if (!stateDir) {
    return createMemoryReplayStore();
  }
  const replayDir = path.join(stateDir, "feishu-bot", "replay");
  const staleMs = Number(options.staleMs || DEFAULT_STALE_MS);
  const now = options.now || (() => new Date());
  return {
    async reserve(eventId) {
      const id = normalizeEventId(eventId);
      if (!id) {
        return { ok: true, duplicate: false, transient: true };
      }
      await mkdir(replayDir, { recursive: true });
      const filePath = replayPath(replayDir, id);
      const record = {
        eventId: id,
        status: "processing",
        attempts: 1,
        firstSeenAt: now().toISOString(),
        updatedAt: now().toISOString(),
      };
      try {
        await writeJson(filePath, record, "wx");
        return { ok: true, duplicate: false, record };
      } catch (error) {
        if (error?.code !== "EEXIST") {
          throw error;
        }
      }
      const existing = await readReplayRecord(filePath);
      if (existing.status === "failed" || isStaleProcessing(existing, staleMs, now())) {
        const next = {
          ...existing,
          status: "processing",
          attempts: Number(existing.attempts || 1) + 1,
          updatedAt: now().toISOString(),
        };
        await writeJson(filePath, next);
        return { ok: true, duplicate: false, record: next };
      }
      return { ok: true, duplicate: true, status: existing.status || "seen", record: existing };
    },
    async complete(eventId, patch = {}) {
      await updateReplayRecord(replayDir, eventId, { status: patch.status || "completed", ...patch }, now);
    },
    async fail(eventId, patch = {}) {
      await updateReplayRecord(replayDir, eventId, { status: "failed", ...patch }, now);
    },
  };
}

function createMemoryReplayStore() {
  const seen = new Set();
  return {
    async reserve(eventId) {
      const id = normalizeEventId(eventId);
      if (!id) {
        return { ok: true, duplicate: false, transient: true };
      }
      if (seen.has(id)) {
        return { ok: true, duplicate: true, status: "completed" };
      }
      seen.add(id);
      return { ok: true, duplicate: false };
    },
    async complete() {},
    async fail(eventId) {
      const id = normalizeEventId(eventId);
      if (id) {
        seen.delete(id);
      }
    },
  };
}

async function updateReplayRecord(replayDir, eventId, patch, now) {
  const id = normalizeEventId(eventId);
  if (!id) {
    return;
  }
  await mkdir(replayDir, { recursive: true });
  const filePath = replayPath(replayDir, id);
  const existing = await readReplayRecord(filePath).catch(() => ({ eventId: id, attempts: 1 }));
  await writeJson(filePath, {
    ...existing,
    ...patch,
    eventId: id,
    updatedAt: now().toISOString(),
  });
}

async function readReplayRecord(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value, flag = "w") {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag });
}

function replayPath(replayDir, eventId) {
  const key = createHash("sha256").update(eventId).digest("hex");
  return path.join(replayDir, `${key}.json`);
}

function normalizeEventId(value) {
  return String(value || "").trim();
}

function isStaleProcessing(record, staleMs, now) {
  if (record.status !== "processing") {
    return false;
  }
  const updatedAt = Date.parse(record.updatedAt || record.firstSeenAt || "");
  return Number.isFinite(updatedAt) && now.getTime() - updatedAt > staleMs;
}
