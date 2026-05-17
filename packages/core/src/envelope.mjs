import { randomUUID } from "node:crypto";

export function createRunId(prefix = "run") {
  const stamp = new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14);
  return `${prefix}_${stamp}_${randomUUID().slice(0, 8)}`;
}

export function createEvent(type, payload = {}) {
  return {
    type,
    at: new Date().toISOString(),
    ...payload,
  };
}

export function okEnvelope({ runId, result, events = [], usage = {} }) {
  return {
    ok: true,
    status: "ok",
    runId,
    result,
    events,
    usage: {
      elapsedMs: 0,
      ...usage,
    },
  };
}

export function errorEnvelope({ runId, code, message, recoverable = false, events = [], usage = {} }) {
  return {
    ok: false,
    status: "failed",
    runId,
    error: {
      code,
      message,
      recoverable,
    },
    events,
    usage: {
      elapsedMs: 0,
      ...usage,
    },
  };
}
