# MyClaw 阶段状态

更新时间：2026-05-17

## 当前阶段

Phase 0.6: Reference-aware Dashboard + Feishu/Lark Adoption Review。

这一轮解决两个问题：第一，明确 OpenClaw Feishu/Lark 插件的复用方式；第二，重做 dashboard 的信息结构，让每个模块都和 OpenClaw、Hermes-agent、OpenHuman 做完成度对比。结论是：Feishu 可以强参考 OpenClaw `extensions/feishu`，但 Phase 0.6 不直接加载 OpenClaw 插件 runtime。

## 已完成

- 初始化 git 仓库，创建 public GitHub 仓库：`https://github.com/mayf3/myclaw`。
- 新增 `packages/runtime`：共享 message send/receive/reply runtime。
- 新增 `packages/control-plane`：dashboard 和 gateway 共用 status/runs/events/migration 聚合层。
- 新增 `packages/gateway`：本地 HTTP gateway，支持 `/messages`、`/feishu/events`、`/api/openclaw-migration/stage`。
- 新增 `packages/dashboard`：只读 dashboard server。
- 新增 `scripts/check-file-lines.mjs`：强制单文件不超过 500 行。
- 新增 `feishu-webhook` 与 `feishu-event` channel adapter。
- Feishu endpoint 支持 challenge、verify token、event id 去重，并拒绝 encrypt payload。
- OpenClaw migration 已有 dry-run `plan` 与可落盘 `stage snapshot`。
- `myclaw dashboard` 保持只读；mutation 只在显式 `myclaw gateway` 中开放。
- Phase 0.6 新增 `packages/control-plane/src/reference-completion.mjs`：每个阶段输出 OpenClaw/Hermes-agent/OpenHuman 完成度矩阵。
- Phase 0.6 dashboard 拆成 `view/styles/client/assets`，不再把 HTML/CSS/JS 全部塞进一个文件。
- 新增 `/api/reference-completion` 与 `/api/feishu-adoption`，dashboard 并行读取，避免 `/api/status` 混入评审态数据。

## 当前可用命令

```bash
npm run myclaw -- doctor
npm run myclaw -- channels
npm run myclaw -- send --text "hello"
npm run myclaw -- receive --from local-user --conversation local-thread --text "hello" --reply "received" --json
npm run myclaw -- dashboard --port 4321 --openclaw-source /Users/yanfenma/workspace/github/openclaw
npm run myclaw -- gateway --port 4322 --openclaw-source /Users/yanfenma/workspace/github/openclaw
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --json
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --stage --json
```

Gateway mutation token：

```bash
MYCLAW_GATEWAY_TOKEN=dev-token npm run myclaw -- gateway --port 4322

curl -sS http://127.0.0.1:4322/messages \
  -H 'content-type: application/json' \
  -H 'x-myclaw-token: dev-token' \
  -d '{"text":"hello guarded"}'
```

Feishu event ingress：

```bash
curl -sS http://127.0.0.1:4322/feishu/events \
  -H 'content-type: application/json' \
  -d '{"token":"verify-token","challenge":"plain_challenge"}'
```

## OpenClaw Feishu/Lark 结论

| 问题 | 当前结论 |
|---|---|
| 能不能直接用 `openclaw-lark`？ | Phase 0.6 不直接加载。OpenClaw 仓库里对应的是 `extensions/feishu`，alias 覆盖 Lark，包名 `@openclaw/feishu`。 |
| 能不能参考？ | 必须参考。优先复用 config schema、安全测试、webhook/WebSocket 接入思路、policy、event/outbound normalization。 |
| 为什么不直接用？ | 插件依赖 OpenClaw plugin-sdk/runtime/config/secrets/approval，MyClaw 还没有这些契约。直接加载会把未设计好的运行时语义带进来。 |
| 下一步 | 写 MyClaw Feishu adapter facade，再逐项 port OpenClaw Feishu 的安全与事件处理逻辑。 |

## 参考完成度

| 模块 | MyClaw | OpenClaw | Hermes-agent | OpenHuman | 下一步 |
|---|---:|---:|---:|---:|---|
| Gateway / 控制面 | 58 | 90 | 78 | 86 | 拆 auth/feishu/migration routes，增加 mutation audit |
| Feishu/Lark 接入 | 28 | 92 | 42 | 35 | 参考 OpenClaw Feishu，先做 adapter facade |
| Dashboard / 观测 | 45 | 78 | 55 | 90 | 增加 run detail、stage diff、approval queue |
| OpenClaw 迁移 | 50 | 0 | 82 | 35 | 从 staged snapshot apply `--module feishu` |
| Agent Runtime | 8 | 76 | 92 | 90 | 先做 run/resume/approval 状态机 |
| Memory / Search | 10 | 52 | 94 | 96 | 先做 run/session FTS |
| Tools / Security | 22 | 88 | 74 | 84 | approval 从 reply 提升为独立 state |
| Plugins / Skills | 18 | 92 | 88 | 78 | 先做只读 skill loader |

## 当前实现架构

```text
CLI send/receive
  -> packages/runtime
  -> packages/channels
  -> packages/core state

HTTP POST /messages
  -> packages/gateway mutation token guard
  -> packages/runtime.receiveMessage
  -> packages/core state

HTTP POST /feishu/events
  -> packages/gateway Feishu verify/encrypt guard
  -> packages/runtime.receiveMessage(rawInbound)
  -> packages/channels feishu-event.normalizeInbound
  -> packages/core state

Dashboard GET /api/status
  -> packages/control-plane
  -> state + migration plan

Dashboard GET /api/reference-completion
  -> packages/control-plane reference completion criteria

Dashboard GET /api/feishu-adoption
  -> packages/control-plane Feishu reuse decision
```

## 下一步

1. 做 MyClaw Feishu adapter facade，先定义 config schema、event normalization、verification contract。
2. 从 OpenClaw Feishu 安全测试中移植 webhook verification、encrypt/replay 行为。
3. 在 dashboard 增加 run detail、stage diff、`apply --module feishu` 前的人工确认。
4. 继续保持每个阶段：design review HTML、Linus 视角独立审查、`npm run check`、`npm test`、commit、push、HTML Center 发布。

## 风险

- Dashboard 信息结构已经改善，但还没有实时事件、run detail drawer、stage diff。
- Feishu 当前仍不能生产暴露；缺签名、encrypt、持久 replay window。
- OpenClaw migration 仍是 dry-run/stage，不会直接迁移 secrets、tools、sessions、memory。
- 参考完成度分数是工程判断，不是自动扫描结果；后续应让 status payload 接入更客观的验收项。

## 验证记录

```bash
npm run check
npm test
```

结果：

- 单文件行数检查通过：74 个文件，最大 500 行限制未触发。
- Node test 通过：21 个测试全部通过。
- Dashboard/gateway 测试覆盖 asset routes、`referenceCompletion`、`feishuAdoption`。
