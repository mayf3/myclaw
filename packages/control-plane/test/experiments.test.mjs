import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHumanExperimentsPayload } from "../src/experiments.mjs";

test("human experiment layers reference valid experiments in strict order", () => {
  const payload = buildHumanExperimentsPayload();
  const experimentById = new Map(payload.experiments.map((item) => [item.id, item]));
  assert.deepEqual(
    payload.layerRoadmap.map((item) => item.id),
    ["L0", "L1", "L2", "L3", "L4", "L5", "L6"],
  );

  for (const layer of payload.layerRoadmap) {
    assert.notEqual(layer.experiments.length, 0);
    for (const experimentId of layer.experiments) {
      assert.equal(experimentById.has(experimentId), true, `${layer.id} references missing ${experimentId}`);
    }
    if (layer.status === "ready") {
      const statuses = layer.experiments.map((experimentId) => experimentById.get(experimentId).status);
      assert.deepEqual(statuses, statuses.map(() => "ready"), `${layer.id} cannot be ready with blocked experiments`);
    }
  }
});
