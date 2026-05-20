import { randomUUID } from "node:crypto";
import {
  buildFeishuOutboundPayload,
  normalizeFeishuEvent,
  normalizeFeishuSendResult,
} from "../../feishu-adapter/src/index.mjs";

export function createFeishuWebhookChannel({ url } = {}) {
  return {
    id: "feishu-webhook",
    description: "Custom-bot Feishu/Lark webhook. Configure with --webhook-url or MYCLAW_FEISHU_WEBHOOK_URL.",
    configured: Boolean(url),
    capabilities: {
      outbound: true,
      inbound: false,
      reply: false,
    },
    async send(message) {
      if (!url) {
        throw new Error("Missing Feishu webhook URL. Set MYCLAW_FEISHU_WEBHOOK_URL or pass --webhook-url.");
      }
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildFeishuOutboundPayload(message)),
      });
      const responseText = await response.text();
      const details = normalizeFeishuSendResult({
        responseText,
        status: response.status,
        target: message.target || url,
        threadId: message.threadId || message.metadata?.threadId,
      });
      if (!response.ok) {
        throw new Error(`Feishu webhook send failed: HTTP ${response.status} ${responseText}`);
      }
      if (!details.ok) {
        throw new Error(`Feishu webhook send failed: ${details.code} ${details.message}`);
      }
      return {
        channel: "feishu-webhook",
        messageId: details.messageId || `webhook_${randomUUID().slice(0, 8)}`,
        target: message.target || url,
        text: message.text,
        sentAt: new Date().toISOString(),
        details,
      };
    },
  };
}

export function createFeishuEventChannel() {
  return {
    id: "feishu-event",
    description: "Inbound Feishu/Lark event normalizer for gateway callbacks. Challenge and signature checks live at gateway edge.",
    configured: true,
    capabilities: {
      outbound: false,
      inbound: true,
      reply: false,
    },
    normalizeInbound: normalizeFeishuEvent,
  };
}
