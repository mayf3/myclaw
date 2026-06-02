import { createSmokeNoteToolRequest } from "../../../tools/src/smoke-note.mjs";
import { readJsonBody, sendJson } from "../http.mjs";

export async function handlePostSmokeNoteToolRequest(request, response, context) {
  const { body } = await readJsonBody(request);
  const result = await createSmokeNoteToolRequest(context.stateDir, {
    note: body.note,
    requestedBy: body.requestedBy || "gateway",
  });
  sendJson(response, 200, { ok: true, ...result });
}
