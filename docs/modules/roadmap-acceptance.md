# 阶段路线与验收

## 总诊断

MyClaw 的阶段路线应该从“可恢复 workflow”开始，而不是从“全能个人助理”开始。OpenHuman 增加后的判断更明确：controller registry、event bus、tool permission 可以早做；桌面壳、memory tree、subconscious、渠道和大规模集成必须后置。

## 分层路线

| 层 | 目标 | 用户可测实验 |
|---|---|---|
| L0 接入层 | 人、CLI、webhook、Feishu/Lark 的基础消息交互 | E0、E2、E3 |
| L1 Gateway | HTTP 控制面、鉴权、状态读取、mutation 边界 | E1、E3、E5 |
| L2 Workflow 与审批 | 高风险动作进入 review/approval，而不是自动执行 | E4、E5 |
| L3 单 Agent Runtime | 单个 agent 可拆任务、调用工具、失败重试、人工确认 | E6 |
| L4 Session Search / Provenance | run、step、tool result 可检索，召回来源可解释 | E8 |
| L5 Agent-to-Agent | 多 agent 分工、交接上下文、互相 review | E9 |
| L6 Long Memory / Search | 长期事实、来源解释、遗忘策略和跨会话召回 | E10 |

原则：L0/L1 没有稳定人类测试前，不进入 L3；L2 没有审批边界前，不开放 agent 执行写操作；L4 最小 session/provenance 必须早于 L5 agent 协作，否则交接上下文不可审计；L6 复杂长期记忆必须晚于可追踪 run/event，否则召回来源不可解释。

具体的人类测试入口、反馈格式和每轮回归路径见 [人类测试手册](./human-testing-playbook.md)。

## Phase 0: Contract Skeleton

目标：

- Node.js/TypeScript/pnpm workspace。
- `myclaw` bin。
- tests。
- controller registry。
- 统一 envelope。
- config/state 路径。

交付：

- `packages/core`
- `packages/cli`
- `packages/tools`
- `ControllerDefinition`
- `MyClawEnvelope`
- `docs/index.html`

验收：

- `pnpm test`。
- `pnpm myclaw --help`。
- `myclaw doctor`。
- unknown param 和 controller collision 有测试。

## Phase 1: Workflow Core and Event Bus

目标：

- 不接 AI，先让 workflow 可执行、可恢复、可审计。
- 所有运行状态以事件形式落盘。

交付：

- `myclaw run "exec echo hello"`。
- `myclaw run workflow.json --json`。
- `myclaw resume <approvalId> --approve/--deny`。
- state store。
- `EventBus` 和 run/event JSONL。

验收：

- ok/failed/cancelled/needs_approval 都有测试。
- cwd boundary 有测试。
- timeout/stdout cap 有测试。

## Phase 2: Tool Registry and Policy

目标：

- 工具标准化，policy 生效。

交付：

- ToolDescriptor。
- builtin tools。
- allow/deny。
- approval persistence。

验收：

- denied tool 不可见也不可 dispatch。
- write/exec 可以触发 approval。
- tool result 全部规范化。

## Phase 3: Agent Runtime

目标：

- agent 能调用工具，但不能绕过 workflow/policy/approval。

交付：

- provider abstraction。
- OpenAI-compatible provider。
- transcript JSONL。
- tool calling。

验收：

- `myclaw ask` 能完成 read/exec 类任务。
- tool call 全量入 transcript。
- approval pause/resume 可用。

## Phase 3.5: Session Search

目标：

- 先获得长期使用价值，但不做完整 memory tree。

交付：

- transcript JSONL。
- SQLite/FTS。
- `myclaw search`。
- `myclaw show <runId>`。

验收：

- 能检索历史 run/session/tool result。
- 检索结果有 runId/stepId/messageId。
- agent 注入历史上下文有大小上限。

## Phase 4: Local Gateway

目标：

- 本地服务化。

交付：

- HTTP/WS gateway。
- token auth。
- event stream。
- CLI remote mode。

验收：

- `POST /runs` 可执行。
- WS 可收 run events。
- 无 token 拒绝 mutation。

## Phase 5: Plugins and Skills

目标：

- 能扩展工具和 prompt workflow。

交付：

- plugin manifest。
- plugin loader。
- plugin tools。
- skills loader。

验收：

- plugin schema strict validation。
- tool collision 被拒绝。
- skills 只影响 prompt，不执行代码。

## Phase 6: Memory and Search

目标：

- 完整长期记忆，而不只是 session search。

交付：

- memory files。
- skill create/update。
- chunk、embedding、summary 或 graph 的可选实现。

验收：

- 能在 session search 之外形成稳定长期记忆。
- memory 注入有大小限制。
- agent 能基于历史摘要恢复上下文。

## 全局 Done Definition

每个阶段必须满足：

- 有 CLI 入口。
- 有 JSON 输出。
- 有测试。
- 有 docs。
- 有 doctor/status 可诊断。
- 失败状态可解释。
