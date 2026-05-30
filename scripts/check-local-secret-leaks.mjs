import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const secretDir = path.join(root, ".myclaw");
const sensitiveKeyPattern = /(APP_ID|SECRET|TOKEN|KEY|WEBHOOK_URL)$/;
const secrets = readLocalSecrets();
const leaks = [];

if (secrets.length) {
  for (const file of listTrackedFiles()) {
    const filePath = path.join(root, file);
    if (!isTextFile(filePath)) {
      continue;
    }
    const text = readFileSync(filePath, "utf8");
    for (const secret of secrets) {
      if (text.includes(secret.value)) {
        leaks.push({ key: secret.key, file });
      }
    }
  }
}

if (leaks.length) {
  console.error("Local secret leak check failed. Secret values are present in tracked files:");
  for (const leak of leaks) {
    console.error(`  ${leak.key}\t${leak.file}`);
  }
  process.exit(1);
}

console.log(`Local secret leak check passed: ${secrets.length} sensitive values scanned.`);

function readLocalSecrets() {
  if (!existsSync(secretDir)) {
    return [];
  }
  const values = [];
  for (const file of readdirSync(secretDir)) {
    if (!file.endsWith(".env")) {
      continue;
    }
    const content = readFileSync(path.join(secretDir, file), "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^export\s+([A-Z0-9_]+)='(.*)'$/);
      if (!match || !sensitiveKeyPattern.test(match[1])) {
        continue;
      }
      const value = match[2].replaceAll("'\\''", "'");
      if (value.length >= 8) {
        values.push({ key: match[1], value });
      }
    }
  }
  return values;
}

function listTrackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error("Failed to list tracked files.");
  }
  return result.stdout.split("\0").filter(Boolean);
}

function isTextFile(filePath) {
  const fileStat = statSync(filePath);
  if (!fileStat.isFile()) {
    return false;
  }
  const buffer = readFileSync(filePath);
  if (buffer.length === 0) {
    return true;
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  for (const byte of sample) {
    if (byte === 0) {
      return false;
    }
  }
  return true;
}
