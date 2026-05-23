#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const command = args._[0] || "status";
const centerUrl = args.url || process.env.HTML_CENTER_URL || "http://127.0.0.1:4177";
const skillDir = path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "skills", "web-design-review");
const ensureScript = path.join(skillDir, "scripts", "ensure_html_center.py");
const publishScript = path.join(skillDir, "scripts", "publish_html_report.py");

if (command === "status") {
  await printStatus();
} else if (command === "start" || command === "check") {
  runPython(ensureScript, []);
  await printStatus();
} else if (command === "publish") {
  runNode(["scripts/check-generated-docs.mjs"]);
  runPython(ensureScript, []);
  runPython(publishScript, [
    args.path || "docs",
    "--title",
    args.title || "MyClaw Phase 1.2 结构红线与 HTML Center 恢复评审",
    "--category",
    args.category || "architecture-review",
    "--entry",
    args.entry || "index.html",
    "--source",
    args.source || process.cwd(),
  ]);
} else if (command === "verify-url") {
  await verifyUrl(args.target || args._[1]);
} else {
  console.error(`Unknown html-center command: ${command}`);
  console.error("Usage: node scripts/html-center.mjs [status|start|check|publish|verify-url --target <url>]");
  process.exit(1);
}

async function printStatus() {
  const health = await fetchJson(`${centerUrl}/api/health`, 1500);
  if (health.ok) {
    console.log(`HTML Center ready: ${centerUrl}`);
    console.log(JSON.stringify(health.body, null, 2));
    return;
  }
  console.error(`HTML Center unreachable: ${centerUrl}`);
  console.error(health.error);
  process.exit(1);
}

async function verifyUrl(url) {
  if (!url) {
    console.error("Missing --target <url> for verify-url.");
    process.exit(1);
  }
  const response = await fetchWithTimeout(url, 2000);
  if (!response.ok) {
    console.error(`URL check failed: ${url} -> ${response.status}`);
    process.exit(1);
  }
  console.log(`URL reachable: ${url}`);
}

function runPython(scriptPath, scriptArgs) {
  if (!existsSync(scriptPath)) {
    console.error(`Missing helper script: ${scriptPath}`);
    process.exit(1);
  }
  const result = spawnSync("python3", [scriptPath, ...scriptArgs], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNode(scriptArgs) {
  const result = spawnSync(process.execPath, scriptArgs, { stdio: "inherit", cwd: process.cwd() });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function fetchJson(url, timeoutMs) {
  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    return { ok: response.ok, status: response.status, body: await response.json() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}
