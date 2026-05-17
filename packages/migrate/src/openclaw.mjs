import { existsSync } from "node:fs";
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const KNOWN_CHANNELS = [
  "feishu",
  "lark",
  "slack",
  "discord",
  "telegram",
  "whatsapp",
  "imessage",
  "msteams",
  "matrix",
  "mattermost",
  "signal",
  "zalo",
  "zalouser",
  "line",
  "irc",
];

const TOP_LEVEL_SECTIONS = [
  "agents",
  "channels",
  "models",
  "providers",
  "plugins",
  "skills",
  "gateway",
  "memory",
  "secrets",
  "mcp",
  "tools",
  "browser",
  "web",
];

export async function planOpenClawMigration(options = {}) {
  const source = resolveSource(options.source);
  const configPath = await resolveOpenClawConfigPath(source);
  const repoRoot = await resolveOpenClawRepoRoot(source, configPath);
  const config = configPath ? await readOpenClawConfig(configPath) : null;
  const manifests = repoRoot ? await readPluginManifests(path.join(repoRoot, "extensions")) : [];
  const sections = detectSections(config?.parsed, config?.text || "");
  const channels = detectChannels(config?.parsed, config?.text || "", manifests);
  const pluginEntries = detectPluginEntries(config?.parsed, manifests);
  const unsupported = buildUnsupportedList({ channels, sections, pluginEntries });
  const recommendedSteps = buildRecommendedSteps({ configPath, channels, pluginEntries, unsupported });

  return {
    kind: "openclaw-migration-plan",
    generatedAt: new Date().toISOString(),
    source,
    repoRoot,
    configPath,
    config: {
      exists: Boolean(configPath),
      parsed: Boolean(config?.parsed),
      parseError: config?.parseError || null,
      sections,
    },
    inventory: {
      channels,
      pluginEntries,
      bundledPluginManifests: manifests.length,
    },
    myclawDraft: buildMyClawDraft({ channels, pluginEntries, configPath, repoRoot }),
    unsupported,
    recommendedSteps,
    destructive: false,
  };
}

export async function writeMigrationPlan(plan, outputPath) {
  const target = path.resolve(outputPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return target;
}

function resolveSource(input) {
  if (input) {
    return path.resolve(expandHome(input));
  }
  if (process.env.OPENCLAW_CONFIG_PATH) {
    return path.resolve(expandHome(process.env.OPENCLAW_CONFIG_PATH));
  }
  const homeConfig = path.join(os.homedir(), ".openclaw", "openclaw.json");
  if (existsSync(homeConfig)) {
    return homeConfig;
  }
  const workspaceRepo = "/Users/yanfenma/workspace/github/openclaw";
  if (existsSync(workspaceRepo)) {
    return workspaceRepo;
  }
  return path.join(os.homedir(), ".openclaw");
}

async function resolveOpenClawConfigPath(source) {
  if (!source) {
    return null;
  }
  const sourceStat = await safeStat(source);
  if (!sourceStat) {
    return null;
  }
  if (sourceStat.isFile()) {
    return source;
  }
  const candidates = [
    path.join(source, "openclaw.json"),
    path.join(source, ".openclaw", "openclaw.json"),
    path.join(os.homedir(), ".openclaw", "openclaw.json"),
  ];
  for (const candidate of candidates) {
    const candidateStat = await safeStat(candidate);
    if (candidateStat?.isFile()) {
      return candidate;
    }
  }
  return null;
}

async function resolveOpenClawRepoRoot(source, configPath) {
  const candidates = [];
  if (source) {
    const sourceStat = await safeStat(source);
    candidates.push(sourceStat?.isDirectory() ? source : path.dirname(source));
  }
  if (configPath) {
    candidates.push(path.dirname(configPath));
  }
  candidates.push("/Users/yanfenma/workspace/github/openclaw");

  for (const candidate of candidates.filter(Boolean)) {
    if ((await safeStat(path.join(candidate, "extensions")))?.isDirectory()) {
      return candidate;
    }
    if ((await safeStat(path.join(candidate, "package.json")))?.isFile()) {
      const packageText = await readFile(path.join(candidate, "package.json"), "utf8").catch(() => "");
      if (packageText.includes("openclaw")) {
        return candidate;
      }
    }
  }
  return null;
}

async function readOpenClawConfig(configPath) {
  const text = await readFile(configPath, "utf8");
  try {
    return { text, parsed: JSON.parse(stripJson5(text)), parseError: null };
  } catch (error) {
    return {
      text,
      parsed: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readPluginManifests(extensionsDir) {
  const manifests = [];
  if (!(await safeStat(extensionsDir))?.isDirectory()) {
    return manifests;
  }
  for (const name of await readdir(extensionsDir)) {
    const manifestPath = path.join(extensionsDir, name, "openclaw.plugin.json");
    if (!(await safeStat(manifestPath))?.isFile()) {
      continue;
    }
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifests.push({
        id: manifest.id || name,
        channels: manifest.channels || [],
        providers: manifest.providers || [],
        contracts: manifest.contracts || {},
        path: manifestPath,
      });
    } catch {
      manifests.push({
        id: name,
        channels: [],
        providers: [],
        contracts: {},
        path: manifestPath,
        unreadable: true,
      });
    }
  }
  return manifests.sort((a, b) => a.id.localeCompare(b.id));
}

function detectSections(parsed, text) {
  if (parsed && typeof parsed === "object") {
    return TOP_LEVEL_SECTIONS.filter((section) => Object.hasOwn(parsed, section));
  }
  return TOP_LEVEL_SECTIONS.filter((section) => new RegExp(`(^|[,{\\s])["']?${section}["']?\\s*:`, "m").test(text));
}

function detectChannels(parsed, text, manifests) {
  const fromConfig = new Set();
  const channelConfig = parsed?.channels;
  if (channelConfig && typeof channelConfig === "object") {
    for (const key of Object.keys(channelConfig)) {
      if (key !== "defaults" && key !== "modelByChannel") {
        fromConfig.add(key);
      }
    }
  } else {
    for (const channel of KNOWN_CHANNELS) {
      if (new RegExp(`["']?${channel}["']?\\s*:`, "m").test(text)) {
        fromConfig.add(channel);
      }
    }
  }

  const fromManifests = new Set();
  for (const manifest of manifests) {
    for (const channel of manifest.channels || []) {
      fromManifests.add(channel);
    }
  }

  return [...new Set([...fromConfig, ...fromManifests])]
    .sort()
    .map((id) => ({
      id,
      source: fromConfig.has(id) ? "config" : "plugin-manifest",
      myclawSupport: id === "feishu" || id === "lark" ? "planned-adapter" : "not-implemented",
    }));
}

function detectPluginEntries(parsed, manifests) {
  const configured = parsed?.plugins?.entries && typeof parsed.plugins.entries === "object"
    ? Object.keys(parsed.plugins.entries)
    : [];
  return [...new Set([...configured, ...manifests.map((manifest) => manifest.id)])]
    .sort()
    .map((id) => {
      const manifest = manifests.find((entry) => entry.id === id);
      return {
        id,
        configured: configured.includes(id),
        manifestPath: manifest?.path || null,
        channels: manifest?.channels || [],
        providers: manifest?.providers || [],
        contracts: manifest?.contracts || {},
      };
    });
}

function buildUnsupportedList({ channels, sections, pluginEntries }) {
  const unsupported = [];
  for (const channel of channels) {
    if (channel.myclawSupport === "not-implemented") {
      unsupported.push({
        type: "channel",
        id: channel.id,
        reason: "MyClaw currently has only console/webhook/feishu-webhook boundaries.",
      });
    }
  }
  for (const section of sections) {
    if (["secrets", "mcp", "tools", "browser", "web"].includes(section)) {
      unsupported.push({
        type: "config-section",
        id: section,
        reason: "Section needs a dedicated MyClaw schema before automatic apply.",
      });
    }
  }
  const runtimePlugins = pluginEntries.filter((plugin) => plugin.channels.length || Object.keys(plugin.contracts).length);
  for (const plugin of runtimePlugins) {
    unsupported.push({
      type: "plugin-runtime",
      id: plugin.id,
      reason: "Plugin manifests can be inventoried now, but runtime execution is not implemented yet.",
    });
  }
  return unsupported;
}

function buildRecommendedSteps({ configPath, channels, pluginEntries, unsupported }) {
  const steps = [];
  if (!configPath) {
    steps.push("Locate OpenClaw config with --source <openclaw.json|repo|home-dir>.");
  }
  steps.push("Write a MyClaw migration snapshot and keep it reviewable before apply.");
  if (channels.some((channel) => channel.id === "feishu" || channel.id === "lark")) {
    steps.push("Map OpenClaw Feishu/Lark channel config into MyClaw FeishuEventAdapter after gateway exists.");
  }
  if (pluginEntries.length) {
    steps.push("Convert OpenClaw plugin manifests into MyClaw adapter/plugin draft records first, not executable code.");
  }
  if (unsupported.length) {
    steps.push("Keep unsupported sections as preserved raw config until matching MyClaw schema exists.");
  }
  return steps;
}

function buildMyClawDraft({ channels, pluginEntries, configPath, repoRoot }) {
  return {
    source: "openclaw",
    configPath,
    repoRoot,
    channels: channels.map((channel) => ({
      id: channel.id === "lark" ? "feishu" : channel.id,
      status: channel.myclawSupport,
    })),
    plugins: pluginEntries.map((plugin) => ({
      id: plugin.id,
      configured: plugin.configured,
      channels: plugin.channels,
      providers: plugin.providers,
      contracts: plugin.contracts,
    })),
  };
}

function stripJson5(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, "$1");
}

async function safeStat(filePath) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

function expandHome(value) {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}
