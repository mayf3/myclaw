import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildOpenduckEnv, buildSafeSummary, writeLocalEnvFile } from "../import-openduck-config.mjs";

test("openduck import maps supported Feishu fields only", () => {
  const result = buildOpenduckEnv({
    channels: {
      feishu: {
        appId: "cli_app_id",
        appSecret: "secret-value-that-must-not-print",
        connectionMode: "websocket",
        domain: "feishu",
        verificationToken: "verify-token",
        encryptKey: "encrypt-key",
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
      },
    },
    gateway: { port: 19092, auth: { token: "gateway-token" } },
  });

  assert.equal(result.env.MYCLAW_FEISHU_APP_ID, "cli_app_id");
  assert.equal(result.env.MYCLAW_FEISHU_CONNECTION_MODE, "websocket");
  assert.equal(result.env.MYCLAW_FEISHU_APP_SECRET, "secret-value-that-must-not-print");
  assert.equal(result.env.MYCLAW_GATEWAY_TOKEN, undefined);
  assert.equal(result.env.MYCLAW_OPENDUCK_GATEWAY_PORT, undefined);
  assert.deepEqual(result.missingKeys, []);
});

test("safe summary lists keys but never secret values", async () => {
  const dir = await createIgnoredSecretRepo();
  const output = path.join(dir, ".myclaw", "openduck.env");
  const result = writeLocalEnvFile({
    cwd: dir,
    output,
    config: {
      channels: { feishu: { appId: "app", appSecret: "super-secret-value", connectionMode: "websocket" } },
      gateway: { auth: { token: "gateway-secret-value" } },
    },
  });
  const summaryText = JSON.stringify(buildSafeSummary(result));
  const file = await readFile(output, "utf8");
  const fileStat = await stat(output);

  assert.equal(summaryText.includes("super-secret-value"), false);
  assert.equal(summaryText.includes("gateway-secret-value"), false);
  assert.equal(file.includes("super-secret-value"), true);
  assert.equal(fileStat.mode & 0o777, 0o600);
});

test("secret output is restricted to ignored .myclaw paths", async () => {
  const dir = await createIgnoredSecretRepo();
  const config = { channels: { feishu: { appSecret: "super-secret-value" } } };

  assert.throws(
    () => writeLocalEnvFile({ cwd: dir, output: path.join(dir, "docs", "leak.env"), config }),
    /outside \.myclaw/,
  );

  await symlink(path.join(dir, "docs"), path.join(dir, ".myclaw-link"));
  assert.throws(
    () => writeLocalEnvFile({ cwd: dir, output: path.join(dir, ".myclaw-link", "leak.env"), config }),
    /outside \.myclaw/,
  );

  await symlink(path.join(dir, "docs"), path.join(dir, ".myclaw"));
  assert.throws(
    () => writeLocalEnvFile({ cwd: dir, output: path.join(dir, ".myclaw", "leak.env"), config }),
    /symlink/,
  );
});

async function createIgnoredSecretRepo() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "myclaw-openduck-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  await writeFile(path.join(dir, ".gitignore"), ".myclaw/\n");
  return dir;
}
