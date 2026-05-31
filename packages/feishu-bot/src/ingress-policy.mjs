import { readFile } from "node:fs/promises";
import path from "node:path";

export function buildFeishuIngressPolicy(options = {}) {
  const env = options.env ?? process.env;
  return {
    allowedChatIds: normalizeList(options.allowedChatIds ?? env.MYCLAW_FEISHU_ALLOWED_CHAT_IDS),
    allowedSenderIds: normalizeList(options.allowedSenderIds ?? env.MYCLAW_FEISHU_ALLOWED_SENDER_IDS),
    requireMention: normalizeBoolean(options.requireMention ?? env.MYCLAW_FEISHU_REQUIRE_MENTION),
    mentionNames: normalizeList(options.mentionNames ?? env.MYCLAW_FEISHU_MENTION_NAMES),
    mentionIds: normalizeList(options.mentionIds ?? env.MYCLAW_FEISHU_MENTION_IDS),
    unsafeOpenIngress: normalizeBoolean(options.unsafeOpenIngress ?? env.MYCLAW_FEISHU_UNSAFE_OPEN_INGRESS),
  };
}

export async function loadFeishuIngressPolicy(options = {}) {
  const policyFile = resolvePolicyFile(options);
  const fileOptions = policyFile ? await readPolicyFile(policyFile) : {};
  return buildFeishuIngressPolicy({ ...fileOptions, ...definedOptions(options) });
}

export function isSupportedTextEvent(event = {}) {
  const message = (event.event ?? event).message ?? event.message ?? {};
  const type = String(message.message_type || message.type || "").trim();
  return !type || type === "text";
}

export function evaluateFeishuIngressPolicy({ event = {}, inbound, policy = {} } = {}) {
  const allowedChatIds = new Set(policy.allowedChatIds || []);
  const allowedSenderIds = new Set(policy.allowedSenderIds || []);
  const hasMentionRule = Boolean(policy.requireMention && ((policy.mentionNames || []).length || (policy.mentionIds || []).length));
  if (!allowedChatIds.size && !allowedSenderIds.size && !hasMentionRule && !policy.unsafeOpenIngress) {
    return { ok: false, reason: "ingress_policy_required" };
  }

  if (allowedChatIds.size && !allowedChatIds.has(inbound.conversationId)) {
    return { ok: false, reason: "chat_not_allowed" };
  }

  if (allowedSenderIds.size && !allowedSenderIds.has(inbound.sender.id)) {
    return { ok: false, reason: "sender_not_allowed" };
  }

  if (policy.requireMention && !messageMentionsBot(event, policy)) {
    return { ok: false, reason: "mention_required" };
  }

  return { ok: true };
}

async function readPolicyFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function resolvePolicyFile(options) {
  const env = options.env ?? process.env;
  const configured = options.policyFile ?? env.MYCLAW_FEISHU_POLICY_FILE;
  if (configured === false || configured === "false") {
    return "";
  }
  return path.resolve(String(configured || path.join(process.cwd(), ".myclaw", "feishu-policy.json")));
}

function definedOptions(options) {
  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
}

function messageMentionsBot(event, policy) {
  const message = (event.event ?? event).message ?? event.message ?? {};
  const mentions = Array.isArray(message.mentions) ? message.mentions : [];
  const mentionNames = new Set(policy.mentionNames || []);
  const mentionIds = new Set(policy.mentionIds || []);
  if (!mentionNames.size && !mentionIds.size) {
    return false;
  }
  for (const mention of mentions) {
    const id = mention.id?.open_id || mention.id?.user_id || mention.id?.union_id || mention.open_id || mention.user_id;
    const name = mention.name || mention.text || mention.key;
    if ((id && mentionIds.has(String(id))) || (name && mentionNames.has(String(name)))) {
      return true;
    }
  }
  const text = String(parseFeishuContent(message.content).text || message.text || "");
  for (const name of mentionNames) {
    if (text.includes(`@${name}`) || (text.includes("<at") && text.includes(name))) {
      return true;
    }
  }
  for (const id of mentionIds) {
    if (text.includes(id)) {
      return true;
    }
  }
  return false;
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function parseFeishuContent(value) {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return { text: value };
    }
  }
  return typeof value === "object" ? value : {};
}
