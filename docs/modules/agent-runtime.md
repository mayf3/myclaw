# Agent Runtime

## 诊断

Agent Runtime 应该晚于 workflow core 和 tool registry。MyClaw 的 agent 不应直接变成“无边界 shell 代理”，而应该围绕 workflow、tool policy 和 approval 运行。

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

对 MyClaw 的结论：Phase 3 只做单 agent，但文件边界要提前按 builder/loop/provider/session/prompt/tool-dispatch 拆好。

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

如果 tool 需要 approval，agent turn 应暂停并返回 `needs_approval`，而不是绕过审批继续执行。

## MVP 边界

Phase 3：

- OpenAI-compatible provider。
- 单轮和多轮 session。
- tool call dispatch。
- transcript JSONL。
- `/new`, `/status`, `/model` 最小命令。
- no streaming first。

后续：

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
- prompt builder 注入过多动态内容，导致不可缓存和难调试。
- tool result 过大，污染 transcript。

## 验收标准

- `myclaw ask "列出当前目录"` 能调用工具并返回结果。
- tool call、tool result、assistant response 都写入 transcript。
- 被 policy deny 的工具不会出现在模型 schema。
- 需要 approval 的工具调用会暂停，resume 后继续或结束。
