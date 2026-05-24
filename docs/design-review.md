# MyClaw Design Review

诊断：不要复刻 Hermes、OpenClaw 或 OpenHuman；你的 MyClaw 应该先做成一个 Node.js/TypeScript 的本地工作流内核，吸收 Lobster 的 typed workflow + approval/resume、OpenHuman 的 controller registry/event bus/tool permission，再逐步长出 agent、gateway、记忆、插件和多渠道能力。

## 参考对象

本次评审基于三个本地项目：

- `/Users/yanfenma/workspace/github/hermes-agent`
- `/Users/yanfenma/workspace/github/openclaw`
- `/Users/yanfenma/workspace/github/openhuman`

重点阅读了 README、架构文档、agent loop、session、tool registry、gateway、plugin SDK、安全文档、OpenClaw 的 `extensions/lobster`，以及 OpenHuman 的 `src/core/all.rs`、`src/core/jsonrpc.rs`、`src/core/event_bus/`、`src/openhuman/agent/`、`src/openhuman/memory/`、`src/openhuman/tools/`、`src/openhuman/skills/`、`app/src/`。

## 模块化评审包

这份总览只给方向判断。细节已拆到模块文档，并由 [HTML 全局索引](./index.html) 统一导航。

| 模块 | 文档 | 用途 |
| --- | --- | --- |
| 参考项目对比 | [reference-comparison.html](./rendered/modules/reference-comparison.html) | 判断 Hermes、OpenClaw、OpenHuman、Lobster 哪些可借鉴，哪些不应照搬 |
| OpenHuman 参考分析 | [openhuman-analysis.html](./rendered/modules/openhuman-analysis.html) | 拆解 OpenHuman 的 RPC、event bus、agent、记忆、工具、skills、UI 和桌面壳 |
| 初期实现方案 | [initial-mvp-plan.html](./rendered/modules/initial-mvp-plan.html) | 把参考项目收敛成 MyClaw Phase 0-4 的 Node.js 实现切片 |
| Workflow Core | [workflow-core.html](./rendered/modules/workflow-core.html) | 定义 runner、envelope、approval/resume 状态机 |
| 接入层 | [access-layer.html](./rendered/modules/access-layer.html) | 拆 CLI、Gateway、未来渠道适配层 |
| Gateway | [gateway.html](./rendered/modules/gateway.html) | 本地 HTTP/WS 控制平面、auth、events |
| Agent Runtime | [agent-runtime.html](./rendered/modules/agent-runtime.html) | LLM provider、prompt、tool calling、session transcript |
| 工具/审批/安全 | [tools-approval-security.html](./rendered/modules/tools-approval-security.html) | ToolDescriptor、policy、approval、安全边界 |
| 记忆/Session/搜索 | [memory-session-search.html](./rendered/modules/memory-session-search.html) | memory、JSONL、SQLite/FTS、session_search |
| 插件与 Skills | [plugins-skills.html](./rendered/modules/plugins-skills.html) | 插件 manifest、register API、skills 边界 |
| 配置/状态/存储 | [config-state-storage.html](./rendered/modules/config-state-storage.html) | config schema、state 目录、secrets、migration |
| 控制台/观测/运维 | [ui-observability-ops.html](./rendered/modules/ui-observability-ops.html) | runs timeline、approval queue、doctor/status、UI 信息架构 |
| 人类测试手册 | [human-testing-playbook.html](./rendered/modules/human-testing-playbook.html) | 大方向进度、可参与阶段、全流程测试路径和反馈格式 |
| 路线与验收 | [roadmap-acceptance.html](./rendered/modules/roadmap-acceptance.html) | 每阶段交付和 done definition |

## 规模判断

| 项目 | 技术栈 | 规模信号 | 设计重心 |
| --- | --- | ---: | --- |
| Hermes Agent | Python 为主，少量 Node/Web | 约 870 个 Python 文件，核心 Python 约 158k 行 | 自我学习 agent、TUI、多渠道、记忆、技能、终端后端 |
| OpenClaw | Node.js/TypeScript | 约 14k 个 TS/JS 文件，TS 约 804k 行，127 个 extensions | 本地优先 gateway、插件能力模型、多渠道、设备节点、Control UI |
| OpenClaw Lobster | Node.js/TypeScript plugin | 约 2.7k 行 | typed workflow、JSON envelope、approval/resume |
| OpenHuman | Rust core + Tauri/React | 大型桌面 agent 产品，几十个 Rust domain 模块 | controller registry、event bus、agent harness、memory tree、tool permission、UI 状态聚合 |

## 设计评审

### Critical

1. **两个项目都不是适合直接照抄的起点。**
   Hermes 的能力闭环很强，但核心 agent、CLI、gateway 都偏大文件和强耦合；OpenClaw 是完整平台，插件 SDK、channel、node、UI、daemon、安全模型都已经进入产品级复杂度。MyClaw 第一阶段如果照搬，会在还没有核心体验前先承担平台成本。

2. **MyClaw 的第一性目标必须缩小。**
   推荐第一目标不是“个人 AI 助理平台”，而是“本地可审计、可恢复、有审批机制的工作流执行器”。这和 OpenClaw Lobster 的边界最接近，也最适合 Node.js 单人项目起步。

3. **Controller registry 和 event bus 要早于 gateway。**
   OpenHuman 的 `src/core/all.rs` 和 `src/core/event_bus/` 说明：如果没有统一 controller 和事件面，CLI、HTTP、UI、agent 会很快分叉。MyClaw Phase 0/1 应先做这些内核协议，HTTP gateway 可以等 Phase 4。

4. **安全边界要从第一天建模。**
   OpenClaw 明确是单用户 personal assistant trust model，不是多租户安全边界。MyClaw 也应采用这个边界：默认本地、单用户、workspace-bound 文件访问、危险步骤审批、所有外部入口默认关闭。

### Major

1. **Hermes 值得吸收的是 agent 行为，不是代码结构。**
   可借鉴：持久记忆、技能沉淀、session FTS 搜索、prompt 稳定、工具可见性、长任务压缩、subagent/delegation 思路。
   不建议照搬：巨型 `AIAgent`、Python 插件形态、过多 terminal backend、RL/trajectory 子系统。

2. **OpenClaw 值得吸收的是系统边界，不是全部平台面。**
   可借鉴：Node/TS、strict config schema、WebSocket gateway 协议、plugin manifest、tool policy、DM pairing、安全审计、session key 设计。
   不建议第一阶段照搬：127 个 extension、Control UI、移动端节点、完整多渠道、复杂插件 SDK。

3. **Lobster 是最接近 MyClaw 起点的参考。**
   它把 workflow 执行结果统一成 JSON envelope：
   `ok/status/output/requiresApproval/error`。
   同时支持 `run` 和 `resume`，approval 通过 `resumeToken` 或 `approvalId` 恢复。这个接口形状适合成为 MyClaw v0 的核心协议。

4. **OpenHuman 值得吸收的是长期 agent 的模块边界。**
   可借鉴：controller registry、event bus、Tool permission、agent harness、memory 分层、skills 注入、Intelligence UI 的信息架构。
   不建议照搬：Rust/Tauri、桌面权限、语音、Meet、screen intelligence、subconscious、118+ OAuth 集成、memory tree。

### Minor

1. Hermes 的 YAML config + `.env` 简单易懂；OpenClaw 的 JSON5 + schema 更适合 UI 和严格校验。MyClaw 建议用 JSON5 + Zod schema，兼顾可写性和类型安全。

2. Hermes 用 SQLite + FTS5 存 session 很适合长期记忆；OpenClaw 用 JSONL transcripts 更利于调试。MyClaw 初期建议 JSONL，等 session search 成为核心需求后再引入 SQLite/FTS。

3. OpenClaw 插件 manifest 很强，但外部兼容成本高。MyClaw 初期只需要一个极简 plugin contract：`manifest.json` + `register(api)` + `tools`。

## 推荐产品定义

MyClaw 是一个本地优先的 Node.js AI 工作流与 agent 运行时。

第一阶段用户价值：

- 把自然语言或命令转成可执行 workflow。
- 每个 workflow 都有 typed JSON 输出。
- 有副作用的步骤必须能暂停并等待审批。
- 失败后可恢复、可追踪、可审计。
- 先在 CLI 好用，再加本地 gateway 和 UI。

不要第一阶段承诺：

- 全渠道聊天机器人。
- 移动端节点。
- 完整插件市场。
- 自学习技能生态。
- 多租户安全。

## 推荐架构

```text
myclaw/
  packages/
    core/           # workflow parser, runner, state machine, envelope
    cli/            # myclaw run/resume/status/config
    tools/          # builtin tools: exec/read/write/http/llm
    agent/          # later: model loop + tool calling
    gateway/        # later: local HTTP + WS control plane
    plugins/        # later: plugin loader + manifest contract
  apps/
    control-ui/     # later: local dashboard
  docs/
```

### Core Data Flow

```text
CLI/Gateway request
  -> Workflow parser
  -> Runner
  -> Tool registry
  -> Step result
  -> Envelope normalizer
  -> State store
  -> JSON/text output
```

### Workflow State Machine

```text
created
  -> running
  -> needs_approval
  -> running
  -> ok

running -> failed
running -> cancelled
needs_approval -> cancelled
```

### Envelope Contract

```ts
type MyClawEnvelope =
  | {
      ok: true;
      status: "ok" | "needs_approval" | "cancelled";
      output: unknown[];
      requiresApproval: null | {
        type: "approval_request";
        prompt: string;
        items: unknown[];
        resumeToken?: string;
        approvalId?: string;
      };
    }
  | {
      ok: false;
      error: {
        type?: string;
        message: string;
      };
    };
```

## 技术选择

| 维度 | 推荐 |
| --- | --- |
| Runtime | Node 22.16+，兼容 Node 24 |
| 语言 | TypeScript, ESM |
| CLI | `commander` 或 `cac`，先保持简单 |
| Schema | Zod 作为运行时校验；需要 JSON Schema 时再生成 |
| Config | `~/.myclaw/config.json5` |
| State | 初期 JSONL + JSON index；后期 SQLite + FTS |
| Tests | Vitest |
| Formatting/Lint | Biome 或 oxlint/oxfmt，优先少工具 |
| Package | pnpm workspace |
| LLM | 先 OpenAI-compatible provider abstraction |

## 阶段路线

### Phase 0: Contract Skeleton

目标：能安装、能跑测试、能打印版本。

- 初始化 pnpm workspace。
- 建 `packages/core`、`packages/cli`、`packages/tools`。
- 建 `myclaw` bin。
- 加 Vitest、TS config、基础 lint/format。
- 定义 `MyClawEnvelope`、`ControllerDefinition`、`EventBus`。

验收：

- `pnpm test` 通过。
- `pnpm myclaw --help` 可用。
- `myclaw doctor` 能检查 Node 版本、config、state 目录。
- controller collision 和 unknown param 有测试。

### Phase 1: Lobster-like Workflow Core

目标：先做可恢复 workflow，不接 AI。

- `myclaw run "exec echo hi"`。
- `myclaw run path/to/workflow.json`。
- 标准 envelope 输出。
- state store 记录 run、step、approval。
- events JSONL 记录运行过程。
- `myclaw resume <approvalId> --approve/--deny`。

验收：

- workflow 成功、失败、取消、审批暂停、审批恢复都有测试。
- cwd 限制在 workspace 内。
- stdout/stderr 有上限和超时。

### Phase 2: Tool Registry + Built-in Tools

目标：让 workflow 可组合。

- tool descriptor: name/schema/execute/sideEffect/approvalPolicy。
- builtin tools: `exec`, `read`, `write`, `http.fetch`, `llm.complete`。
- 工具可见性和 allow/deny policy。
- dangerous exec approval。

验收：

- 未允许的 tool 不可执行。
- mutating tool 默认需要 policy 或 approval。
- 所有 tool result 都被 envelope normalizer 包住。

### Phase 3: Agent Runtime

目标：自然语言可以调用工具，但仍以 workflow/state 为中心。

- provider abstraction。
- OpenAI-compatible chat completion。
- function/tool calling。
- session transcript JSONL。
- prompt builder 注入 workspace instructions。
- `/new`, `/status`, `/model` 等最小命令。

验收：

- `myclaw ask "列出当前目录"` 能调用 read/exec。
- tool call 全量入 transcript。
- 中断/失败不会污染已完成 state。

### Phase 4: Local Gateway

目标：从 CLI 变成本地服务。

- HTTP + WebSocket gateway。
- `POST /runs`, `POST /runs/:id/resume`, `GET /runs/:id`。
- auth token。
- event stream。
- 本地 only 默认绑定 `127.0.0.1`。

验收：

- CLI 可以通过 gateway 调用。
- workflow progress 可订阅。
- 无 token 时拒绝非 loopback 或所有 HTTP mutation。

### Phase 5: Plugins and Skills

目标：让能力可以扩展，但保持 contract 小。

- plugin manifest: id/name/version/tools/configSchema。
- `register(api)` only。
- plugin-owned tools。
- skills 只是 prompt/workflow instructions，不参与运行时代码。

验收：

- 本地 plugin 可加载/禁用。
- plugin config schema 严格校验。
- plugin tool 不能覆盖 core tool，除非显式 override。

### Phase 6: Memory and Search

目标：把 Hermes 的长期记忆优势补回来。

- session search。
- durable memory file。
- skill creation/update command。
- SQLite + FTS5 迁移。

验收：

- 能按关键词检索历史 run/session。
- memory 注入 prompt 前有大小限制。
- skill 不会无边界膨胀 prompt。

## 推荐先实现的最小接口

```bash
myclaw init
myclaw doctor
myclaw run "exec echo hello"
myclaw run workflow.json --json
myclaw status <runId>
myclaw resume <approvalId> --approve
myclaw resume <approvalId> --deny
```

## 不建议做的事

- 不要先写 Web UI。
- 不要先做 Telegram/WhatsApp/Discord。
- 不要先做插件市场。
- 不要引入多 agent routing。
- 不要用复杂沙箱承诺安全；先用 workspace boundary + approvals + local-only。
- 不要把 agent loop 写成一个几千行文件。

## 第一版模块边界

| 模块 | 职责 | 不负责 |
| --- | --- | --- |
| `core` | workflow AST、runner、state machine、envelope | CLI、HTTP、LLM provider |
| `tools` | 工具定义和执行 | workflow 调度 |
| `cli` | 命令解析和终端输出 | 核心业务逻辑 |
| `agent` | LLM loop、prompt、tool calling | gateway auth、plugin loading |
| `gateway` | HTTP/WS、auth、events | 业务规则 |
| `plugins` | manifest、loader、registration | 核心 tool override |

## 最终建议

MyClaw 的正确路径是：

1. 从 OpenClaw Lobster 的 workflow envelope + approval/resume 形状出发。
2. 用 OpenClaw 的安全和配置思路约束边界。
3. 用 Hermes 的记忆、技能、session search 思路增强长期使用价值。
4. 保持 Node.js/TypeScript，先 CLI，后 gateway，再 agent，最后渠道。

第一阶段的代码目标应该是：`myclaw run` 和 `myclaw resume` 足够可靠。只要这个核心做好，后面的 agent、gateway、插件、多渠道都是在一个清晰内核上加壳，而不是从一开始就背上整个平台。
