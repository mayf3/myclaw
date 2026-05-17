# MyClaw 初期实现方案

## 总诊断

MyClaw 的初期目标应该是“可恢复、可审批、可审计的本地 workflow/agent 内核”，不是“完整个人 AI 操作系统”。参考项目给出的共同结论是：先冻结核心协议，再增加 agent；先做好工具权限和状态恢复，再做 gateway、记忆、插件和 UI。

## 初期产品边界

要做：

- Node.js/TypeScript/pnpm workspace。
- CLI-first：`myclaw run`、`myclaw resume`、`myclaw ask`、`myclaw doctor`。
- 可恢复 workflow runner。
- 统一 JSON envelope。
- 工具 registry、policy、approval。
- run/event/transcript 落盘。
- 最小 agent runtime：单 agent、工具调用、transcript。

不做：

- 桌面 App、Tauri、语音、屏幕感知。
- 多渠道 Telegram/Slack/Discord。
- 大规模 OAuth 集成。
- Memory tree、知识图谱、自动拉取。
- plugin runtime。
- 多 subagent 并行。

## 初期阶段总览

| 阶段 | 名称 | 用户可见能力 | 核心交付 | 参考来源 |
|---|---|---|---|---|
| Phase 0 | Contract Skeleton | `myclaw --help`、`myclaw doctor` | monorepo、config、controller registry、envelope 类型 | OpenHuman controller registry、OpenClaw config 边界 |
| Phase 1 | Workflow Core | `myclaw run workflow.json --json` | runner、state JSONL、event bus、resume 状态 | Lobster run/resume、OpenHuman event bus |
| Phase 2 | Tools + Approval | `myclaw run "exec echo hi"` 安全执行 | ToolDescriptor、policy、approval store、audit | OpenHuman Tool trait、安全策略；OpenClaw policy |
| Phase 3 | Agent Runtime | `myclaw ask "..."` 调工具完成任务 | provider、tool calling、transcript、context/result budget | OpenHuman agent harness、Hermes memory/session 思路 |
| Phase 3.5 | Session Search | `myclaw search "..."` | SQLite/FTS、历史 run 和 transcript 检索 | Hermes session FTS、OpenHuman memory 轻量切片 |
| Phase 4 | Local Gateway | 本地 HTTP/WS 控制面 | Fastify、token auth、events stream、schema discovery | OpenHuman JSON-RPC、OpenClaw gateway |

## 推荐目录结构

```text
myclaw/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  packages/
    core/
      src/
        envelope.ts
        controllers.ts
        events.ts
        workflow/
        state/
    cli/
      src/index.ts
    tools/
      src/
        descriptor.ts
        policy.ts
        builtins/
    agent/
      src/
        provider.ts
        prompt.ts
        loop.ts
        transcript.ts
    memory/
      src/
        session-store.ts
        search.ts
    gateway/
      src/server.ts
  docs/
```

边界要求：

- `packages/core` 不依赖 CLI、gateway、agent。
- `packages/tools` 不直接读 CLI 参数，只接收标准 `ToolContext`。
- `packages/agent` 只能通过 `dispatchTool` 调工具。
- `packages/gateway` 只暴露 controller 和 event stream。

## 核心协议

所有入口都返回同一类 envelope：

```ts
type RunStatus = "ok" | "failed" | "cancelled" | "needs_approval";

interface MyClawEnvelope<T = unknown> {
  ok: boolean;
  status: RunStatus;
  runId: string;
  stepId?: string;
  approvalId?: string;
  resumeToken?: string;
  result?: T;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  events: RunEvent[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    elapsedMs: number;
  };
}
```

这条协议必须早于 agent。否则 CLI、gateway、agent、UI 会各自生成无法统一的结果格式。

## Phase 0: Contract Skeleton

目标：

- 项目能安装、测试、运行。
- controller registry 和 envelope 类型稳定。
- config/state 路径可诊断。

交付：

- `pnpm test`、`pnpm typecheck`。
- `myclaw --help`。
- `myclaw doctor --json`。
- `ControllerDefinition`：`namespace`、`method`、`paramsSchema`、`handler`、`permission`。
- `~/.myclaw/config.json` 或项目 `.myclaw/config.json`。
- `~/.myclaw/state/` 或工作区 `.myclaw/state/`。

验收：

- unknown param 会失败。
- controller name collision 会失败。
- doctor 能输出 Node、pnpm、state dir、workspace dir、config source。

## Phase 1: Workflow Core

目标：

- 没有 LLM，也能执行 workflow。
- 每次 run 都有事件和可恢复状态。

最小 workflow：

```json
{
  "version": 1,
  "steps": [
    { "id": "hello", "tool": "shell.exec", "args": { "cmd": "echo hello" } }
  ]
}
```

交付：

- `myclaw run workflow.json --json`。
- `myclaw run "shell.exec echo hello" --json`。
- `RunStore`：`runs.jsonl`、`events.jsonl`、`approvals.jsonl`。
- `EventBus`：`run.started`、`step.started`、`tool.started`、`approval.required`、`run.completed`。
- `resumeToken` 生成和校验。

验收：

- `ok/failed/cancelled/needs_approval` 都有单测。
- 进程中断后可以通过 state 查到未完成 run。
- event 顺序可重放。

## Phase 2: Tools + Approval

目标：

- 所有副作用都经过工具协议和 policy。
- 高风险操作暂停为 approval，而不是直接执行。

内置工具：

- `fs.read`
- `fs.write`
- `fs.list`
- `search.grep`
- `shell.exec`
- `state.read`

工具协议：

```ts
interface ToolDescriptor<TArgs = unknown> {
  name: string;
  description: string;
  category: "system" | "memory" | "integration" | "agent";
  permission: "none" | "read" | "write" | "execute" | "dangerous";
  schema: ZodSchema<TArgs>;
  maxOutputBytes?: number;
  execute(args: TArgs, context: ToolContext): Promise<ToolResult>;
}
```

policy：

- workspace boundary。
- deny list / allow list。
- timeout。
- max output。
- write/execute/dangerous 风险判定。
- approval 生成、批准、拒绝、过期。

验收：

- `shell.exec rm -rf /` 被拒绝。
- workspace 外写文件被拒绝。
- 高风险命令返回 `needs_approval`。
- `myclaw resume <approvalId> --approve` 后继续执行。
- tool result 被截断时 envelope 显示 `truncated`。

## Phase 3: Agent Runtime

目标：

- Agent 可以用自然语言调用工具，但不能绕过 Phase 2 的 policy。

交付：

- `myclaw ask "列出当前目录并总结"`。
- OpenAI-compatible provider。
- prompt builder。
- tool calling loop。
- transcript JSONL。
- result budget 和 context budget。
- `--dry-run` 或 `--require-approval` 模式。

限制：

- 单 agent。
- 无 subagent。
- 无自动后台任务。
- 无长期 memory tree。
- 不直接接 Slack/Telegram。

验收：

- agent 调 `fs.read`、`search.grep`、`shell.exec` 都进入 transcript。
- agent 的写/执行动作触发 approval。
- provider 错误有结构化 error code。
- prompt 和 tool schema 可 dump，用于调试。

## Phase 3.5: Session Search

目标：

- 让 MyClaw 开始积累长期价值，但不做复杂 memory tree。

交付：

- SQLite 表：`runs`、`events`、`messages`、`tool_calls`。
- FTS：对 user message、assistant answer、tool output 建索引。
- `myclaw search "approval"`。
- `myclaw show <runId>`。
- agent 可选注入最近/相关 session 摘要。

验收：

- 能检索历史 run。
- 检索结果有来源 runId/stepId/messageId。
- 注入 prompt 前有字符/token 上限。

## Phase 4: Local Gateway

目标：

- 把 CLI 已验证的 core 暴露为本地服务。

交付：

- `myclaw gateway start`。
- `POST /rpc` 或 `POST /runs`。
- `GET /health`。
- `GET /schema`。
- `GET /runs/:id/events` 或 WebSocket event stream。
- 本地 token auth。

验收：

- 无 token 不允许 mutation。
- HTTP 和 CLI 调同一套 controller。
- event stream 与 CLI `--json` 的事件一致。

## 第一轮实现顺序

1. 建 monorepo 和测试基线。
2. 写 `envelope.ts`、`events.ts`、`controllers.ts`。
3. 写 `RunStore`，先 JSONL，不上 SQLite。
4. 写 workflow parser + runner。
5. 写 `fs.read`、`fs.list`、`search.grep` 三个只读工具。
6. 加 `shell.exec`，接 timeout/output cap。
7. 加 policy 和 approval store。
8. 再接 agent。

## 关键取舍

- Gateway 不在第一天做，但 controller registry 第一天做。
- Memory tree 不在初期做，但 transcript 和 run event 第一天落盘。
- Skills 不在初期执行代码，但可以借鉴 `SKILL.md` 作为 prompt 文档。
- UI 不在初期做，但 event model 要服务未来 UI。
- Agent 不拥有工具，agent 只是 controller/tool 的调用者。

## 初期 Done Definition

- 每个阶段有 CLI 命令。
- 每个命令有 `--json`。
- 每个状态能恢复或解释失败。
- 每个 tool 有权限级别。
- 每个副作用有 audit event。
- 每个模块有单测。
- 文档有 HTML 入口并发布到 HTML Center。
