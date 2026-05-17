# MyClaw 阶段状态

更新时间：2026-05-17

## 当前阶段

Phase 0.4: Feishu Event Ingress + Visual Design Review Dashboard。

这一步把 Feishu/Lark 事件回调接到 gateway，并把 design review skill 和报告生成器升级为 Mermaid 可视化 dashboard。现在 CLI、通用 HTTP message、Feishu event callback、dashboard 状态读取都复用同一套 runtime/message/state 边界。

## 已完成

- 初始化 git 仓库，基线 commit：`0d15020 chore: publish phase 0.2 dashboard baseline`。
- 创建并推送 public GitHub 仓库：`https://github.com/mayf3/myclaw`。
- 新增 `packages/runtime`：把 `send/receive/reply` 从 CLI 抽成共享 runtime。
- 新增 `packages/control-plane`：dashboard 和 gateway 共用 status/runs/events/migration 聚合层。
- 新增 `packages/gateway`：本地 HTTP gateway。
  - `GET /`：复用 dashboard HTML。
  - `GET /api/health`：gateway health。
  - `GET /api/status`：state、runs、events、channels、OpenClaw migration plan。
  - `POST /messages` / `POST /api/messages`：接收 inbound message，复用 runtime `receiveMessage`。
- `myclaw dashboard` 现在启动 gateway-backed dashboard；`myclaw gateway` 作为显式控制面命令保留。
- 新增 `scripts/check-file-lines.mjs`：`npm run check` 强制单文件不超过 500 行，450 行开始预警。
- 修复当前超限文件：`docs/build-review-html.mjs` 从 523 行降到 398 行，`docs/index.html` 从 610 行降到 321 行。
- 新增测试覆盖 runtime message pipeline 和 gateway ingress。
- 新增 `feishu-event` channel adapter：负责 Feishu/Lark event text、sender、chat id、message id normalize。
- 新增 gateway `POST /feishu/events` / `POST /api/feishu/events`：支持 challenge 回显、文本事件入站、event id 幂等。
- `docs/build-review-html.mjs` 支持 Mermaid 代码块渲染，阶段架构报告升级为可视化 design review dashboard。
- 更新 `web-design-review` skill：硬性要求系统上下文图、模块架构图、流程图、时序图、状态机、ER、数据流、部署图、风险分级、目录/行数/文件评价。

## 当前可用命令

```bash
npm run myclaw -- doctor
npm run myclaw -- channels
npm run myclaw -- send --text "hello"
npm run myclaw -- receive --from local-user --conversation local-thread --text "hello" --reply "received" --json
npm run myclaw -- dashboard --port 4321 --openclaw-source /Users/yanfenma/workspace/github/openclaw
npm run myclaw -- gateway --port 4321 --openclaw-source /Users/yanfenma/workspace/github/openclaw
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --json
```

Gateway message ingress：

```bash
curl -sS http://127.0.0.1:4321/messages \
  -H 'content-type: application/json' \
  -d '{"channel":"console","from":"ou_user","conversation":"oc_group","text":"hello","reply":"received"}'
```

Feishu event ingress：

```bash
curl -sS http://127.0.0.1:4321/feishu/events \
  -H 'content-type: application/json' \
  -d '{"challenge":"plain_challenge"}'

curl -sS http://127.0.0.1:4321/api/feishu/events \
  -H 'content-type: application/json' \
  -d '{"header":{"event_id":"evt_1"},"event":{"sender":{"sender_id":{"open_id":"ou_user"}},"message":{"message_id":"om_1","chat_id":"oc_group","content":"{\"text\":\"hello from feishu\"}"}}}'
```

飞书自定义机器人 webhook 的最小 outbound 形态：

```bash
MYCLAW_FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/..." \
  npm run myclaw -- send --channel feishu-webhook --text "hello from MyClaw"
```

这仍然不是完整 OpenClaw Feishu/Lark 插件接入。现在只是补齐后续接 `openclaw-lark` GitHub 插件前必须稳定的 HTTP inbound 和 normalize 边界。

## 当前实现架构

```text
CLI send/receive
  -> packages/runtime
  -> packages/channels
  -> packages/core state

HTTP POST /messages
  -> packages/gateway
  -> packages/runtime.receiveMessage
  -> packages/channels.normalizeInbound/send reply
  -> packages/core state

HTTP POST /feishu/events
  -> packages/gateway challenge/idempotency
  -> packages/runtime.receiveMessage(rawInbound)
  -> packages/channels feishu-event.normalizeInbound
  -> packages/core state

Dashboard GET /api/status
  -> packages/gateway
  -> packages/dashboard
  -> state + channels + OpenClaw migration plan
```

## OpenClaw 一键迁移路线

当前仍处在 `plan` 阶段，但 now gateway 已经提供后续 `stage/apply` 需要的控制面：

1. `plan`：读取 OpenClaw config 和插件清单，生成 reviewable migration plan。
2. `stage`：把可安全映射的内容写入 MyClaw migration snapshot，不启用运行时。
3. `apply --module feishu`：通过 gateway/dashboard 确认后，只启用 Feishu adapter。

必须保留这个顺序。直接从 OpenClaw 全量 runtime apply 到 MyClaw 会把 Feishu、tools、memory、secrets、provider、browser 自动化等高风险面混在一起，难以回滚。

## 下一步

1. 为 gateway 增加 loopback token / mutation guard，避免后续绑定非本机时暴露入口。
2. 增加 Feishu 签名校验、encrypt payload 解密和 replay window。
3. 在 dashboard 增加 run detail drawer 和 message form，用 UI 直接发送本地测试消息。
4. 把 `migrate openclaw --output` 生成的 plan 文件展示在 dashboard，并开始 `stage` snapshot 设计。
5. 把 `openclaw-lark` 插件接在 `feishu-event`/`feishu-webhook` 边界后面，不直接穿透 gateway。
6. 每个阶段继续：更新 HTML design review report、执行 Linus 视角独立审查、commit、push 到 GitHub、发布到 HTML Center。

## 风险

- 当前 gateway 仅适合本机开发，尚无 token auth；不要绑定公网地址。
- `POST /feishu/events` 已支持 challenge 和 event id 幂等，但尚未校验 Feishu 签名、encrypt payload 或 token。
- dashboard HTML 仍以内联字符串维护，后续复杂交互需要拆 view template 和 client script。
- OpenClaw migration 目前是 dry-run，不会直接迁移 secrets、tool permissions、sessions、memory DB。
- OpenClaw Feishu 插件依赖 `openclaw/plugin-sdk` runtime，不是单文件 SDK；直接接入可能需要适配一层 runtime facade。

## 验证记录

```bash
npm run check
npm test
npm run myclaw -- receive --channel console --from ou_user --conversation oc_group --text hi --reply 收到 --json
curl -sS http://127.0.0.1:4321/feishu/events -H 'content-type: application/json' -d '{"challenge":"plain_challenge"}'
```

结果：

- 语法检查通过。
- 单文件行数检查通过：当前最大文件低于 500 行。
- Node test 通过：新增 Feishu event 相关测试。
- CLI receive/reply 通过共享 runtime 返回 `ok` envelope。
- gateway 测试验证 `GET /api/health`、`POST /messages`、`POST /feishu/events`、`GET /api/status`。
- Phase 0.4 完成后会形成独立 commit 并继续 push 到 GitHub public 仓库。
