# MyClaw 阶段状态

更新时间：2026-05-17

## 当前阶段

Phase 0.3: Gateway Message Ingress + GitHub Public Baseline。

这一步完成两件事：第一，把 Phase 0.2 作为 git 基线提交并推送到 public GitHub 仓库；第二，把 dashboard 和 gateway 控制面合并出最小 `POST /messages` 入口。现在 CLI、dashboard/gateway HTTP 和后续 Feishu event adapter 可以复用同一套 runtime message pipeline。

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

飞书自定义机器人 webhook 的最小 outbound 形态：

```bash
MYCLAW_FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/..." \
  npm run myclaw -- send --channel feishu-webhook --text "hello from MyClaw"
```

这仍然不是完整 OpenClaw Feishu/Lark 插件接入。现在只是补齐 Feishu event adapter 之前必须有的 HTTP inbound 控制面。

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

1. 为 `POST /messages` 增加 Feishu event shape normalize：challenge、event text、sender、chat id。
2. 新增 `packages/channels` 的 `feishu-event` adapter，与 `feishu-webhook` outbound 区分。
3. 为 gateway 增加 loopback token / mutation guard，避免后续绑定非本机时暴露入口。
4. 在 dashboard 增加 run detail drawer 和 message form，用 UI 直接发送本地测试消息。
5. 把 `migrate openclaw --output` 生成的 plan 文件展示在 dashboard，并开始 `stage` snapshot 设计。
6. 每个阶段继续：更新 HTML design review report、执行 Linus 视角独立审查、commit、push 到 GitHub、发布到 HTML Center。

## 风险

- 当前 gateway 仅适合本机开发，尚无 token auth；不要绑定公网地址。
- `POST /messages` 目前是通用 inbound JSON，尚未校验 Feishu 签名、challenge 或 event id 幂等。
- dashboard HTML 仍以内联字符串维护，后续复杂交互需要拆 view template 和 client script。
- OpenClaw migration 目前是 dry-run，不会直接迁移 secrets、tool permissions、sessions、memory DB。
- OpenClaw Feishu 插件依赖 `openclaw/plugin-sdk` runtime，不是单文件 SDK；直接接入可能需要适配一层 runtime facade。

## 验证记录

```bash
npm run check
npm test
npm run myclaw -- receive --channel console --from ou_user --conversation oc_group --text hi --reply 收到 --json
```

结果：

- 语法检查通过。
- 单文件行数检查通过：当前最大文件低于 500 行。
- Node test 通过：13 个测试全部通过。
- CLI receive/reply 通过共享 runtime 返回 `ok` envelope。
- gateway 测试验证 `GET /api/health`、`POST /messages`、`GET /api/status`。
- Phase 0.2 已推送到 GitHub public 仓库，Phase 0.3 完成后会形成独立 commit 并继续 push。
