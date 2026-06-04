import { answerFromEnvelope, askAgent } from "../../agent/src/ask.mjs";

export function buildCliReplyBuilder(args, env = process.env) {
  if (args.replyProvider === "llm") {
    if (isTruthy(args.unsafeOpenIngress || env.MYCLAW_FEISHU_UNSAFE_OPEN_INGRESS)) {
      throw new Error("Feishu LLM replies cannot run with unsafe open ingress.");
    }
    if (!isTruthy(args.llmPrivacyAck || env.MYCLAW_FEISHU_LLM_ENABLED)) {
      throw new Error("Feishu LLM replies require --llm-privacy-ack or MYCLAW_FEISHU_LLM_ENABLED=1.");
    }
    return async ({ inbound }) => {
      const envelope = await askAgent({
        text: inbound.text,
        stateDir: args.stateDir,
        model: args.replyModel || args.model,
        source: "feishu-bot",
      });
      if (!envelope.ok) {
        throw new Error(`LLM reply failed: ${envelope.error.code}`);
      }
      return {
        text: answerFromEnvelope(envelope),
        provider: "llm",
        linkedRunId: envelope.runId,
        model: envelope.result?.model || null,
      };
    };
  }
  if (args.replyPrefix) {
    return ({ inbound }) => `${args.replyPrefix}${inbound.text ? `：${inbound.text}` : ""}`;
  }
  return undefined;
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}
