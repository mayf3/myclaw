import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(new URL("../check-local-secret-leaks.mjs", import.meta.url));

test("local secret leak check reports key names without secret values", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "myclaw-secret-leak-"));
  const secret = "sentinel-secret-value";
  execFileSync("git", ["init", "-q"], { cwd: dir });
  await mkdir(path.join(dir, ".myclaw"));
  await writeFile(path.join(dir, ".myclaw", "local.env"), `export MYCLAW_FEISHU_APP_SECRET='${secret}'\n`);
  await writeFile(path.join(dir, "tracked.md"), `bad ${secret}\n`);
  execFileSync("git", ["add", "tracked.md"], { cwd: dir });

  const result = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MYCLAW_FEISHU_APP_SECRET/);
  assert.equal(result.stderr.includes(secret), false);
});
