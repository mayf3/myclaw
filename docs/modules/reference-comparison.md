# 参考项目对比

## 诊断

Hermes、OpenClaw、OpenHuman 都是成熟大系统，适合拆思想，不适合照搬结构。MyClaw 的起点应该更接近 OpenClaw `extensions/lobster` 的 run/resume/envelope，再吸收 OpenHuman 的 controller registry、event bus、tool permission 和 UI 状态边界，最后才逐步加入 Hermes/OpenHuman 的记忆与 agent 能力。

Phase 1.6 在 Human Experiments、共享 route adapter、migration approval queue、结构红线、Feishu WebSocket 群消息自动回复、Gateway mutation audit、Dashboard health strip、Gateway SSE snapshot 和 scoped token 之后，新增 safe tool approval smoke。每个阶段仍必须把 MyClaw 当前模块完成度和 OpenClaw、Hermes-agent、OpenHuman 放在同一张矩阵里看。

## Phase 1.6 完成度矩阵

| 模块 | MyClaw | OpenClaw | Hermes-agent | OpenHuman | 当前差距 |
|---|---:|---:|---:|---:|---|
| Gateway / 控制面 | 84 | 90 | 78 | 86 | 已拆 routes/auth、共享 read route adapter、approval decision mutation、mutation audit、SSE snapshot、scoped token 和 smoke tool request，仍缺 route schema、seq/replay 和 WebSocket |
| Feishu/Lark 接入 | 64 | 92 | 42 | 35 | 有 WebSocket app-token direct text、default-closed policy、replay 和 redaction，缺 rich card/agent replyBuilder |
| Dashboard / 观测 | 83 | 78 | 55 | 90 | 有 milestones/run detail/stage review/approval queue/tool request id/human experiments/health/audit/stream 状态，缺 review drawer 和 delta replay |
| OpenClaw 迁移 | 63 | 0 | 82 | 35 | 已有 plan/stage/review summary/approval，缺 apply/rollback/真实 schema diff |
| Agent Runtime | 14 | 76 | 92 | 90 | 有 approval-to-tool smoke，但还没有 agent turn、LLM tool loop、subagent、context budget |
| Memory / Search | 10 | 52 | 94 | 96 | 仅 JSON/JSONL state，没有 SQLite/FTS/long-term memory |
| Tools / Security | 44 | 88 | 74 | 84 | 有 migration approval seed、scoped gateway guard 和 safe tool approval smoke，缺通用 tool schema、policy snapshot、sandbox |
| Plugins / Skills | 26 | 92 | 88 | 78 | 有 Feishu plugin manifest 草案，但还没有通用 loader/skill loader |
| Engineering Guardrails | 100 | 80 | 70 | 75 | `npm run check` 已强制生成物新鲜度、文件行数、目录文件数、目录深度 |

## Hermes Agent 观察

可借鉴：

- 一个 agent loop 服务 CLI、gateway、ACP、cron、batch 多入口。
- SQLite + FTS5 存 session，适合长期检索和跨会话召回。
- memory + skills 形成使用后的学习闭环。
- tool registry 将工具 schema、handler、availability check 放在统一位置。
- prompt stability 明确，避免系统 prompt 中途频繁变化。

不建议照搬：

- 核心 `AIAgent` 和 CLI 文件过大，早期项目会很快变成难拆的大泥球。
- Python 插件和工具生态与用户要求的 Node.js 不一致。
- 终端后端、RL、trajectory、Batch runner 对 MyClaw v0 是噪声。
- 多渠道 gateway 在未验证核心体验前会拉高维护成本。

## OpenClaw 观察

可借鉴：

- Node.js/TypeScript、ESM、pnpm workspace 方向与 MyClaw 技术要求一致。
- 本地优先 gateway，默认 loopback，外部访问需要明确 auth/pairing。
- plugin manifest 先做 metadata/schema validation，再加载 runtime。
- tool policy 明确：工具是否暴露给模型由配置、provider、sandbox、channel 权限共同决定。
- session key 和路由模型区分 direct、group、cron、agent，后续多入口时很有价值。

不建议照搬：

- 127 个 extensions、完整 channel SDK、移动节点、Control UI、daemon 都不适合第一阶段。
- 插件 SDK 已经承担外部兼容，MyClaw 初期不应背这个承诺。
- OpenClaw 的安全文档非常成熟，但实现面很厚，MyClaw 应先做小而强的边界。

## OpenClaw Feishu/Lark 观察

OpenClaw 仓库里可参考的飞书实现位于 `$MYCLAW_OPENCLAW_SOURCE/extensions/feishu`，包名是 `@openclaw/feishu`。它覆盖 Feishu/Lark 两个域，manifest 中声明 `channels: ["feishu"]`，配置包含 `appId`、`appSecret`、`verificationToken`、`encryptKey`、`domain`、`connectionMode`、`accounts`、渲染、流式和 threading 选项。

可借鉴：

- webhook mode 必须要求 verification token 和 encrypt key。
- WebSocket/webhook 两种 connection mode 的配置边界。
- DM/group/mention access policy。
- message、card action、reaction、comment、media 的事件归一化。
- text/card/threading/send result 的 outbound 归一化。

不建议直接用：

- 插件依赖 `@openclaw/plugin-sdk` 和 OpenClaw runtime API。
- doc/drive/wiki/bitable 等工具面超出 MyClaw Phase 0。
- 直接加载会提前引入 OpenClaw 的 config、secret、approval 语义。

Phase 0.9 MyClaw 结论：

- 仍然只参考，不直接加载。
- `packages/feishu-adapter` 已承接 config readiness、x-lark signature、AES-256-CBC decrypt、verification token、replay guard、event normalize 和 outbound text/card facade。
- encrypted challenge 已可通过 gateway；encrypted message event 仍只是有解密入口，事件语义覆盖还很窄。
- outbound 已有 custom-bot webhook 契约和 app-token direct text；ingress 已默认封闭，下一阶段要补 rich card API 和 agent replyBuilder。

Phase 1.0 MyClaw 结论：

- OpenClaw Feishu/Lark 仍只参考，不直接加载。
- 迁移实验 E4 明确要求 `forReviewOnly=true`，避免把 dry-run stage 误当 apply。
- Dashboard 上的 E0-E6 是人类验收路线，不是自动化完成度计算；后续需要把这些实验和 test/check 结果绑定。

Phase 1.1 MyClaw 结论：

- approval queue 已进入 state/API/Dashboard，但只适合作为 review record。
- approval decision 需要配置 gateway token，不能靠 loopback 免 token。
- OpenClaw stage review summary 不等于字段级 schema diff；下一阶段再做真实 source/target diff。

Phase 1.3 MyClaw 结论：

- Feishu 接入从 credential presence 进入真实群消息回复，默认直接发群消息而不是话题回复；已补 default-closed local policy、persistent replay 和 read redaction，但仍只是文本自动回复，不是完整 OpenClaw Feishu 插件。
- `packages/feishu-bot` 把 Feishu SDK 隔离成插件包，主线 core/runtime/gateway 仍保持干净。
- 下一步不应把飞书群直接接到可执行工具的 agent，而应先补 Gateway audit、agent replyBuilder 边界和 rich card。

Phase 1.4 MyClaw 结论：

- Gateway mutation audit 已落地，写操作会记录 action、状态码、actor 类型和资源类型，但不保存请求正文或 token。
- Dashboard health strip 已落地，用户能从第一屏判断 Control API、state、HTML Center、Feishu adapter 和 mutation auth 是否健康。
- 下一步应补 event stream、scoped token 和 review drawer，然后再进入 Agent runtime skeleton。

Phase 1.5 MyClaw 结论：

- Gateway SSE 已落地，但当前是 snapshot/heartbeat 驱动 Dashboard 自动刷新，还不是带 seq/replay 的真实增量事件总线。
- Gateway scoped token 已落地，非 loopback 控制面 GET 不再裸露；`events:read` 和 `control:read` 已分开。
- 下一步应补 approval-to-tool、route schema、event seq/replay，并拆 Dashboard renderer。

Phase 1.6 MyClaw 结论：

- approval-to-tool 已用 safe smoke note 跑通：tool request 先生成 approval，approved 后才写本地 `tool-runs/...`，rejected 不执行。
- Gateway 只暴露 request/decision/status 边界，真正的 tool side effect 被限制在 `packages/tools`。
- 下一步应把 smoke tool 抽象成通用 ToolDescriptor、policy snapshot 和 sandbox dispatch，再进入单 agent tool loop。

- 结构红线和生成 HTML 新鲜度已经进入 `npm run check`，不再只靠文档提醒。
- `docs/modules` 只保留源 Markdown，生成 HTML 已移到 `docs/rendered/modules`。
- 旧 HTML Center 链接打不开的根因是 4177 服务未运行，已恢复 tmux 常驻，并补了 `scripts/html-center.mjs`、`myclaw doctor` 和 `publish:review`。

## OpenClaw Lobster 观察

可直接吸收的核心：

- `run` / `resume` 双动作。
- typed JSON envelope。
- `needs_approval` 状态。
- `resumeToken` / `approvalId` 恢复。
- cwd 必须留在 gateway 工作目录内。
- timeout 和 stdout/stderr cap。
- workflow file 与 pipeline string 两种入口。

需要重新设计的地方：

- 不要一开始依赖 OpenClaw plugin runtime。
- 不要把 Lobster 当外部黑盒；MyClaw 应把 workflow core 变成自己的主内核。
- approval 不应只是工具返回值，还要进入 state store，方便 CLI/gateway/UI 查询。

## OpenHuman 观察

可借鉴：

- `src/core/all.rs` 的 controller registry：业务 controller 和 transport 分离，后续 CLI、HTTP、UI 可以复用同一套 handler。
- `src/core/event_bus/` 的 DomainEvent：agent、memory、channel、cron、tool、skill 都通过统一事件面通信。
- `src/openhuman/tools/traits.rs` 的工具协议：ToolSpec、permission、scope、category、结果预算都在工具定义里。
- `src/openhuman/agent/` 的 agent harness：agent turn、tool loop、subagent runner、memory loader 分层清楚。
- `src/openhuman/skills/` 的 `SKILL.md` 发现和注入：skill 可以先作为 prompt workflow，不急着执行代码。
- `src/openhuman/memory/` 的分层：conversation JSONL、UnifiedMemory、memory tree 清楚区分轻重层。

不建议照搬：

- Rust/Tauri 桌面壳、CEF、screen intelligence、accessibility、voice、Meet、subconscious 都太重。
- 118+ OAuth 集成和 Composio 周期同步不适合 MyClaw 初期。
- memory tree、topic/global digest、entity graph 在还没有稳定 workflow/agent 前是过早复杂化。
- OpenHuman 产品范围已经是个人 AI super assistant，MyClaw 初期应更窄：本地工作流与安全 agent 内核。

## MyClaw 取舍

第一阶段吸收顺序：

1. Lobster 的 envelope 和 approval/resume。
2. OpenHuman 的 controller registry 和 event bus。
3. OpenClaw/OpenHuman 的工具权限、安全和 gateway 边界。
4. Hermes 的 session search、memory、skills。
5. OpenClaw/OpenHuman 的插件、Control UI、长期记忆。

## 关键风险

- 一开始做成“大平台”，会拖慢核心闭环。
- 一开始只做“命令执行器”，后续 agent 接入会重构成本高。
- 没有统一 envelope，CLI、gateway、agent、UI 会各自发明结果格式。

## 验收标准

- 所有模块都以统一 envelope 为核心通信格式。
- 第一阶段不依赖参考项目代码。
- 每个后续能力都能回答：它接入哪个 core API、写入哪个 state、暴露给哪个 access layer。
