import { listAuditEvents } from "../../core/src/audit.mjs";
import { readEvents } from "../../core/src/state.mjs";
import { redactEvents } from "./redaction.mjs";

export async function handleControlEventStream(request, response, context = {}, options = {}) {
  const intervalMs = Math.max(500, Number(options.intervalMs || 2000));
  const snapshot = await buildSnapshot(context);
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  await writeSse(response, "snapshot", snapshot);
  const interval = setInterval(() => {
    writeSse(response, "heartbeat", { at: new Date().toISOString() }).catch(() => clearInterval(interval));
  }, intervalMs);
  request.on("close", () => clearInterval(interval));
}

async function buildSnapshot(context) {
  const [events, audit] = await Promise.all([
    readEvents(context.stateDir, { limit: 20 }),
    listAuditEvents(context.stateDir, { limit: 20 }),
  ]);
  return {
    at: new Date().toISOString(),
    events: redactEvents(events),
    audit,
  };
}

function writeSse(response, event, payload) {
  return new Promise((resolve, reject) => {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(payload)}\n\n`, (error) => (error ? reject(error) : resolve()));
  });
}
