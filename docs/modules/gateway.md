# Gateway

## 诊断

Gateway 是 MyClaw 的控制平面。Phase 1.6 已把 Feishu WebSocket 群消息自动回复放进独立 `packages/feishu-bot` 插件包，并给 Gateway 写操作补上 mutation audit、SSE snapshot、scoped token 和 safe tool request 入口。Gateway 仍只负责 HTTP 控制面、鉴权、状态和 mutation 边界，不能承担业务逻辑，也不能直接执行 OpenClaw apply。

## 参考项目观察

OpenClaw gateway 的核心设计值得借鉴：

- 单个长生命周期 gateway。
- 默认绑定 `127.0.0.1`。
- WebSocket 使用 connect handshake。
- request/response/event 三类消息。
- side-effecting request 使用 idempotency key。
- local trust 和 remote trust 分开。
- gateway 负责 session、routing、channel、event、health。

Hermes gateway 的价值在于多平台消息统一进入 agent，并有 session source/context prompt。

OpenHuman 的 gateway/RPC 价值在于边界拆分：

- `src/core/all.rs` 先聚合 controller registry。
- `src/core/jsonrpc.rs` 只处理 JSON-RPC、health、schema discovery、错误 envelope 和实时流。
- 业务 controller 不依赖 HTTP transport。

这说明 MyClaw 不应该一开始就写 gateway handler，而应该先写 controller registry，等 CLI 跑通后再挂到 HTTP/WS。

## 推荐设计

Phase 0.8 当前已实现的最小 gateway：

```text
HTTP
  GET  /
  GET  /api/health
  GET  /api/status
  GET  /api/runs/:runId
  GET  /api/milestones
  GET  /api/experiments
  GET  /api/approvals
  GET  /api/tool-requests
  POST /messages
  POST /feishu/events
  POST /api/openclaw-migration/stage
  POST /api/approvals/:id/decision
  POST /api/tool-requests/smoke-note
```

它只做 message ingress、Feishu event normalize 和 dashboard 状态读取，尚未做 workflow run/resume。

Feishu event 路径必须保持薄：

```text
POST /feishu/events
  -> routes/feishu.mjs
  -> Feishu adapter x-lark signature / verify token / local dev guard
  -> decrypt encrypted envelope when encryptKey is configured
  -> challenge response or event id replay guard
  -> runtime.receiveMessage(rawInbound)
  -> feishu-event channel normalize
  -> state envelope
```

OpenClaw stage 路径：

```text
POST /api/openclaw-migration/stage
  -> gateway mutation token guard
  -> stageOpenClawMigration
  -> state/migrations/openclaw/<stageId>.json
  -> latest.json pointer
```

Tool approval smoke 路径：

```text
POST /api/tool-requests/smoke-note
  -> gateway mutation token guard with tool:request
  -> tools/smoke-note create pending approval
  -> state/tool-requests/<toolRequestId>.json
  -> user approves or rejects /api/approvals/:id/decision
  -> approved writes state/tool-runs/<toolRunId>.json
```

Phase 4 的完整 gateway：

```text
HTTP
  GET  /health
  GET  /runs
  GET  /runs/:id
  POST /runs
  POST /runs/:id/resume

WebSocket
  connect
  event:run.started
  event:run.step
  event:run.approval
  event:run.completed
  event:run.failed
```

Phase 0/1 继续补非 HTTP 的 gateway 前置契约：

```text
ControllerDefinition
  namespace
  method
  paramsSchema
  permission
  handler

EventBus
  run.started
  step.started
  tool.started
  approval.required
  run.completed
```

协议形状：

```ts
type GatewayFrame =
  | { type: "req"; id: string; method: string; params?: unknown }
  | { type: "res"; id: string; ok: boolean; payload?: unknown; error?: GatewayError }
  | { type: "event"; event: string; payload: unknown; seq?: number };
```

## Auth 与默认安全

默认：

- bind: `127.0.0.1`。
- auth: local loopback 可无 token；配置 `MYCLAW_GATEWAY_TOKEN` 或 `--token` 后所有 mutation 必须带 token。
- 非 loopback mutation 禁止无 token。
- token 支持 `Authorization: Bearer <token>` 和 `x-myclaw-token`。
- tool request mutation 需要 legacy `mutation` 或更窄的 `tool:request` scope。
- Feishu endpoint 支持 `MYCLAW_FEISHU_VERIFY_TOKEN`，正式暴露前必须配置。

后续再加：

- device pairing。
- trusted proxy。
- Tailscale/VPN profile。

## Gateway 不负责

- 不解析 workflow 语法。
- 不直接执行通用 tool；Phase 1.6 只触发 safe smoke tool 的 approval-to-effect bridge。
- 不决定 approval policy。
- 不直接写 plugin runtime 逻辑。

Gateway 只调用 core/agent API，并转发事件。

## 模块依赖

输入依赖：

- `workflow-core` 的 run/resume/status。
- `core` 的 controller registry 和 event bus。
- `config-state-storage` 的 config/auth/state。
- `tools-approval-security` 的 policy snapshot。

输出依赖：

- `ui-control-observability` 使用 gateway API。
- `access-layer` 的 CLI remote mode 使用 gateway API。
- 未来 channel adapters 走 gateway API。

## MVP 边界

Phase 0.3：

- 本机 HTTP gateway。
- Dashboard GET routes。
- `POST /messages` 复用 runtime receive pipeline。
- 写入统一 envelope/state。

Phase 0.4：

- `POST /feishu/events` / `POST /api/feishu/events`。
- Feishu challenge 回显。
- Feishu 文本消息事件 normalize。
- event id 内存幂等，避免本机测试重复写入。
- Mermaid 可视化 design review report。

Phase 0.5：

- Gateway mutation token guard。
- Feishu verify token 与 encrypted callback 拒绝路径。
- OpenClaw stage snapshot API。
- Dashboard `/api/status` 展示 latest stage 指针。
- `myclaw dashboard` 使用只读 dashboard server；mutation endpoints 只在显式 gateway 打开。
- OpenClaw migration GET route 不再接受任意 `source` query override。

Phase 0.7：

- `packages/gateway/src/index.mjs` 从 321 行拆到 90 行。
- 新增 `auth.mjs`、`http.mjs`、`routes/control.mjs`、`routes/feishu.mjs`、`routes/messages.mjs`、`routes/migration.mjs`。
- Feishu callback route 调用 `packages/feishu-adapter`，不再在 gateway 主文件里维护签名、token、replay 和 normalize。
- `--feishu-encrypt-key` / `MYCLAW_FEISHU_ENCRYPT_KEY` 可启用 `x-lark-signature` 校验。

Phase 0.8：

- `POST /feishu/events` 支持 Feishu/Lark encrypted challenge decrypt。
- 处理顺序固定为 signature -> parse envelope -> decrypt -> token/challenge/event。
- `GET /api/runs/:runId` 读取单个 run 的 envelope 和 JSONL events。
- `/api/status` 返回 `openclawStageSummary`，供 dashboard 显示 review-only stage 摘要。

Phase 0.9：

- `GET /api/milestones` 暴露当前 M0-M5 进度。
- `/api/status` 内联 `milestones`，Dashboard 首屏可以看到阶段进展。
- Feishu outbound payload/result 已进入 adapter facade；gateway 仍不直接加载 OpenClaw plugin。

Phase 1.0：

- `GET /api/experiments` 暴露 E0-E6 人类实验路线。
- `/api/status` 内联 `experiments`，Dashboard 可以把阶段路线转成可亲测实验。
- Gateway 与 Dashboard 共用 `resolveControlGetRoute`，只读控制面 API 不再复制 if 链。

Phase 1.1：

- `GET /api/approvals` 暴露审批队列。
- `POST /api/approvals/:id/decision` 记录 approved/rejected，仍受 mutation token guard 保护。
- OpenClaw migration stage 自动生成 pending approval，但 decision 不触发 apply。

Phase 1.3：

- `npm run check` 会阻止目录文件数超过 20、目录深度超过 4、文件超过 500 行。
- `npm run check` 会重建 HTML 并在生成物 stale、缺失或多余时失败。

Phase 1.6：

- `POST /api/tool-requests/smoke-note` 生成 safe local tool request 和 `tool-action` approval。
- `GET /api/tool-requests` 读取 pending/completed/rejected 工具请求。
- approval decision 触发 smoke tool settlement：approved 写本地相对 artifact，rejected 不执行。
- `myclaw doctor` 会报告 HTML Center health，避免报告链接坏了却没人知道。
- 生成的模块 HTML 从 `docs/modules` 移到 `docs/rendered/modules`，避免源文档目录超过 20 个文件。
- `packages/feishu-bot` 在 Gateway 外独立持有 Feishu SDK、default-closed policy 和 persistent replay。
- Gateway/control-plane read API 对 Feishu run 做脱敏，避免 Dashboard 暴露正文、chat_id、sender_id。

Phase 1.4：

- Gateway 对 `/messages`、`/api/openclaw-migration/stage`、approval decision 和 Feishu callback 写 mutation audit。
- Audit 记录 action、method、path、status、elapsedMs、actor 类型和 resource 类型，不保存 request body、token 或 secret。
- Control-plane 新增 `GET /api/audit`，`GET /api/status` 内联最近 audit。
- Dashboard 顶部 health strip 展示 Control API、state、HTML Center、Feishu adapter 和 mutation auth。

Phase 1.5：

- `GET /api/events/stream` 返回 SSE snapshot 和 heartbeat，snapshot 包含脱敏 events 与 audit。
- Gateway 非 loopback 控制面 GET 统一走 read auth；`/api/health` 仍可公开探活。
- `MYCLAW_GATEWAY_SCOPED_TOKENS` 支持 JSON 数组，形如 `{ "token": "...", "scopes": ["events:read"] }`。
- scope 使用 any-scope 语义：`mutation` 可覆盖 mutation route，`read` 可覆盖 read route；细分 scope 如 `message:write`、`events:read`、`control:read` 用于最小授权。
- legacy `MYCLAW_GATEWAY_TOKEN` 仍等价于 `*`，只建议本地开发或明确受保护网络使用。

Phase 4：

- HTTP + WS。
- token auth。
- run/resume/status。
- event stream seq/replay。
- graceful shutdown。

先不做：

- 多账号 channel。
- 设备节点。
- Control UI config editor。
- public remote access。
- launchd/systemd。
- Feishu outbound rich card。
- Feishu agent replyBuilder。

## 关键风险

- 过早把 gateway 做成 OpenClaw 级别控制平面。
- auth 作为后补，会导致 UI/channel 接入时重构。
- event 没有 seq，前端断线后无法判断丢事件。
- Feishu webhook replay guard 目前仍是 adapter 内存 Map；WebSocket bot 已有 persistent replay，callback 路径后续也要统一。
- encrypted challenge 已支持，但 encrypted message event 的类型覆盖仍很窄。
- scoped token 已有最小实现，但还不是用户/角色/租户权限系统。
- `/api/status` 虽有短 TTL cache，但仍会读取本地 OpenClaw source，后续要支持显式 refresh 和更强错误隔离。
- Human Experiments 当前是静态 payload，不能被当作自动验收结果；但已按 L0-L6 分层暴露测试路线。
- approval decision 现在可触发 safe smoke tool settlement，但还不是完整 authorization framework。

## 验收标准

- `POST /messages` 返回与 CLI receive 一致的 envelope。
- `POST /feishu/events` 能回显 challenge，并把文本事件写入 `feishu-event` run。
- `POST /messages` 在配置 token 后拒绝无 token 请求。
- `POST /api/openclaw-migration/stage` 只写 snapshot，不修改 runtime config。
- `GET /api/status` 能显示最新 gateway message run。
- 配置 `feishuEncryptKey` 时，`POST /feishu/events` 必须校验 `x-lark-signature`。
- 配置 `feishuEncryptKey` 时，signed encrypted challenge 必须返回 challenge。
- `GET /api/runs/:runId` 能返回 envelope 和 events。
- `GET /api/experiments` 能返回 Phase 1.6 的 L0-L6、E0-E10/E5B 路线，并和 Dashboard 展示一致。
- `GET /api/audit` 能返回最近 mutation audit，且不包含请求正文或 token 值。
- `GET /api/events/stream` 能返回脱敏 snapshot；非 loopback 时必须有 `events:read` 或 `read` scope。
- 非 loopback 的 `/api/status`、`/api/events`、`/api/audit`、`/api/approvals`、Dashboard HTML 都必须有 `control:read` 或 `read` scope。
- `POST /api/approvals/:id/decision` 配置 token 后可记录 rejected/approved。
- `POST /api/tool-requests/smoke-note` 配置 token 后生成 pending approval，approved 才写 `tool-runs/...`。
- `GET /api/tool-requests` 能返回 pending/completed/rejected，且 artifact 不暴露绝对路径。
- `POST /runs` 返回 runId，WS 能收到完整 run 事件。
- token 错误时所有 mutation 请求被拒绝。
- Gateway 重启后能从 state store 读历史 run。
- CLI 可通过 gateway 执行同一 workflow。
