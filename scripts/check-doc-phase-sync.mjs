import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const pairs = [
  ["docs/implementation-architecture.md", "docs/implementation-architecture.html"],
  ["docs/stage-status.md", "docs/stage-status.html"],
];

const failures = [];
for (const [markdownPath, htmlPath] of pairs) {
  const markdown = readFileSync(path.join(root, markdownPath), "utf8");
  const html = readFileSync(path.join(root, htmlPath), "utf8");
  const phase = markdown.match(/Phase\s+\d+\.\d+/)?.[0];
  if (!phase) {
    failures.push(`${markdownPath}: missing Phase marker`);
    continue;
  }
  if (!html.includes(phase)) {
    failures.push(`${htmlPath}: does not include ${phase}; regenerate docs HTML`);
  }
}

if (failures.length) {
  console.error("Doc phase sync check failed:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("Doc phase sync check passed.");
