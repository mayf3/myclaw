import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLI = path.resolve("packages/cli/src/index.mjs");

test("doctor reports html center health without failing when unreachable", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    CLI,
    "doctor",
    "--json",
    "--html-center-url",
    "http://127.0.0.1:1",
  ]);
  const payload = JSON.parse(stdout);
  assert.equal(payload.version, "0.1.0");
  assert.equal(payload.htmlCenter.ok, false);
  assert.equal(payload.htmlCenter.url, "http://127.0.0.1:1");
});
