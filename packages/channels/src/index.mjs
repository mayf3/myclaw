import { randomUUID } from "node:crypto";
import { normalizeFeishuEvent } from "../../feishu-adapter/src/index.mjs";

const DEFAULT_CHANNEL_DEFINITIONS = [
  {
    id: "console",
    aliases: ["stdout"],
    create: () => createConsoleChannel(),
  },
  {
    id: "webhook",
    aliases: [],
    create: ({ env, webhookUrl } = {}) =>
      createWebhookChannel({
        url: webhookUrl || env?.MYCLAW_WEBHOOK_URL,
        format: "generic",
      }),
  },
  {
    id: "feishu-webhook",
    aliases: ["lark-webhook"],
    create: ({ env, webhookUrl } = {}) =>
      createWebhookChannel({
        url: webhookUrl || env?.MYCLAW_FEISHU_WEBHOOK_URL,
        format: "feishu",
      }),
  },
  {
    id: "feishu-event",
    aliases: ["lark-event"],
    create: () => createFeishuEventChannel(),
  },
];

export function createChannelRegistry(options = {}) {
  const env = options.env ?? process.env;
  const definitions = new Map();
  const aliases = new Map();

  const registry = {
    register(definition) {
      if (!definition?.id || typeof definition.create !== "function") {
        throw new Error("Channel definition must include id and create().");
      }
      const id = normalizeChannelId(definition.id);
      definitions.set(id, {
        ...definition,
        id,
      });
      aliases.set(id, id);
      for (const alias of definition.aliases ?? []) {
        aliases.set(normalizeChannelId(alias), id);
      }
      return registry;
    },

    list(resolveOptions = {}) {
      return [...definitions.values()].map((definition) =>
        describeChannel(definition.create({ ...options, ...resolveOptions, env })),
      );
    },

    resolve(channelId = "console", resolveOptions = {}) {
      const requested = normalizeChannelId(channelId || "console");
      const id = aliases.get(requested);
      if (!id) {
        throw new Error(`Unknown channel: ${channelId}`);
      }
      const definition = definitions.get(id);
      return definition.create({ ...options, ...resolveOptions, env });
    },
  };

  for (const definition of DEFAULT_CHANNEL_DEFINITIONS) {
    registry.register(definition);
  }

  return registry;
}

export function listChannels(options = {}) {
  return createChannelRegistry(options).list(options);
}

export function resolveChannel(channelId, options = {}) {
  return createChannelRegistry(options).resolve(channelId, options);
}

export function describeChannel(channel) {
  return {
    id: channel.id,
    description: channel.description,
    configured: Boolean(channel.configured),
    capabilities: {
      outbound: Boolean(channel.capabilities?.outbound),
      inbound: Boolean(channel.capabilities?.inbound),
      reply: Boolean(channel.capabilities?.reply),
    },
  };
}

export function createConsoleChannel() {
  return {
    id: "console",
    description: "Local no-network channel used to verify inbound and outbound message pipelines.",
    configured: true,
    capabilities: {
      outbound: true,
      inbound: true,
      reply: true,
    },
    async send(message) {
      const messageId = `console_${randomUUID().slice(0, 8)}`;
      return {
        channel: "console",
        messageId,
        target: message.target || "local",
        text: message.text,
        sentAt: new Date().toISOString(),
      };
    },
    normalizeInbound(input = {}) {
      return normalizeInboundMessage({
        ...input,
        channel: "console",
      });
    },
  };
}

export function createWebhookChannel({ url, format = "generic" } = {}) {
  const id = format === "feishu" ? "feishu-webhook" : "webhook";
  return {
    id,
    description:
      format === "feishu"
        ? "Minimal outbound Feishu/Lark custom-bot webhook. Configure with --webhook-url or MYCLAW_FEISHU_WEBHOOK_URL."
        : "Generic HTTP POST channel. Configure with --webhook-url or MYCLAW_WEBHOOK_URL.",
    configured: Boolean(url),
    capabilities: {
      outbound: true,
      inbound: false,
      reply: false,
    },
    async send(message) {
      if (!url) {
        throw new Error(
          format === "feishu"
            ? "Missing Feishu webhook URL. Set MYCLAW_FEISHU_WEBHOOK_URL or pass --webhook-url."
            : "Missing webhook URL. Set MYCLAW_WEBHOOK_URL or pass --webhook-url.",
        );
      }

      const payload =
        format === "feishu"
          ? { msg_type: "text", content: { text: message.text } }
          : {
              text: message.text,
              target: message.target || null,
              source: "myclaw",
            };
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`Webhook send failed: HTTP ${response.status} ${responseText}`);
      }
      return {
        channel: id,
        messageId: `webhook_${randomUUID().slice(0, 8)}`,
        target: message.target || url,
        text: message.text,
        sentAt: new Date().toISOString(),
        details: {
          status: response.status,
          response: responseText,
        },
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

export function normalizeInboundMessage(input = {}) {
  const text = input.text ?? input.content?.text ?? input.message?.text;
  if (!String(text || "").trim()) {
    throw new Error("Inbound message is missing text.");
  }

  const senderId = input.sender?.id || input.senderId || input.from || "local-user";
  const sender = {
    id: String(senderId),
  };
  const displayName = input.sender?.displayName || input.senderName || input.fromName;
  if (displayName) {
    sender.displayName = String(displayName);
  }

  return {
    id: String(input.id || input.messageId || `in_${randomUUID().slice(0, 8)}`),
    channel: normalizeChannelId(input.channel || "console"),
    conversationId: String(input.conversationId || input.chatId || input.threadId || input.target || sender.id),
    sender,
    text: String(text).trim(),
    receivedAt: input.receivedAt || new Date().toISOString(),
    raw: input.raw ?? input,
  };
}

function normalizeChannelId(value) {
  return String(value || "console").trim().toLowerCase();
}
