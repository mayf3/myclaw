import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const maxLines = 500;
const warnLines = 450;
const maxFilesPerDir = 20;
const maxDirectoryDepth = 4;
const ignoredDirs = new Set([".git", ".myclaw", "node_modules"]);
const files = [];
const directories = [];

walk(root);

const over = [];
const near = [];
const crowded = [];
const deep = [];
for (const file of files) {
  const count = lineCount(file);
  const relative = path.relative(root, file);
  if (count > maxLines) {
    over.push({ relative, count });
  } else if (count >= warnLines) {
    near.push({ relative, count });
  }
}
for (const directory of directories) {
  if (directory.fileCount > maxFilesPerDir) {
    crowded.push(directory);
  }
  if (directory.depth > maxDirectoryDepth) {
    deep.push(directory);
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
if (crowded.length) {
  console.error(`Directories over the ${maxFilesPerDir}-file limit:`);
  for (const item of crowded) {
    console.error(`  ${item.fileCount}\t${item.relative}`);
  }
  process.exit(1);
}
if (deep.length) {
  console.error(`Directories deeper than ${maxDirectoryDepth} levels:`);
  for (const item of deep) {
    console.error(`  depth ${item.depth}\t${item.relative}`);
  }
  process.exit(1);
}

console.log(
  `Structure check passed: ${files.length} files, max ${maxLines} lines, ${maxFilesPerDir} files/dir, depth ${maxDirectoryDepth}.`,
);

function walk(dir) {
  const entries = readdirSync(dir).filter((name) => !ignoredDirs.has(name));
  const relative = path.relative(root, dir) || ".";
  const depth = relative === "." ? 0 : relative.split(path.sep).length;
  directories.push({
    relative,
    depth,
    fileCount: entries.filter((name) => statSync(path.join(dir, name)).isFile()).length,
  });
  for (const name of entries) {
    const filePath = path.join(dir, name);
    const fileStat = statSync(filePath);
    if (fileStat.isDirectory()) {
      walk(filePath);
    } else if (isTextFile(filePath)) {
      files.push(filePath);
    }
  }
}

function isTextFile(filePath) {
  const buffer = readFileSync(filePath);
  if (buffer.length === 0) {
    return true;
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) {
      return false;
    }
    if (byte < 7 || (byte > 14 && byte < 32)) {
      suspicious += 1;
    }
  }
  return suspicious / sample.length < 0.03;
}

function lineCount(filePath) {
  const buffer = readFileSync(filePath);
  if (buffer.length === 0) {
    return 0;
  }
  let count = 0;
  for (const byte of buffer) {
    if (byte === 10) {
      count += 1;
    }
  }
  return buffer.at(-1) === 10 ? count : count + 1;
}
