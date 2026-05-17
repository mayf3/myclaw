import { stageOpenClawMigration } from "../../../migrate/src/stage.mjs";
import { readJsonBody, sendJson } from "../http.mjs";

export async function handlePostOpenClawMigrationStage(request, response, context) {
  const { body } = await readJsonBody(request);
  const stage = await stageOpenClawMigration({
    source: body.source || context.openclawSource,
    stateDir: context.stateDir,
  });
  sendJson(response, 200, { ok: true, stage });
}
