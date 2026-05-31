const DEFAULT_PREFIX = "MyClaw 收到了";
const MAX_REPLY_TEXT = 900;

export function buildDefaultFeishuReply({ inbound, prefix = process.env.MYCLAW_FEISHU_REPLY_PREFIX } = {}) {
  const text = String(inbound?.text || "").trim();
  const normalizedPrefix = String(prefix || DEFAULT_PREFIX).trim() || DEFAULT_PREFIX;
  const quoted = text ? `：${truncate(text, MAX_REPLY_TEXT)}` : "";
  return `${normalizedPrefix}${quoted}`;
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
