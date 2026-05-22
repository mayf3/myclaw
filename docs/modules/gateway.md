# Gateway

## 诊断

Gateway 是 MyClaw 的控制平面。Phase 1.1 已把 gateway 主文件拆成 auth/http/routes，把 dashboard/gateway 的只读控制面 GET route 收敛到 `packages/control-plane/src/http-routes.mjs`，并新增 approval decision mutation。Feishu callback route 仍只依赖 MyClaw 自己的 `packages/feishu-adapter` facade。Gateway 仍然不能承担业务逻辑，也不能直接执行 OpenClaw apply。

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
  POST /messages
  POST /feishu/events
  POST /api/openclaw-migration/stage
  POST /api/approvals/:id/decision
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
- Feishu endpoint 支持 `MYCLAW_FEISHU_VERIFY_TOKEN`，正式暴露前必须配置。

后续再加：

- device pairing。
- trusted proxy。
- Tailscale/VPN profile。

## Gateway 不负责

- 不解析 workflow 语法。
- 不执行 tool。
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

Phase 4：

- HTTP + WS。
- token auth。
- run/resume/status。
- event stream。
- graceful shutdown。

先不做：

- 多账号 channel。
- 设备节点。
- Control UI config editor。
- public remote access。
- launchd/systemd。
- Feishu WebSocket mode。
- Feishu outbound rich card。
- 持久 replay window。

## 关键风险

- 过早把 gateway 做成 OpenClaw 级别控制平面。
- auth 作为后补，会导致 UI/channel 接入时重构。
- event 没有 seq，前端断线后无法判断丢事件。
- Feishu replay guard 目前是 adapter 内存 Map，服务重启后不保留 replay window。
- encrypted challenge 已支持，但 encrypted message event 的类型覆盖仍很窄。
- token 现在只是 shared secret，没有用户/角色/作用域。
- `/api/status` 虽有短 TTL cache，但仍会读取本地 OpenClaw source，后续要支持显式 refresh 和更强错误隔离。
- Human Experiments 当前是静态 payload，不能被当作自动验收结果。
- approval decision 只是 audit record，不是 authorization framework，也没有 scoped token。

## 验收标准

- `POST /messages` 返回与 CLI receive 一致的 envelope。
- `POST /feishu/events` 能回显 challenge，并把文本事件写入 `feishu-event` run。
- `POST /messages` 在配置 token 后拒绝无 token 请求。
- `POST /api/openclaw-migration/stage` 只写 snapshot，不修改 runtime config。
- `GET /api/status` 能显示最新 gateway message run。
- 配置 `feishuEncryptKey` 时，`POST /feishu/events` 必须校验 `x-lark-signature`。
- 配置 `feishuEncryptKey` 时，signed encrypted challenge 必须返回 challenge。
- `GET /api/runs/:runId` 能返回 envelope 和 events。
- `GET /api/experiments` 能返回 Phase 1.1 的 E0-E6 路线，并和 Dashboard 展示一致。
- `POST /api/approvals/:id/decision` 配置 token 后可记录 rejected/approved。
- `POST /runs` 返回 runId，WS 能收到完整 run 事件。
- token 错误时所有 mutation 请求被拒绝。
- Gateway 重启后能从 state store 读历史 run。
- CLI 可通过 gateway 执行同一 workflow。
