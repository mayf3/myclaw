#!/usr/bin/env node
import { resolveStateDir } from "../../core/src/state.mjs";
import { listChannels } from "../../channels/src/index.mjs";
import { receiveMessage, sendMessage } from "../../runtime/src/messages.mjs";
import { startGateway } from "../../gateway/src/index.mjs";
import { startDashboard } from "../../dashboard/src/index.mjs";
import { planOpenClawMigration, writeMigrationPlan } from "../../migrate/src/openclaw.mjs";
import { stageOpenClawMigration } from "../../migrate/src/stage.mjs";

const VERSION = "0.1.0";

async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }
  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return 0;
  }
  if (command === "doctor") {
    return await runDoctor(parseArgs(rest));
  }
  if (command === "channels") {
    return runChannels(parseArgs(rest));
  }
  if (command === "send") {
    return await runSend(parseArgs(rest));
  }
  if (command === "receive") {
    return await runReceive(parseArgs(rest));
  }
  if (command === "dashboard") {
    return await runDashboard(parseArgs(rest));
  }
  if (command === "gateway") {
    return await runGateway(parseArgs(rest));
  }
  if (command === "feishu-bot") {
    return await runFeishuBot(parseArgs(rest));
  }
  if (command === "migrate") {
    return await runMigrate(rest);
  }
  throw new CliError(`Unknown command: ${command}`, "unknown_command");
}

async function runSend(args) {
  const text = args.text || args._.join(" ").trim();
  if (!text) {
    throw new CliError("Missing message text. Use --text \"hello\" or pass text after send.", "missing_text");
  }

  const envelope = await sendMessage({
    text,
    channelId: args.channel || "console",
    target: args.target,
    webhookUrl: args.webhookUrl,
    stateDir: args.stateDir,
    source: "cli",
  });
  printEnvelope(envelope, args.json);
  return envelope.ok ? 0 : 1;
}

async function runReceive(args) {
  const text = args.text || args._.join(" ").trim();
  if (!text) {
    throw new CliError("Missing message text. Use --text \"hello\" or pass text after receive.", "missing_text");
  }

  const envelope = await receiveMessage({
    text,
    channelId: args.channel || "console",
    senderId: args.from || args.senderId || "local-user",
    senderName: args.senderName,
    conversationId: args.conversation || args.conversationId || args.target,
    replyText: args.reply && args.reply !== "true" ? args.reply : "",
    webhookUrl: args.webhookUrl,
    stateDir: args.stateDir,
    source: "cli",
  });
  printEnvelope(envelope, args.json);
  return envelope.ok ? 0 : 1;
}

async function runDoctor(args) {
  const stateDir = resolveStateDir(args.stateDir);
  const htmlCenter = await checkHtmlCenter(args.htmlCenterUrl);
  const payload = {
    version: VERSION,
    node: process.version,
    cwd: process.cwd(),
    stateDir,
    channels: listChannels(),
    htmlCenter,
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`MyClaw ${payload.version}`);
    console.log(`Node: ${payload.node}`);
    console.log(`CWD: ${payload.cwd}`);
    console.log(`State: ${payload.stateDir}`);
    console.log(`HTML Center: ${htmlCenter.ok ? "ready" : "unreachable"} (${htmlCenter.url})`);
    console.log("Channels:");
    for (const channel of payload.channels) {
      const mark = channel.configured ? "ready" : "needs config";
      console.log(`  - ${channel.id}: ${mark}`);
    }
  }
  return 0;
}

async function checkHtmlCenter(url = process.env.HTML_CENTER_URL || "http://127.0.0.1:4177") {
  const healthUrl = `${url.replace(/\/$/, "")}/api/health`;
  try {
    const response = await fetchWithTimeout(healthUrl, 800);
    return {
      ok: response.ok,
      url,
      status: response.status,
      service: response.ok ? (await response.json()).service : "unknown",
    };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : String(error),
    };
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

function runChannels(args) {
  const payload = { channels: listChannels() };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    for (const channel of payload.channels) {
      const mark = channel.configured ? "ready" : "needs config";
      console.log(`${channel.id}\t${mark}\t${channel.description}`);
    }
  }
  return 0;
}

async function runDashboard(args) {
  const dashboard = await startDashboard({
    host: args.host || "127.0.0.1",
    port: args.port || 4321,
    stateDir: args.stateDir,
    openclawSource: args.openclawSource,
  });
  if (args.json) {
    console.log(JSON.stringify({ ok: true, url: dashboard.url, stateDir: dashboard.stateDir }, null, 2));
  } else {
    console.log(`MyClaw dashboard: ${dashboard.url}`);
    console.log(`State: ${dashboard.stateDir}`);
  }
  await waitForShutdown(dashboard.server);
  return 0;
}

async function runGateway(args) {
  const gateway = await startGateway({
    host: args.host || "127.0.0.1",
    port: args.port || 4321,
    stateDir: args.stateDir,
    openclawSource: args.openclawSource,
    token: args.token,
    feishuVerifyToken: args.feishuVerifyToken,
    feishuEncryptKey: args.feishuEncryptKey,
  });
  if (args.json) {
    console.log(JSON.stringify({ ok: true, url: gateway.url, stateDir: gateway.stateDir }, null, 2));
  } else {
    console.log(`MyClaw gateway: ${gateway.url}`);
    console.log(`State: ${gateway.stateDir}`);
  }
  await waitForShutdown(gateway.server);
  return 0;
}

async function runFeishuBot(args) {
  const { startFeishuBot } = await import("../../feishu-bot/src/index.mjs");
  const bot = await startFeishuBot({
    stateDir: args.stateDir,
    logger: console,
    ingressPolicy: {
      allowedChatIds: parseListArg(args.allowedChatIds || args.allowedChatId || process.env.MYCLAW_FEISHU_ALLOWED_CHAT_IDS),
      allowedSenderIds: parseListArg(
        args.allowedSenderIds || args.allowedSenderId || process.env.MYCLAW_FEISHU_ALLOWED_SENDER_IDS,
      ),
      requireMention: parseBooleanArg(args.requireMention || process.env.MYCLAW_FEISHU_REQUIRE_MENTION),
      mentionNames: parseListArg(args.mentionNames || args.mentionName || process.env.MYCLAW_FEISHU_MENTION_NAMES),
      mentionIds: parseListArg(args.mentionIds || args.mentionId || process.env.MYCLAW_FEISHU_MENTION_IDS),
    },
    replyMode: args.replyMode || process.env.MYCLAW_FEISHU_REPLY_MODE,
    replyBuilder: args.replyPrefix
      ? ({ inbound }) => `${args.replyPrefix}${inbound.text ? `：${inbound.text}` : ""}`
      : undefined,
  });
  if (args.json) {
    console.log(JSON.stringify({ ok: true, mode: bot.mode, stateDir: bot.stateDir }, null, 2));
  } else {
    console.log("MyClaw Feishu bot connected.");
    console.log(`Mode: ${bot.mode}`);
    console.log(`State: ${bot.stateDir}`);
  }
  await waitForStop(bot.stop);
  return 0;
}

function parseListArg(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBooleanArg(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

async function runMigrate(argv) {
  const [target, ...rest] = argv;
  if (!target || target === "--help" || target === "-h") {
    printMigrateHelp();
    return 0;
  }
  if (target !== "openclaw") {
    throw new CliError(`Unknown migration target: ${target}`, "unknown_migration_target");
  }
  const args = parseArgs(rest);
  const plan = await planOpenClawMigration({ source: args.source });
  if (args.stage) {
    const stage = await stageOpenClawMigration({
      source: args.source,
      stateDir: args.stateDir,
      outputPath: args.output && args.output !== "true" ? args.output : undefined,
      plan,
    });
    if (args.json) {
      console.log(JSON.stringify({ ok: true, stage }, null, 2));
    } else {
      console.log("OpenClaw migration staged");
      console.log(`Stage: ${stage.stageId}`);
      console.log(`Path: ${stage.path}`);
      console.log(`Modules: ${stage.modules.map((module) => module.id).join(", ") || "none"}`);
      console.log(`Blocked: ${stage.blocked.length}`);
    }
    return 0;
  }
  let outputPath = null;
  if (args.output && args.output !== "true") {
    outputPath = await writeMigrationPlan(plan, args.output);
  }
  if (args.json) {
    console.log(JSON.stringify({ ok: true, outputPath, plan }, null, 2));
  } else {
    console.log("OpenClaw migration dry-run");
    console.log(`Source: ${plan.source || "not found"}`);
    console.log(`Config: ${plan.config.exists ? plan.configPath : "not found"}`);
    console.log(`Channels: ${plan.inventory.channels.map((channel) => channel.id).join(", ") || "none"}`);
    console.log(`Plugins: ${plan.inventory.pluginEntries.length}`);
    console.log(`Unsupported: ${plan.unsupported.length}`);
    if (outputPath) {
      console.log(`Wrote: ${outputPath}`);
    }
  }
  return 0;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      args.json = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = toCamelCase(arg.slice(2));
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        args[key] = "true";
      } else {
        args[key] = next;
        index += 1;
      }
      continue;
    }
    args._.push(arg);
  }
  return args;
}

function waitForShutdown(server) {
  return new Promise((resolve) => {
    const close = () => {
      server.close(() => resolve());
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
}

function waitForStop(stop) {
  return new Promise((resolve) => {
    const close = () => {
      stop();
      resolve();
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function printEnvelope(envelope, asJson) {
  if (asJson) {
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }
  if (envelope.ok) {
    if (envelope.result.inbound) {
      console.log(`received ${envelope.result.inbound.channel}:${envelope.result.inbound.id}`);
      console.log(envelope.result.inbound.text);
      if (envelope.result.reply) {
        console.log(`replied ${envelope.result.reply.channel}:${envelope.result.reply.messageId}`);
      }
      return;
    }
    console.log(`sent ${envelope.result.channel}:${envelope.result.messageId}`);
    console.log(envelope.result.text);
    return;
  }
  console.error(`${envelope.error.code}: ${envelope.error.message}`);
}

function printHelp() {
  console.log(`MyClaw ${VERSION}

Usage:
  myclaw doctor [--json] [--state-dir <path>] [--html-center-url <url>]
  myclaw channels [--json]
  myclaw send --text <message> [--channel console|webhook|feishu-webhook] [--target <id>] [--webhook-url <url>] [--json]
  myclaw receive --text <message> [--channel console] [--from <sender>] [--conversation <id>] [--reply <message>] [--json]
  myclaw dashboard [--host 127.0.0.1] [--port 4321] [--state-dir <path>] [--openclaw-source <path>]
  myclaw gateway [--host 127.0.0.1] [--port 4321] [--state-dir <path>] [--openclaw-source <path>] [--token <token>] [--feishu-verify-token <token>] [--feishu-encrypt-key <key>]
  myclaw feishu-bot [--state-dir <path>] [--reply-prefix <text>] [--reply-mode direct|thread] [--allowed-chat-ids <ids>] [--require-mention] [--json]
  myclaw migrate openclaw [--source <openclaw.json|repo|home-dir>] [--stage] [--output <path>] [--json]

Examples:
  myclaw send --text "hello"
  myclaw receive --from local-user --conversation local-thread --text "hello" --reply "received"
  myclaw dashboard --port 4321
  myclaw gateway --port 4321
  myclaw feishu-bot --reply-prefix "MyClaw 收到了"
  myclaw feishu-bot --reply-prefix "MyClaw 收到了" --reply-mode direct
  myclaw feishu-bot --allowed-chat-ids "$MYCLAW_FEISHU_ALLOWED_CHAT_IDS" --require-mention
  myclaw migrate openclaw --source $MYCLAW_OPENCLAW_SOURCE --json
  myclaw send --channel feishu-webhook --webhook-url "$MYCLAW_FEISHU_WEBHOOK_URL" --text "hello"
`);
}

function printMigrateHelp() {
  console.log(`MyClaw migration

Usage:
  myclaw migrate openclaw [--source <openclaw.json|repo|home-dir>] [--stage] [--output <path>] [--state-dir <path>] [--json]

The OpenClaw migration command is dry-run by default. It inventories config sections,
channels, plugin manifests, unsupported runtime surfaces, and a MyClaw draft mapping.
With --stage it writes a reviewable snapshot but still does not apply runtime changes.
`);
}

class CliError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    if (error instanceof CliError) {
      console.error(`${error.code}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  },
);
