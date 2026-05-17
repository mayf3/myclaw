import { createDecipheriv, createHash, timingSafeEqual } from "node:crypto";

const SIGNATURE_HEADERS = {
  timestamp: "x-lark-request-timestamp",
  nonce: "x-lark-request-nonce",
  signature: "x-lark-signature",
};
const DEFAULT_SIGNATURE_MAX_AGE_MS = 10 * 60 * 1000;

export function parseFeishuWebhookBody(rawBody) {
  if (!String(rawBody || "").trim()) {
    return {};
  }
  return JSON.parse(rawBody);
}

export function decryptFeishuPayload({ encryptKey, encrypt }) {
  const key = createHash("sha256").update(String(encryptKey || "")).digest();
  const encrypted = Buffer.from(String(encrypt || ""), "base64");
  if (encrypted.length <= 16) {
    throw new Error("Encrypted Feishu payload is too short.");
  }
  const iv = encrypted.subarray(0, 16);
  const payload = encrypted.subarray(16);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const plaintext = Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext);
}

export function validateFeishuWebhookSignature({
  headers = {},
  rawBody = "",
  encryptKey,
  nowMs = Date.now(),
  maxAgeMs = DEFAULT_SIGNATURE_MAX_AGE_MS,
}) {
  const key = trim(encryptKey);
  if (!key) {
    return { ok: false, code: "missing_encrypt_key", message: "Missing Feishu encryptKey." };
  }
  const timestamp = readHeader(headers, SIGNATURE_HEADERS.timestamp);
  const nonce = readHeader(headers, SIGNATURE_HEADERS.nonce);
  const signature = readHeader(headers, SIGNATURE_HEADERS.signature);
  if (!timestamp || !nonce || !signature) {
    return { ok: false, code: "missing_signature", message: "Missing Feishu signature headers." };
  }
  if (!isFreshTimestamp(timestamp, nowMs, maxAgeMs)) {
    return { ok: false, code: "stale_signature", message: "Feishu signature timestamp is outside the replay window." };
  }
  const expected = buildFeishuWebhookSignature({ timestamp, nonce, encryptKey: key, rawBody });
  if (!safeEqual(expected, signature)) {
    return { ok: false, code: "invalid_signature", message: "Invalid Feishu signature." };
  }
  return { ok: true };
}

export function buildFeishuWebhookSignature({ timestamp, nonce, encryptKey, rawBody }) {
  return createHash("sha256")
    .update(String(timestamp) + String(nonce) + String(encryptKey) + String(rawBody))
    .digest("hex");
}

export function validateFeishuVerificationToken({ body = {}, verificationToken, allowUnsignedDev = false }) {
  const token = trim(verificationToken);
  if (body.token && token && body.token === token) {
    return { ok: true };
  }
  if (!token && allowUnsignedDev) {
    return { ok: true, devBypass: true };
  }
  return {
    ok: false,
    status: token ? 401 : 403,
    code: token ? "unauthorized" : "feishu_verification_required",
    message: token ? "Invalid Feishu verification token." : "Set MYCLAW_FEISHU_VERIFY_TOKEN before exposing Feishu callbacks.",
  };
}

function isFreshTimestamp(value, nowMs, maxAgeMs) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return false;
  }
  const timestampMs = seconds > 10_000_000_000 ? seconds : seconds * 1000;
  return Math.abs(nowMs - timestampMs) <= maxAgeMs;
}

function readHeader(headers, name) {
  const value = headers[name] || headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function trim(value) {
  return String(value || "").trim();
}
