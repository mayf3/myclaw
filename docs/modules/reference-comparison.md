# 参考项目对比

## 诊断

Hermes、OpenClaw、OpenHuman 都是成熟大系统，适合拆思想，不适合照搬结构。MyClaw 的起点应该更接近 OpenClaw `extensions/lobster` 的 run/resume/envelope，再吸收 OpenHuman 的 controller registry、event bus、tool permission 和 UI 状态边界，最后才逐步加入 Hermes/OpenHuman 的记忆与 agent 能力。

Phase 0.9 在 Feishu adapter facade 上补了 outbound text/card payload 和 send result normalization，同时让 dashboard 能展示 milestones。每个阶段仍必须把 MyClaw 当前模块完成度和 OpenClaw、Hermes-agent、OpenHuman 放在同一张矩阵里看。

## Phase 0.9 完成度矩阵

| 模块 | MyClaw | OpenClaw | Hermes-agent | OpenHuman | 当前差距 |
|---|---:|---:|---:|---:|---|
| Gateway / 控制面 | 60 | 90 | 78 | 86 | 已拆 routes/auth，仍缺 WS/SSE、scoped token |
| Feishu/Lark 接入 | 58 | 92 | 42 | 35 | 有 encrypted challenge/custom-bot outbound facade，缺 WebSocket/policy/app token |
| Dashboard / 观测 | 60 | 78 | 55 | 90 | 有 milestones/run detail/stage summary，缺 approval queue、实时事件 |
| OpenClaw 迁移 | 55 | 0 | 82 | 35 | 已有 plan/stage/review summary，缺 apply/rollback/字段级 diff UI |
| Agent Runtime | 8 | 76 | 92 | 90 | 还没有 agent turn、tool loop、subagent、context budget |
| Memory / Search | 10 | 52 | 94 | 96 | 仅 JSON/JSONL state，没有 SQLite/FTS/long-term memory |
| Tools / Security | 22 | 88 | 74 | 84 | 缺 tool schema、approval queue、policy snapshot、sandbox |
| Plugins / Skills | 18 | 92 | 88 | 78 | 仅 channel registry，没有 plugin manifest/skill loader |

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

OpenClaw 仓库里可参考的飞书实现位于 `/Users/yanfenma/workspace/github/openclaw/extensions/feishu`，包名是 `@openclaw/feishu`。它覆盖 Feishu/Lark 两个域，manifest 中声明 `channels: ["feishu"]`，配置包含 `appId`、`appSecret`、`verificationToken`、`encryptKey`、`domain`、`connectionMode`、`accounts`、渲染、流式和 threading 选项。

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
- outbound 当前仍是 custom-bot webhook 契约，不是 app-token rich card API；下一阶段要补 policy、app token client 和持久 replay。

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
