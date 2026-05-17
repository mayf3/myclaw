# Gateway

## 诊断

Gateway 是 MyClaw 的控制平面，不是第一阶段核心。它应该在 workflow core 稳定后加入，负责 HTTP/WS、auth、事件推送和本地 UI，而不是承担业务逻辑。

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

Phase 4 的最小 gateway：

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

Phase 0/1 先做非 HTTP 的 gateway 前置契约：

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
- auth: token。
- local-only 也保留 token 配置，但可允许 bootstrap 时生成。
- 非 loopback 禁止无 token。

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

## 关键风险

- 过早把 gateway 做成 OpenClaw 级别控制平面。
- auth 作为后补，会导致 UI/channel 接入时重构。
- event 没有 seq，前端断线后无法判断丢事件。

## 验收标准

- `POST /runs` 返回 runId，WS 能收到完整 run 事件。
- token 错误时所有 mutation 请求被拒绝。
- Gateway 重启后能从 state store 读历史 run。
- CLI 可通过 gateway 执行同一 workflow。
