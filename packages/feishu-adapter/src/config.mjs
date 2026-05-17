export function buildFeishuAdapterConfig(options = {}) {
  const env = options.env ?? process.env;
  const connectionMode = normalizeMode(options.connectionMode || env.MYCLAW_FEISHU_CONNECTION_MODE || "webhook");
  return {
    schemaVersion: 1,
    source: "myclaw-feishu-adapter",
    reference: "/Users/yanfenma/workspace/github/openclaw/extensions/feishu",
    domain: normalizeDomain(options.domain || env.MYCLAW_FEISHU_DOMAIN || "feishu"),
    connectionMode,
    appId: trim(options.appId || env.MYCLAW_FEISHU_APP_ID || env.FEISHU_APP_ID),
    appSecret: trim(options.appSecret || env.MYCLAW_FEISHU_APP_SECRET || env.FEISHU_APP_SECRET),
    verificationToken: trim(
      options.verificationToken ||
        env.MYCLAW_FEISHU_VERIFY_TOKEN ||
        env.MYCLAW_FEISHU_VERIFICATION_TOKEN ||
        env.FEISHU_VERIFICATION_TOKEN,
    ),
    encryptKey: trim(options.encryptKey || env.MYCLAW_FEISHU_ENCRYPT_KEY || env.FEISHU_ENCRYPT_KEY),
  };
}

export function describeFeishuAdapterReadiness(config = buildFeishuAdapterConfig()) {
  const issues = [];
  const warnings = [];
  if (config.connectionMode === "webhook" && !config.verificationToken) {
    issues.push("webhook mode requires verificationToken before exposing callbacks");
  }
  if (config.connectionMode === "webhook" && !config.encryptKey) {
    warnings.push("encryptKey is missing; signed webhook validation is disabled");
  }
  if (config.connectionMode === "websocket" && (!config.appId || !config.appSecret)) {
    issues.push("websocket mode requires appId and appSecret");
  }
  return {
    ok: issues.length === 0,
    level: issues.length ? "blocked" : warnings.length ? "partial" : "ready",
    connectionMode: config.connectionMode,
    domain: config.domain,
    signedWebhookReady: Boolean(config.encryptKey && config.connectionMode === "webhook"),
    verificationTokenReady: Boolean(config.verificationToken),
    outboundReady: Boolean(config.appId && config.appSecret),
    issues,
    warnings,
    contracts: [
      "config: appId/appSecret/verificationToken/encryptKey/domain/connectionMode",
      "security: x-lark signature before JSON parse when encryptKey is configured",
      "event: text callback normalization and dedup key extraction",
      "outbound: deferred until app token/client facade exists",
    ],
  };
}

function normalizeMode(value) {
  return value === "websocket" ? "websocket" : "webhook";
}

function normalizeDomain(value) {
  return value === "lark" ? "lark" : "feishu";
}

function trim(value) {
  return String(value || "").trim();
}
