import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { test } from "node:test";
import { planOpenClawMigration } from "../src/openclaw.mjs";

test("OpenClaw migration planner inventories config and plugin manifests", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "myclaw-openclaw-"));
  await mkdir(path.join(root, "extensions", "feishu"), { recursive: true });
  await writeFile(
    path.join(root, "openclaw.json"),
    `{
      channels: {
        feishu: { enabled: true },
        telegram: { enabled: false },
      },
      plugins: {
        entries: {
          feishu: { enabled: true },
        },
      },
      agents: { defaults: { workspace: "~/.openclaw/workspace" } },
    }`,
    "utf8",
  );
  await writeFile(
    path.join(root, "extensions", "feishu", "openclaw.plugin.json"),
    JSON.stringify({ id: "feishu", channels: ["feishu"], contracts: { tools: ["feishu"] } }),
    "utf8",
  );

  const plan = await planOpenClawMigration({ source: root });
  assert.equal(plan.config.exists, true);
  assert.equal(plan.config.parsed, true);
  assert.deepEqual(
    plan.inventory.channels.map((channel) => channel.id),
    ["feishu", "telegram"],
  );
  assert.equal(plan.inventory.pluginEntries.some((plugin) => plugin.id === "feishu"), true);
  assert.equal(plan.myclawDraft.channels.some((channel) => channel.id === "feishu"), true);
  assert.equal(plan.destructive, false);
});
