import { buildOpenClawStageSummary } from "../../../control-plane/src/status.mjs";
import { buildOpenClawStageReview } from "../../../control-plane/src/openclaw-diff.mjs";
import { stageOpenClawMigration } from "../../../migrate/src/stage.mjs";
import { readJsonBody, sendJson } from "../http.mjs";

export async function handlePostOpenClawMigrationStage(request, response, context) {
  const { body } = await readJsonBody(request);
  const stage = await stageOpenClawMigration({
    source: body.source || context.openclawSource,
    stateDir: context.stateDir,
  });
  const review = buildOpenClawStageReview(stage.plan, stage);
  sendJson(response, 200, {
    ok: true,
    stage,
    stageSummary: buildOpenClawStageSummary(stage.plan, stage),
    review,
    diff: review,
  });
}
