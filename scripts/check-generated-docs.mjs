import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { moduleOrder } from "../docs/lib/module-meta.mjs";

const root = process.cwd();
const renderedDir = path.join(root, "docs", "rendered", "modules");
const renderedFiles = ["README.html", ...moduleOrder.map((slug) => `${slug}.html`)];
const generatedFiles = [
  "docs/index.html",
  "docs/design-review.html",
  "docs/stage-status.html",
  "docs/implementation-architecture.html",
  ...renderedFiles.map((file) => path.join("docs", "rendered", "modules", file)),
];

const before = new Map(generatedFiles.map((file) => [file, hashFile(file)]));
const build = spawnSync(process.execPath, ["docs/build-review-html.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (build.stdout) {
  process.stdout.write(build.stdout);
}
if (build.stderr) {
  process.stderr.write(build.stderr);
}
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const changed = generatedFiles.filter((file) => before.get(file) !== hashFile(file));
const missing = generatedFiles.filter((file) => !existsSync(path.join(root, file)));
const actualRendered = existsSync(renderedDir)
  ? readdirSync(renderedDir).filter((file) => file.endsWith(".html")).sort()
  : [];
const expectedRendered = new Set(renderedFiles);
const extra = actualRendered.filter((file) => !expectedRendered.has(file));

if (changed.length || missing.length || extra.length) {
  console.error("Generated docs are stale. Re-run `node docs/build-review-html.mjs` and commit the output.");
  for (const file of changed) {
    console.error(`  changed: ${file}`);
  }
  for (const file of missing) {
    console.error(`  missing: ${file}`);
  }
  for (const file of extra) {
    console.error(`  extra: docs/rendered/modules/${file}`);
  }
  process.exit(1);
}

console.log("Generated docs are up to date.");

function hashFile(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!existsSync(fullPath)) {
    return "missing";
  }
  return createHash("sha256").update(readFileSync(fullPath)).digest("hex");
}
