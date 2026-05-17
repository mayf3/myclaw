import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLI = path.resolve("packages/cli/src/index.mjs");

test("migrate openclaw --stage writes a snapshot", async () => {
  const source = await mkdtemp(path.join(tmpdir(), "myclaw-cli-openclaw-"));
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-cli-stage-"));
  await writeFile(path.join(source, "openclaw.json"), "{ channels: { feishu: { enabled: true } } }", "utf8");

  const { stdout } = await execFileAsync(process.execPath, [
    CLI,
    "migrate",
    "openclaw",
    "--source",
    source,
    "--state-dir",
    stateDir,
    "--stage",
    "--json",
  ]);
  const payload = JSON.parse(stdout);
  const snapshot = JSON.parse(await readFile(payload.stage.path, "utf8"));

  assert.equal(payload.ok, true);
  assert.equal(payload.stage.status, "staged");
  assert.equal(snapshot.modules.some((module) => module.id === "feishu"), true);
});
