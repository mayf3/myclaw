import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLI = path.resolve("packages/cli/src/index.mjs");

test("ask command reports missing LLM config instead of faking a reply", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "myclaw-cli-ask-"));
  const result = await execRejects(process.execPath, [
    CLI,
    "ask",
    "--text",
    "hello from cli",
    "--json",
    "--state-dir",
    stateDir,
  ]);
  const envelope = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "llm_config_required");
});

async function execRejects(command, args) {
  try {
    await execFileAsync(command, args, {
      env: { ...process.env, OPENAI_API_KEY: "", MYCLAW_OPENAI_MODEL: "test-model" },
    });
    assert.fail("Expected command to fail");
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr,
    };
  }
}
