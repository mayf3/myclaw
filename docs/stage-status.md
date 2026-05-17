# MyClaw 阶段状态

更新时间：2026-05-17

## 当前阶段

Phase 0.5: Gateway Mutation Guard + OpenClaw Stage Snapshot。

这一步补上 gateway mutation guard，并把 OpenClaw 迁移从纯 `plan` 推进到可落盘的 `stage snapshot`。现在 MyClaw 可以在本地审阅 OpenClaw 迁移快照，同时通用 mutation 支持 token guard，Feishu endpoint 支持 verify token 和 encrypt callback 拒绝路径。

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
- `myclaw dashboard` 现在启动只读 dashboard server；`myclaw gateway` 作为显式 mutation/control 命令保留。
- 新增 `scripts/check-file-lines.mjs`：`npm run check` 强制单文件不超过 500 行，450 行开始预警。
- 修复当前超限文件：`docs/build-review-html.mjs` 从 523 行降到 398 行，`docs/index.html` 从 610 行降到 321 行。
- 新增测试覆盖 runtime message pipeline 和 gateway ingress。
- 新增 `feishu-event` channel adapter：负责 Feishu/Lark event text、sender、chat id、message id normalize。
- 新增 gateway `POST /feishu/events` / `POST /api/feishu/events`：支持 challenge 回显、文本事件入站、event id 幂等。
- `docs/build-review-html.mjs` 支持 Mermaid 代码块渲染，阶段架构报告升级为可视化 design review dashboard。
- 更新 `web-design-review` skill：硬性要求系统上下文图、模块架构图、流程图、时序图、状态机、ER、数据流、部署图、风险分级、目录/行数/文件评价。
- 新增 gateway mutation guard：`MYCLAW_GATEWAY_TOKEN` / `--token` / `Authorization: Bearer` / `x-myclaw-token`。
- Feishu endpoint 增加 verify token 边界：`MYCLAW_FEISHU_VERIFY_TOKEN`，并明确拒绝 `encrypt` payload。
- 新增 `packages/migrate/src/stage.mjs`：写入 OpenClaw migration stage snapshot 与 latest 指针。
- `myclaw dashboard` 默认回到只读 dashboard server；mutation endpoints 只在显式 `myclaw gateway` 中打开。
- OpenClaw stage snapshot 增加 `schemaVersion`、`checksum` 和临时文件 rename 原子写。
- `/api/status` 增加 OpenClaw plan 短 TTL cache 和错误隔离，HTTP route 不再接受 `source` query override。
- 新增 CLI：`myclaw migrate openclaw --stage`。
- 新增 API：`POST /api/openclaw-migration/stage`，只写 snapshot，不 apply runtime。

## 当前可用命令

```bash
npm run myclaw -- doctor
npm run myclaw -- channels
npm run myclaw -- send --text "hello"
npm run myclaw -- receive --from local-user --conversation local-thread --text "hello" --reply "received" --json
npm run myclaw -- dashboard --port 4321 --openclaw-source /Users/yanfenma/workspace/github/openclaw
npm run myclaw -- gateway --port 4321 --openclaw-source /Users/yanfenma/workspace/github/openclaw
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --json
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --stage --json
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

Gateway mutation token：

```bash
MYCLAW_GATEWAY_TOKEN=dev-token npm run myclaw -- gateway --port 4321

curl -sS http://127.0.0.1:4321/messages \
  -H 'content-type: application/json' \
  -H 'x-myclaw-token: dev-token' \
  -d '{"text":"hello guarded"}'
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
  -> token/encrypt guard
  -> packages/runtime.receiveMessage(rawInbound)
  -> packages/channels feishu-event.normalizeInbound
  -> packages/core state

HTTP POST /api/openclaw-migration/stage
  -> packages/gateway mutation token guard
  -> packages/migrate.stageOpenClawMigration
  -> state/migrations/openclaw/<stageId>.json
  -> state/migrations/openclaw/latest.json

Dashboard GET /api/status
  -> packages/gateway
  -> packages/dashboard
  -> state + channels + OpenClaw migration plan
```

## OpenClaw 一键迁移路线

当前已经进入 `stage` 阶段，但仍然不做 apply：

1. `plan`：读取 OpenClaw config 和插件清单，生成 reviewable migration plan。
2. `stage`：把可安全映射的内容写入 MyClaw migration snapshot，不启用运行时。Phase 0.5 已完成。
3. `apply --module feishu`：通过 gateway/dashboard 确认后，只启用 Feishu adapter。

必须保留这个顺序。直接从 OpenClaw 全量 runtime apply 到 MyClaw 会把 Feishu、tools、memory、secrets、provider、browser 自动化等高风险面混在一起，难以回滚。

## 下一步

1. 增加 Feishu 签名校验、encrypt payload 解密和 replay window 持久化。
2. 在 dashboard 增加 run detail drawer、message form 和 stage snapshot 详情。
3. 把 `openclaw-lark` 插件接在 `feishu-event`/`feishu-webhook` 边界后面，不直接穿透 gateway。
4. 实现 `apply --module feishu` 和 rollback，只允许从 staged snapshot apply。
5. 每个阶段继续：更新 HTML design review report、执行 Linus 视角独立审查、commit、push 到 GitHub、发布到 HTML Center。

## 风险

- 当前 gateway 已有 mutation token guard，但 Feishu 正式签名、encrypt payload 解密和持久 replay window 仍未实现。
- `POST /feishu/events` 已支持 challenge、event id 幂等和 verify token，但还不能接加密回调。
- dashboard HTML 仍以内联字符串维护，后续复杂交互需要拆 view template 和 client script。
- OpenClaw migration 目前是 dry-run，不会直接迁移 secrets、tool permissions、sessions、memory DB。
- OpenClaw Feishu 插件依赖 `openclaw/plugin-sdk` runtime，不是单文件 SDK；直接接入可能需要适配一层 runtime facade。

## 验证记录

```bash
npm run check
npm test
npm run myclaw -- receive --channel console --from ou_user --conversation oc_group --text hi --reply 收到 --json
curl -sS http://127.0.0.1:4321/feishu/events -H 'content-type: application/json' -d '{"challenge":"plain_challenge"}'
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --stage --json
```

结果：

- 语法检查通过。
- 单文件行数检查通过：当前最大文件低于 500 行。
- Node test 通过：新增 Feishu event 相关测试。
- CLI receive/reply 通过共享 runtime 返回 `ok` envelope。
- gateway 测试验证 `GET /api/health`、`POST /messages`、`POST /feishu/events`、`GET /api/status`。
- gateway 测试验证 token guard、Feishu verify token、encrypt callback 拒绝、OpenClaw stage API。
- Phase 0.5 完成后会形成独立 commit 并继续 push 到 GitHub public 仓库。
