# MyClaw 阶段状态

更新时间：2026-05-17

## 当前阶段

Phase 0.2: Dashboard First + OpenClaw Migration Dry-run。

这一步把优先级从 gateway 暂时调整为 dashboard。原因是现在已有 `send/receive/reply` 和 state JSONL，先做本地控制台可以更快看见系统状态、通道能力、run timeline 和 OpenClaw 迁移阻塞项。gateway 仍然是下一阶段接飞书事件的必需入口。

## 已完成

- 初始化 Node.js/ESM workspace。
- 新增 `packages/core`：run id、event、统一 envelope、state JSONL、runs/events 读取 API。
- 新增 `packages/channels`：`ChannelAdapter` registry、能力声明、alias、inbound message normalize。
- 新增 `packages/cli`：`doctor`、`channels`、`send`、`receive`、`dashboard`、`migrate openclaw`。
- 新增 `packages/dashboard`：本地 HTTP dashboard。
  - `GET /`：工作型控制台页面。
  - `GET /api/status`：state、runs、events、channels、OpenClaw migration plan。
  - `GET /api/runs`、`GET /api/events`、`GET /api/openclaw-migration`。
- 新增 `packages/migrate`：OpenClaw dry-run 迁移评估。
  - 识别 `openclaw.json`。
  - 盘点 config sections、channels、plugin manifests。
  - 输出 MyClaw draft mapping、unsupported list、recommended steps。
  - 默认不修改 OpenClaw 或 MyClaw 状态。
- 基础测试覆盖 channel registry、inbound normalize、CLI send/receive、state reader、dashboard API、OpenClaw migration planner。

## 当前可用命令

```bash
npm run myclaw -- doctor
npm run myclaw -- channels
npm run myclaw -- send --text "hello"
npm run myclaw -- receive --from local-user --conversation local-thread --text "hello" --reply "received" --json
npm run myclaw -- dashboard --port 4321
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --json
```

飞书自定义机器人 webhook 的最小 outbound 形态：

```bash
MYCLAW_FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/..." \
  npm run myclaw -- send --channel feishu-webhook --text "hello from MyClaw"
```

这不是完整 OpenClaw Feishu/Lark 插件接入，只是先验证 MyClaw 的 outbound message boundary。

## 当前实现架构

```text
CLI command
  -> ChannelRegistry.resolve(channel)
  -> ChannelAdapter.send() 或 ChannelAdapter.normalizeInbound()
  -> core envelope/events/state
  -> dashboard API / migration planner / docs report
```

Dashboard 数据流：

```text
browser
  -> GET /api/status
  -> listRuns + readEvents + listChannels + planOpenClawMigration
  -> HTML dashboard render
```

OpenClaw migration 数据流：

```text
openclaw.json + extensions/*/openclaw.plugin.json
  -> dry-run inventory
  -> MyClaw draft mapping
  -> unsupported runtime surfaces
  -> recommended next steps
```

## OpenClaw 一键迁移路线

当前实现的是一键迁移的第一步：`dry-run inventory`。完整一键迁移建议拆成三段：

1. `plan`：读取 OpenClaw config 和插件清单，生成 reviewable migration plan。
2. `stage`：把可安全映射的内容写入 MyClaw migration snapshot，不启用运行时。
3. `apply`：在 MyClaw schema、gateway、plugin runtime 都具备后，按模块启用。

必须保留这个顺序。直接从 OpenClaw 全量 runtime apply 到 MyClaw 会把 Feishu、tools、memory、secrets、provider、browser 自动化等高风险面混在一起，难以回滚。

## 下一步

1. 把 dashboard 从只读状态页扩展为 gateway 控制台入口。
2. 增加 `packages/gateway` 的最小 HTTP 入口：`POST /messages` 复用 `receive` 的 inbound normalize。
3. 将 dashboard 的 `/api/status` 和 gateway 共用同一套服务对象，避免后续分裂。
4. 为 Feishu/Lark 决定接入路径：
   - 直接依赖 OpenClaw `@openclaw/feishu`，补 runtime facade。
   - 或先做最小 Feishu app credential client。
   - 或继续保持 webhook-only，等 gateway/agent 稳定后再接完整插件。
5. 把 `migrate openclaw` 从 plan 扩展到 `--output` snapshot，再评估 `--apply`。
6. 为每次阶段推进继续输出 HTML 架构 design review report，并发布到 HTML Center。

## 风险

- 当前 dashboard 是只读控制台，没有鉴权；只能绑定本机 `127.0.0.1`。
- OpenClaw migration 目前是 dry-run，不会直接迁移 secrets、tool permissions、sessions、memory DB。
- OpenClaw Feishu 插件依赖 `openclaw/plugin-sdk` runtime，不是单文件 SDK；直接接入可能需要适配一层 runtime facade。
- 完整飞书通信需要 appId/appSecret、事件订阅、权限 scope、群聊 allowlist 和 mention 策略。
- 当前 inbound 只在 CLI 模拟，尚未有 HTTP gateway、签名校验、幂等和重放保护。

## 验证记录

```bash
npm run check
npm test
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --json
```

结果：

- 语法检查通过。
- Node test 通过：11 个测试全部通过。
- `migrate openclaw` 对 `/Users/yanfenma/workspace/github/openclaw` 生成 dry-run plan，识别到当前 OpenClaw config、Feishu channel、插件 manifests 和 unsupported runtime surfaces。
- dashboard API 测试通过，`GET /` 和 `GET /api/status` 均可返回内容。
