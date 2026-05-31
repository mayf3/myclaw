import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { appendJsonl, ensureStateDir } from "./state.mjs";

export async function recordAuditEvent(stateDir, input = {}) {
  await ensureStateDir(stateDir);
  const event = {
    auditId: input.auditId || createAuditId(),
    at: input.at || new Date().toISOString(),
    source: safeValue(input.source || "gateway"),
    action: safeValue(input.action || "unknown"),
    method: safeValue(input.method || ""),
    path: safeValue(input.path || ""),
    status: Number(input.status || 0),
    outcome: safeValue(input.outcome || outcomeFromStatus(input.status)),
    elapsedMs: Number(input.elapsedMs || 0),
    actor: sanitizeActor(input.actor),
    resource: sanitizeResource(input.resource),
    errorCode: input.errorCode ? safeValue(input.errorCode) : "",
  };
  await appendJsonl(auditPath(stateDir), event);
  return event;
}

export async function listAuditEvents(stateDir, options = {}) {
  const limit = Math.max(1, Number(options.limit || 50));
  let text;
  try {
    text = await readFile(auditPath(stateDir), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return text
    .split("\n")
    .filter(Boolean)
    .map(parseAuditLine)
    .slice(-limit)
    .reverse();
}

function auditPath(stateDir) {
  return path.join(stateDir, "audit.jsonl");
}

function parseAuditLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return { source: "audit", action: "audit.unreadable", status: 0, outcome: "failed" };
  }
}

function createAuditId() {
  return `audit_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

function outcomeFromStatus(status) {
  const code = Number(status || 0);
  if (code >= 200 && code < 400) {
    return "allowed";
  }
  if (code >= 400 && code < 500) {
    return "blocked";
  }
  return "failed";
}

function sanitizeActor(actor = {}) {
  return {
    kind: safeValue(actor.kind || "unknown"),
    local: Boolean(actor.local),
    tokenProvided: Boolean(actor.tokenProvided),
  };
}

function sanitizeResource(resource = {}) {
  return {
    type: safeValue(resource.type || ""),
    id: safeValue(resource.id || ""),
  };
}

function safeValue(value) {
  return String(value ?? "").slice(0, 160);
}
