import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const maxLines = 500;
const warnLines = 450;
const ignoredDirs = new Set([".git", ".myclaw", "node_modules"]);
const files = [];

walk(root);

const over = [];
const near = [];
for (const file of files) {
  const count = lineCount(file);
  const relative = path.relative(root, file);
  if (count > maxLines) {
    over.push({ relative, count });
  } else if (count >= warnLines) {
    near.push({ relative, count });
  }
}

if (near.length) {
  console.warn("Files near the 500-line limit:");
  for (const item of near) {
    console.warn(`  ${item.count}\t${item.relative}`);
  }
}

if (over.length) {
  console.error("Files over the 500-line limit:");
  for (const item of over) {
    console.error(`  ${item.count}\t${item.relative}`);
  }
  process.exit(1);
}

console.log(`Line check passed: ${files.length} files, max ${maxLines} lines.`);

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (ignoredDirs.has(name)) {
      continue;
    }
    const filePath = path.join(dir, name);
    const fileStat = statSync(filePath);
    if (fileStat.isDirectory()) {
      walk(filePath);
    } else if (shouldCheck(filePath)) {
      files.push(filePath);
    }
  }
}

function shouldCheck(filePath) {
  return /\.(mjs|js|json|md|html|css|ts|tsx)$/.test(filePath);
}

function lineCount(filePath) {
  return readFileSync(filePath, "utf8").split("\n").length;
}
