export function printHelp(version) {
  console.log(`MyClaw ${version}

Usage:
  myclaw doctor [--json] [--state-dir <path>] [--html-center-url <url>]
  myclaw channels [--json]
  myclaw ask --text <question> [--model <model>] [--json]
  myclaw configure-agent [--target feishu-llm] [--text <goal>] [--model <model>] [--json] [--unsafe-full-local]
  myclaw send --text <message> [--channel console|webhook|feishu-webhook] [--target <id>] [--webhook-url <url>] [--json]
  myclaw receive --text <message> [--channel console] [--from <sender>] [--conversation <id>] [--reply <message>] [--json]
  myclaw dashboard [--host 127.0.0.1] [--port 4321] [--state-dir <path>] [--openclaw-source <path>]
  myclaw gateway [--host 127.0.0.1] [--port 4321] [--state-dir <path>] [--openclaw-source <path>] [--token <token>] [--feishu-verify-token <token>] [--feishu-encrypt-key <key>]
  myclaw feishu-bot [--state-dir <path>] [--reply-prefix <text>] [--reply-provider llm] [--llm-privacy-ack] [--reply-mode direct|thread] [--policy-file <path>] [--allowed-chat-ids <ids>] [--require-mention] [--json]
  myclaw migrate openclaw [--source <openclaw.json|repo|home-dir>] [--stage] [--output <path>] [--json]

Examples:
  myclaw send --text "hello"
  myclaw ask --text "用一句话介绍 MyClaw" --json
  myclaw configure-agent --target feishu-llm --text "帮我检查飞书 LLM 回复还差哪些配置" --json
  myclaw receive --from local-user --conversation local-thread --text "hello" --reply "received"
  myclaw dashboard --port 4321
  myclaw gateway --port 4321
  myclaw feishu-bot --reply-prefix "MyClaw 收到了" --reply-mode direct
  myclaw feishu-bot --reply-provider llm --llm-privacy-ack --reply-mode direct
  myclaw feishu-bot --allowed-chat-ids "$MYCLAW_FEISHU_ALLOWED_CHAT_IDS" --require-mention
  myclaw migrate openclaw --source $MYCLAW_OPENCLAW_SOURCE --json
  myclaw send --channel feishu-webhook --webhook-url "$MYCLAW_FEISHU_WEBHOOK_URL" --text "hello"

Notes:
  configure-agent defaults to a safe projection. Use --unsafe-full-local only when you intentionally want the full local proposal in terminal output.
`);
}

export function printMigrateHelp() {
  console.log(`MyClaw migration

Usage:
  myclaw migrate openclaw [--source <openclaw.json|repo|home-dir>] [--stage] [--output <path>] [--state-dir <path>] [--json]

The OpenClaw migration command is dry-run by default. It inventories config sections,
channels, plugin manifests, unsupported runtime surfaces, and a MyClaw draft mapping.
With --stage it writes a reviewable snapshot but still does not apply runtime changes.
`);
}
