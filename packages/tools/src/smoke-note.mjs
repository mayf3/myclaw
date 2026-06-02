import { randomUUID } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { createApprovalRequest } from "../../core/src/approvals.mjs";
import { appendJsonl, readJson, writeJson } from "../../core/src/state.mjs";

const TOOL_NAME = "smoke.note.write";

export async function createSmokeNoteToolRequest(stateDir, input = {}) {
  const now = new Date().toISOString();
  const toolRequestId = safeToolRequestId(input.toolRequestId) || createToolRequestId();
  const note = normalizeNote(input.note);
  const approval = await createApprovalRequest(stateDir, {
    title: "Approve smoke note tool",
    summary: `Allow MyClaw to execute ${TOOL_NAME} with a local-only note.`,
    severity: "medium",
    requestedBy: input.requestedBy || "gateway",
    subject: { type: "tool-action", toolRequestId, toolName: TOOL_NAME },
    evidence: [
      { label: "tool", value: TOOL_NAME },
      { label: "notePreview", value: note },
      { label: "sideEffect", value: "writes local state/tool-runs only" },
    ],
  });
  const request = {
    kind: "tool-request",
    schemaVersion: 1,
    toolRequestId,
    toolName: TOOL_NAME,
    status: "pending_approval",
    createdAt: now,
    updatedAt: now,
    requestedBy: input.requestedBy || "gateway",
    approvalId: approval.approvalId,
    input: { note },
    result: null,
  };
  await writeToolRequest(stateDir, request);
  await appendToolEvent(stateDir, "tool.request.created", request);
  return { request, approval };
}

export async function settleToolApprovalDecision(stateDir, approval) {
  const subject = approval?.subject || {};
  if (subject.type !== "tool-action" || subject.toolName !== TOOL_NAME) {
    return null;
  }
  const current = await readToolRequest(stateDir, subject.toolRequestId);
  if (!current.ok) {
    return { ok: false, status: current.status, request: null };
  }
  if (current.request.status !== "pending_approval") {
    return { ok: true, status: "already_settled", request: current.request };
  }
  if (approval.status === "rejected") {
    const rejected = updateRequest(current.request, { status: "rejected", result: null });
    await writeToolRequest(stateDir, rejected);
    await appendToolEvent(stateDir, "tool.request.rejected", rejected);
    return { ok: true, status: "rejected", request: rejected };
  }
  if (approval.status !== "approved") {
    return { ok: true, status: "pending", request: current.request };
  }
  const result = await executeSmokeNote(stateDir, current.request);
  const completed = updateRequest(current.request, { status: "completed", result });
  await writeToolRequest(stateDir, completed);
  await appendToolEvent(stateDir, "tool.request.completed", completed);
  return { ok: true, status: "completed", request: completed };
}

export async function listToolRequests(stateDir, options = {}) {
  const limit = Math.max(1, Number(options.limit || 50));
  let names;
  try {
    names = await readdir(toolRequestsDir(stateDir));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const records = [];
  for (const name of names.filter((file) => file.endsWith(".json"))) {
    try {
      records.push(await readJson(path.join(toolRequestsDir(stateDir), name)));
    } catch {
      records.push(unreadableToolRequest(name));
    }
  }
  return records
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, limit);
}

export async function readToolRequest(stateDir, toolRequestId) {
  const id = safeToolRequestId(toolRequestId);
  if (!id) {
    return { ok: false, status: "invalid_tool_request_id", request: null };
  }
  try {
    return { ok: true, request: await readJson(toolRequestPath(stateDir, id)) };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { ok: false, status: "not_found", request: null };
    }
    throw error;
  }
}

async function executeSmokeNote(stateDir, request) {
  const completedAt = new Date().toISOString();
  const toolRunId = `toolrun_${request.toolRequestId}`;
  const run = {
    kind: "tool-run",
    schemaVersion: 1,
    toolRunId,
    toolRequestId: request.toolRequestId,
    toolName: TOOL_NAME,
    status: "completed",
    completedAt,
    input: request.input,
    output: {
      message: `Smoke note recorded: ${request.input.note}`,
      artifact: `tool-runs/${toolRunId}.json`,
    },
  };
  await mkdir(path.join(stateDir, "tool-runs"), { recursive: true });
  await writeJson(path.join(stateDir, "tool-runs", `${toolRunId}.json`), run);
  return {
    toolRunId,
    status: "completed",
    completedAt,
    artifact: run.output.artifact,
    message: run.output.message,
  };
}

async function writeToolRequest(stateDir, request) {
  await mkdir(toolRequestsDir(stateDir), { recursive: true });
  await writeJson(toolRequestPath(stateDir, request.toolRequestId), request);
}

async function appendToolEvent(stateDir, type, request) {
  await appendJsonl(path.join(stateDir, "events.jsonl"), {
    type,
    at: new Date().toISOString(),
    toolRequestId: request.toolRequestId,
    toolName: request.toolName,
    status: request.status,
    approvalId: request.approvalId,
  });
}

function updateRequest(request, patch) {
  return { ...request, ...patch, updatedAt: new Date().toISOString() };
}

function normalizeNote(value) {
  return String(value || "human approval smoke")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function toolRequestsDir(stateDir) {
  return path.join(stateDir, "tool-requests");
}

function toolRequestPath(stateDir, toolRequestId) {
  return path.join(toolRequestsDir(stateDir), `${toolRequestId}.json`);
}

function createToolRequestId() {
  return `tool_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

function safeToolRequestId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : "";
}

function unreadableToolRequest(name) {
  return {
    kind: "tool-request",
    schemaVersion: 1,
    toolRequestId: name.replace(/\.json$/, ""),
    toolName: TOOL_NAME,
    status: "unreadable",
    createdAt: null,
    updatedAt: null,
    approvalId: "",
    input: {},
    result: null,
  };
}
