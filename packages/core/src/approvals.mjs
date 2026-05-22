import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { appendJsonl, readJson, writeJson } from "./state.mjs";

export function buildApprovalRequest(input = {}) {
  const now = input.createdAt || new Date().toISOString();
  const approvalId = input.approvalId || `approval_${now.replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomUUID().slice(0, 8)}`;
  return {
    kind: "approval-request",
    schemaVersion: 1,
    approvalId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    requestedBy: input.requestedBy || "system",
    title: input.title || "Approval required",
    summary: input.summary || "",
    severity: input.severity || "medium",
    subject: input.subject || { type: "unknown" },
    evidence: input.evidence || [],
    decision: null,
  };
}

export async function createApprovalRequest(stateDir, input = {}) {
  const approval = buildApprovalRequest(input);
  const existing = await readApproval(stateDir, approval.approvalId);
  if (existing.ok) {
    return existing.approval;
  }
  await writeApprovalRecord(stateDir, approval);
  await appendApprovalEvent(stateDir, "approval.created", approval);
  return approval;
}

export async function listApprovals(stateDir, options = {}) {
  const limit = Math.max(1, Number(options.limit || 50));
  const approvalsDir = path.join(stateDir, "approvals");
  let names;
  try {
    names = await readdir(approvalsDir);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const approvals = [];
  for (const name of names.filter((file) => file.endsWith(".json"))) {
    try {
      const approval = await readJson(path.join(approvalsDir, name));
      if (!options.status || approval.status === options.status) {
        approvals.push(approval);
      }
    } catch {
      approvals.push(unreadableApproval(name));
    }
  }
  return approvals
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, limit);
}

export async function readApproval(stateDir, approvalId) {
  const id = safeApprovalId(approvalId);
  if (!id) {
    return { ok: false, status: "invalid_approval_id", approval: null };
  }
  try {
    return { ok: true, approval: await readJson(approvalPath(stateDir, id)) };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { ok: false, status: "not_found", approval: null };
    }
    throw error;
  }
}

export async function decideApproval(stateDir, approvalId, input = {}) {
  const id = safeApprovalId(approvalId);
  if (!id) {
    return { ok: false, status: "invalid_approval_id", approval: null };
  }
  return withApprovalLock(stateDir, id, async () => {
    const existing = await readApproval(stateDir, id);
    if (!existing.ok) {
      return existing;
    }
    const decision = normalizeDecision(input.decision);
    if (!decision) {
      return { ok: false, status: "invalid_decision", approval: existing.approval };
    }
    if (existing.approval.status !== "pending") {
      return { ok: false, status: "already_decided", approval: existing.approval };
    }
    const now = new Date().toISOString();
    const approval = {
      ...existing.approval,
      status: decision,
      updatedAt: now,
      decision: {
        status: decision,
        decidedAt: now,
        decidedBy: input.decidedBy || "local-user",
        reason: input.reason || "",
      },
    };
    await writeApprovalRecord(stateDir, approval);
    await appendApprovalEvent(stateDir, "approval.decided", approval);
    return { ok: true, approval };
  });
}

async function writeApprovalRecord(stateDir, approval) {
  await mkdir(path.join(stateDir, "approvals"), { recursive: true });
  await writeJson(approvalPath(stateDir, approval.approvalId), approval);
}

async function appendApprovalEvent(stateDir, type, approval) {
  const event = {
    type,
    at: new Date().toISOString(),
    approvalId: approval.approvalId,
    status: approval.status,
    subject: approval.subject,
  };
  await appendJsonl(path.join(stateDir, "approvals.jsonl"), event);
  await appendJsonl(path.join(stateDir, "events.jsonl"), event);
}

function normalizeDecision(value) {
  if (value === "approved" || value === "approve") {
    return "approved";
  }
  if (value === "rejected" || value === "reject") {
    return "rejected";
  }
  return null;
}

function safeApprovalId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : "";
}

function approvalPath(stateDir, approvalId) {
  return path.join(stateDir, "approvals", `${approvalId}.json`);
}

async function withApprovalLock(stateDir, approvalId, fn) {
  await mkdir(path.join(stateDir, "approvals"), { recursive: true });
  const lockPath = path.join(stateDir, "approvals", `${approvalId}.lock`);
  const handle = await acquireLock(lockPath);
  try {
    return await fn();
  } finally {
    await handle.close();
    await unlink(lockPath).catch(() => {});
  }
}

async function acquireLock(lockPath) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await open(lockPath, "wx");
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
      await sleep(10);
    }
  }
  const error = new Error("Approval is locked");
  error.code = "APPROVAL_LOCK_TIMEOUT";
  throw error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unreadableApproval(name) {
  return {
    kind: "approval-request",
    schemaVersion: 1,
    approvalId: name.replace(/\.json$/, ""),
    status: "unreadable",
    createdAt: null,
    updatedAt: null,
    title: "Unreadable approval",
    summary: "Approval file could not be parsed.",
    severity: "high",
    subject: { type: "unreadable" },
    evidence: [],
    decision: null,
  };
}
