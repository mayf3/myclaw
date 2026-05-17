# OpenHuman 参考分析

## 总诊断

OpenHuman 对 MyClaw 的最大价值不是技术栈，而是边界划分。它证明一个长期运行的个人 agent 需要稳定的 RPC/controller registry、事件总线、记忆层、工具权限、安全策略、配置中心和 UI 状态聚合；但它的 Rust/Tauri、桌面环境桥接、118+ 集成、语音、Meet、subconscious、memory tree 都不适合作为 MyClaw 初期实现范围。

## 项目画像

| 维度 | OpenHuman 设计 | 对 MyClaw 的判断 |
|---|---|---|
| 技术栈 | Rust core + Tauri v2 + React 19 + SQLite/FTS5 | 不照搬。MyClaw 继续 Node.js/TypeScript，但吸收模块边界 |
| 入口 | React 桌面 UI、Tauri IPC、HTTP JSON-RPC、CLI、channels | 初期只做 CLI；保留 controller registry，后续再挂 HTTP/WS gateway |
| Agent | `Agent::turn`、tool loop、subagent、prompt builder、memory loader | Phase 3 再做，不要先做人格化桌面助手 |
| 记忆 | UnifiedMemory、ingestion queue、memory tree、conversation JSONL | 初期只做 transcript JSONL + SQLite/FTS session search；memory tree 后置 |
| 工具 | Tool trait、ToolSpec、PermissionLevel、ToolCategory、scope | 直接借鉴成 Node.js `ToolDescriptor` 和 policy gate |
| 安全 | AutonomyLevel、risk policy、sandbox、audit、pairing guard | 初期先做 workspace boundary、approval、audit JSONL；sandbox 后置 |
| Skills | `SKILL.md` discovery + per-turn injection，执行 runtime 已移除 | 适合 MyClaw：先把 skills 当 prompt workflow，不当插件执行代码 |
| 产品体验 | UI-first、onboarding、Intelligence/Memory/Skills/Settings 页面 | 后续 Control UI 借鉴，不进入 Phase 0-3 |

## 证据与模块拆解

| 模块 | 证据路径 | 关键观察 | MyClaw 建议 |
|---|---|---|---|
| Controller registry | `src/core/all.rs` | 所有 domain controller 统一注册、schema 校验、RPC 暴露 | Phase 0 就定义 `ControllerDefinition`，但先由 CLI 调用 |
| JSON-RPC gateway | `src/core/jsonrpc.rs` | HTTP JSON-RPC、health、schema discovery、SSE/WS 边界 | Phase 4 做 HTTP/WS，不要让 gateway 先于 core 成熟 |
| Event bus | `src/core/event_bus/{events,bus}.rs` | Agent、Memory、Channel、Cron、Skill、Tool 事件统一发布 | Phase 1 做轻量 `EventBus`，所有 run/tool/approval 状态都发事件 |
| Agent harness | `src/openhuman/agent/README.md`、`docs/agent-subagent-tool-flow.md` | session runtime 与 subagent runner 分层，parent context 明确 | MyClaw 初期只做单 agent；subagent 保留接口，不实现 |
| Tool contract | `src/openhuman/tools/traits.rs` | Tool 有 schema、permission、scope、category、结果预算 | 直接落到 TypeScript：`name/schema/permission/category/execute` |
| Memory | `src/openhuman/memory/README.md`、`memory/tree/README.md` | 旧 store 与 memory tree 共存，管线很重 | 先做 session search，不做 chunk/entity/graph/tree |
| Skills | `src/openhuman/skills/README.md`、`skills/inject.rs` | `SKILL.md` 发现、显式 `@skill`、8KiB 注入上限 | Phase 5 前可以先实现只读 loader；执行 runtime 不做 |
| Desktop shell | `app/src-tauri/`、`gitbooks/developing/architecture/tauri-shell.md` | Tauri 管生命周期、窗口、IPC、桌面权限 | MyClaw 初期不要做桌面壳；先用 HTML Center/本地网页沉淀报告 |
| Intelligence UI | `app/src/pages/Intelligence.tsx` | Memory、Subconscious、Calls、Dreams、Tasks 分 tab | Control UI 后续可以采用“运行/记忆/审批/任务”四区，而不是营销首页 |
| Subconscious | `src/openhuman/subconscious/` | 周期任务、LLM 判断 act/escalate/noop、反思落库 | MyClaw Phase 0-3 不做主动后台思考，只留 cron/event 基础 |

## Gateway 与接入层

OpenHuman 把业务 controller 与 HTTP JSON-RPC transport 分开：`src/core/all.rs` 聚合 controller，`src/core/jsonrpc.rs` 只负责 JSON-RPC envelope、错误、health、schema discovery 和实时流。这一点比直接在 HTTP handler 里写业务逻辑更适合 MyClaw。

MyClaw 推荐：

- Phase 0 定义 controller registry：`namespace.method`、Zod params、handler、permission、description。
- Phase 1 CLI 直接调用 controller，不启动 HTTP 服务。
- Phase 4 再把同一套 controller 暴露为 Fastify HTTP + WS event stream。
- Gateway 只做 auth、request id、stream、schema discovery、rate limit，不做 workflow 业务。

不建议照搬：

- 不需要 Tauri IPC relay。
- 不需要 Socket.IO 双通道。
- 不需要桌面 service manager。

## Agent Runtime

OpenHuman 的 agent runtime 已经是成熟系统：prompt builder、memory loader、tool loop、subagent、turn hooks、context compaction、session transcript、provider routing都存在。它的设计说明了一个事实：agent 不应该直接拥有工具执行权，工具调用必须经过统一 registry、permission、history 和事件记录。

MyClaw 初期建议：

- Phase 3 才实现 `myclaw ask`。
- `ask` 调用工具时必须走 Phase 2 的 `dispatchTool`，不能直接 `child_process.exec`。
- transcript 用 JSONL 存每次 provider request、tool call、tool result、final answer。
- 先只支持 OpenAI-compatible chat/completions 或 Responses 风格之一；provider router 后置。
- subagent 先保留 schema，不做并行代理执行。

## 工具、审批与安全

OpenHuman 的工具 trait 把 `ToolScope`、`ToolCategory`、`PermissionLevel`、`supports_markdown`、`max_result_size_chars` 放在统一协议中。这对 MyClaw 很关键，因为早期如果只把工具写成函数，后续 agent、gateway、plugin、channel 会重复发明权限系统。

MyClaw 初期建议：

- `ToolPermission = none | read | write | execute | dangerous`。
- `ToolCategory = system | integration | memory | agent`。
- 工具返回统一 `ToolResult`：`ok`、`content`、`metadata`、`truncated`、`requiresApproval`。
- `write/execute/dangerous` 默认需要 policy 判定；高风险动作产出 `approvalId`。
- 所有工具有 timeout、stdout/stderr cap、workspace boundary。

## 记忆与搜索

OpenHuman 的 memory tree 很强，但成本也高：canonicalize、chunk、content store、score、source/topic/global tree、retrieval、jobs。MyClaw 初期如果照搬，会在还没有核心 run/approval 之前就陷入存储与召回系统。

MyClaw 初期建议：

- Phase 1 存 run/event JSONL。
- Phase 3 存 transcript JSONL。
- Phase 3.5 增加 SQLite + FTS5：检索历史 run、tool result、assistant answer。
- Phase 6 再考虑 chunk、embedding、graph、summary tree。
- memory 注入必须有 token/字符上限，避免把历史全部塞进 prompt。

## Skills 与插件

OpenHuman 当前代码说明一个重要取舍：skills 可以先作为 metadata 和 prompt instruction 系统存在，不一定一开始执行代码。它的 `SKILL.md` discovery、frontmatter、`@skill` 显式触发、8KiB 注入上限很适合 MyClaw。

MyClaw 初期建议：

- Phase 0-3 不做 plugin runtime。
- Phase 3 可以允许 `--skill <name>` 或 `@skill` 只注入说明。
- Phase 5 再做 plugin manifest 和外部工具加载。
- skill 不等于 plugin：skill 改 prompt，plugin 暴露工具。

## UI、观测与运维

OpenHuman 的 React UI 给了 MyClaw 后续 Control UI 的方向：不要做欢迎页优先，而是把运行态直接呈现出来。`Intelligence` 页面按 memory、subconscious、tasks 等 tab 切分；`AppState` 聚合 daemon、auth、local AI、accessibility 状态。

MyClaw 后续 UI 推荐：

- 第一屏是 run timeline、approval queue、recent sessions、doctor status。
- 控制台不应该替代 CLI，只做可观察性和审批。
- 事件总线是 UI 的数据来源，不能让 UI 直接读内部 runner 状态。

## 不建议进入初期的内容

- Tauri 桌面壳。
- 语音、Meet、screen intelligence、accessibility automation。
- 118+ OAuth 集成。
- Subconscious 主动任务。
- Memory tree、topic/global digest。
- 多 agent 并行与复杂 subagent。
- 订阅、billing、团队、邀请、奖励系统。

## MyClaw 吸收顺序

| 顺序 | 吸收内容 | 阶段 |
|---|---|---|
| 1 | controller registry、统一 envelope、event bus | Phase 0-1 |
| 2 | tool descriptor、permission、audit、approval | Phase 2 |
| 3 | agent tool loop、transcript、context/result budget | Phase 3 |
| 4 | session search、light memory | Phase 3.5 |
| 5 | HTTP/WS gateway、schema discovery、event stream | Phase 4 |
| 6 | `SKILL.md` loader、plugin manifest | Phase 5 |
| 7 | memory tree、background jobs、Control UI | Phase 6+ |

## 验收标准

- 能明确说出 OpenHuman 每个能力对应 MyClaw 的哪个阶段。
- 初期方案没有引入 Tauri/Rust/桌面权限依赖。
- MyClaw 的 core API 不绑定 CLI 或 HTTP transport。
- Agent 调用工具必须经过 policy 和 approval。
- 记忆系统先服务 session search，不承诺完整个人知识库。
