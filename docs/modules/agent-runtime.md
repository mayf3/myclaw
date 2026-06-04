# Agent Runtime

## 诊断

Agent Runtime 应该晚于 workflow core 和 tool registry。Phase 1.7 先开放真实 LLM 单轮回复，Phase 1.8 再开放 review-only 配置提案，让用户开始测试“agent 能不能帮助判断配置缺口”。但 MyClaw 的 agent 不应直接变成“无边界 shell 代理”，后续工具调用和配置落地必须围绕 workflow、tool policy、staged apply 和 approval 运行。

## 参考项目观察

Hermes 的 agent loop 可借鉴点：

- provider resolution 独立于 agent。
- tool call schema 来自 registry。
- tool call 结果回填对话历史。
- compression 和 prompt caching 分层。
- session persistence 在每 turn 后落盘。
- fallback model 和 auxiliary model 可独立配置。

OpenClaw 的 agent runtime 可借鉴点：

- workspace bootstrap files。
- skills load order。
- tools 由 policy 裁剪后再暴露给模型。
- streaming、steering queue、block streaming 都是后期能力。

OpenHuman 的 agent runtime 可借鉴点：

- `Agent::turn` 明确按 prompt build、memory context、provider loop、tool dispatch、history、background extraction 组织。
- `AgentBuilder` 负责组装 provider、tools、memory、prompt builder、dispatcher，不把构造逻辑塞进 turn。
- `spawn_subagent` 是普通 tool，子代理也必须从 parent context 读取工具和 memory。
- context pipeline 有 tool-result budget、microcompact、autocompaction、session memory。

对 MyClaw 的结论：Phase 1.8 仍不能直接进入 provider tool loop。现在只做 `askAgent` 单轮回复和 `proposeAgentConfig` 配置提案；下一步先补 staged apply，再把 ToolDescriptor、policy dispatch 和 provider tool loop 接起来。文件边界要提前按 builder/loop/provider/session/prompt/tool-dispatch/config-proposal 拆好。

## 推荐设计

Agent Runtime 分为五个小模块：

```text
provider/
  openai-compatible.ts
  model-ref.ts

prompt/
  prompt-builder.ts
  workspace-context.ts
  skill-context.ts

loop/
  run-agent-turn.ts
  tool-call-dispatch.ts
  iteration-budget.ts

session/
  transcript.ts
  compaction.ts
  result-budget.ts

policy/
  visible-tools.ts
  model-capabilities.ts
```

Phase 1.7/1.8 已落地的最小切片：

- `packages/llm/src/openai-responses.mjs`：OpenAI Responses provider adapter。
- `packages/agent/src/ask.mjs`：单轮 ask run，写入 answer、usage、events 和 `toolCalls: []`。
- `packages/agent/src/config-proposal.mjs`：review-only 配置提案，写入 `cfg_*` run 和 pending approval。
- `myclaw ask --text ... --json`：本地 CLI 验证真实回复。
- `myclaw configure-agent --target feishu-llm --text ... --json`：本地 CLI 验证 agent 配置提案。
- `myclaw feishu-bot --reply-provider llm --llm-privacy-ack --reply-mode direct`：显式把备份群回复切到 LLM。

最小 agent API：

```ts
runAgentTurn({
  sessionId,
  userMessage,
  model,
  workspace,
  visibleTools,
}): Promise<AgentTurnResult>
```

## Tool Calling 关系

Agent 只能看到 policy 裁剪后的工具。

```text
config/tool policy
  -> visible tool descriptors
  -> model tool schemas
  -> model tool calls
  -> core tool dispatch
  -> envelope/tool result
  -> transcript
```

如果 tool 需要 approval，agent turn 应暂停并返回 `needs_approval`，而不是绕过审批继续执行。Phase 1.7 不把任何工具暴露给模型，`toolCalls` 必须保持空数组。

## MVP 边界

Phase 1.7：

- OpenAI Responses 单轮 provider。
- CLI `ask`。
- Feishu 显式 LLM replyBuilder。
- no tool calling。
- no memory injection。
- no streaming first。

Phase 1.8：

- Config proposal smoke：sanitized context、JSON proposal、pending approval。
- 不读取 secret，不写 `.myclaw`，不自动 apply。
- CLI 默认 JSON、Dashboard/API、approval API 只暴露 safe projection 或 proposalPreview。
- staged apply 是下一步，不和 proposal 混在一个命令里。

后续：

- OpenAI-compatible provider registry。
- 单轮和多轮 session。
- tool call dispatch。
- transcript JSONL。
- `/new`, `/status`, `/model` 最小命令。
- streaming。
- fallback providers。
- context compression。
- session search injection。
- skills auto update。

## 不建议照搬

- 不写巨型 agent class。
- 不在 agent loop 中直接实现每个 tool。
- 不把 memory write、session search、delegate 全部变成 loop 特例。
- 不在第一版做多 agent routing。

## 关键风险

- agent 直接执行 shell，绕过 workflow/approval。
- 把单轮 LLM 回复误认为已具备工具执行能力。
- 把 agent 配置提案误认为已经自动配置完成。
- 用户 prompt 里的 secret 只能靠模式化 redaction 降低风险，不能当成完整 DLP。
- Feishu 默认把群消息发给 LLM，导致隐私边界不清。
- prompt builder 注入过多动态内容，导致不可缓存和难调试。
- tool result 过大，污染 transcript。

## 验收标准

- Phase 1.7：`myclaw ask "用一句话介绍 MyClaw"` 能返回真实 answer，并写入 `ask_*` run。
- Phase 1.7：缺少 `OPENAI_API_KEY` 时返回 `llm_config_required`，不能 fake 回复。
- Phase 1.7：Feishu LLM 回复必须显式 `--reply-provider llm --llm-privacy-ack`。
- Phase 1.8：`myclaw configure-agent --target feishu-llm --text ... --json` 能返回配置提案并创建 pending approval。
- Phase 1.8：配置提案不写 `.myclaw`，CLI/API/approval 默认只暴露 safe projection 或 proposalPreview。
- 后续 E6：`myclaw ask "列出当前目录"` 能通过 policy 允许的工具返回结果。
- 后续 E6：tool call、tool result、assistant response 都写入 transcript。
- 被 policy deny 的工具不会出现在模型 schema。
- 需要 approval 的工具调用会暂停，resume 后继续或结束。
