#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { chmodSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_SOURCE = path.join(os.homedir(), ".openduck", "openclaw.json");
const DEFAULT_OUTPUT = path.join(process.cwd(), ".myclaw", "openduck-feishu.env");

export function buildOpenduckEnv(config = {}) {
  const feishu = config.channels?.feishu ?? {};
  const env = {};
  const mappings = [
    ["MYCLAW_FEISHU_APP_ID", [feishu.appId, feishu.app_id, feishu.appID]],
    ["MYCLAW_FEISHU_APP_SECRET", [feishu.appSecret, feishu.app_secret]],
    ["MYCLAW_FEISHU_CONNECTION_MODE", [feishu.connectionMode, feishu.connection_mode]],
    ["MYCLAW_FEISHU_DOMAIN", [feishu.domain]],
    [
      "MYCLAW_FEISHU_VERIFY_TOKEN",
      [feishu.verifyToken, feishu.verificationToken, feishu.verification_token, feishu.token],
    ],
    ["MYCLAW_FEISHU_ENCRYPT_KEY", [feishu.encryptKey, feishu.encrypt_key]],
    [
      "MYCLAW_FEISHU_WEBHOOK_URL",
      [feishu.webhookUrl, feishu.webhook_url, feishu.webhook?.url, feishu.botWebhookUrl, feishu.customBotWebhookUrl],
    ],
  ];

  for (const [key, candidates] of mappings) {
    const value = firstPresent(candidates);
    if (value !== undefined) {
      env[key] = String(value);
    }
  }

  return {
    env,
    writtenKeys: Object.keys(env),
    missingKeys: mappings.map(([key]) => key).filter((key) => !Object.hasOwn(env, key)),
  };
}

export function serializeEnvFile(env) {
  const lines = [
    "# Local-only MyClaw env derived from ~/.openduck/openclaw.json.",
    "# Secret values must stay in .myclaw/ and must not be committed.",
  ];
  for (const [key, value] of Object.entries(env)) {
    lines.push(`export ${key}=${shellQuote(value)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function writeLocalEnvFile({ config, output = DEFAULT_OUTPUT, cwd = process.cwd() }) {
  const target = assertSafeOutputPath(output, cwd);
  const result = buildOpenduckEnv(config);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, serializeEnvFile(result.env), { mode: 0o600 });
  chmodSync(target, 0o600);
  return {
    output: target,
    mode: "600",
    writtenKeys: result.writtenKeys,
    missingKeys: result.missingKeys,
  };
}

export function assertSafeOutputPath(output, cwd = process.cwd()) {
  const root = path.resolve(cwd);
  const target = path.resolve(root, output);
  const secretDir = path.join(root, ".myclaw");
  const relativeToSecretDir = path.relative(secretDir, target);
  if (relativeToSecretDir.startsWith("..") || path.isAbsolute(relativeToSecretDir)) {
    throw new Error("Refusing to write secrets outside .myclaw/. Use the default local env path.");
  }
  assertNoSymlinkInPath(target, root);
  const ignored = spawnSync("git", ["check-ignore", "-q", "--", path.relative(root, target)], { cwd: root });
  if (ignored.status !== 0) {
    throw new Error("Refusing to write secrets to a path that is not ignored by git.");
  }
  return target;
}

export function buildSafeSummary(result) {
  return {
    output: result.output,
    mode: result.mode,
    writtenKeys: result.writtenKeys,
    missingKeys: result.missingKeys,
    secretValuesPrinted: false,
  };
}

function firstPresent(values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function assertNoSymlinkInPath(target, root) {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Output path must stay inside the repository.");
  }
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    const linkStat = safeLstat(current);
    if (linkStat?.isSymbolicLink()) {
      throw new Error("Refusing to write secrets through a symlink path.");
    }
  }
}

function safeLstat(filePath) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function parseArgs(argv) {
  const args = { source: DEFAULT_SOURCE, output: DEFAULT_OUTPUT, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      args.json = true;
      continue;
    }
    if (arg === "--source" || arg === "--output") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      args[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/import-openduck-config.mjs [--source <path>] [--output <path>] [--json]

Reads an OpenClaw/openduck JSON config and writes a local-only MyClaw env file.
The command prints variable names and readiness metadata only; it never prints secret values.`);
}

function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return 0;
  }
  const config = JSON.parse(readFileSync(args.source, "utf8"));
  const summary = buildSafeSummary(writeLocalEnvFile({ config, output: args.output }));
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Wrote local MyClaw env: ${summary.output}`);
    console.log(`Mode: ${summary.mode}`);
    console.log(`Written keys: ${summary.writtenKeys.join(", ") || "none"}`);
    console.log(`Missing keys: ${summary.missingKeys.join(", ") || "none"}`);
    console.log("Secret values printed: false");
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
