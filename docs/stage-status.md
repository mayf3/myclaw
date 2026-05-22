# MyClaw 阶段状态

更新时间：2026-05-22

## 当前阶段

Phase 1.1: Approval Queue + OpenClaw Stage Review。

当前进度：M0 本地消息闭环完成；M1 Gateway/Dashboard 已有共享只读 route adapter 和可亲测路线；M2 Feishu/Lark 边界已有 custom-bot outbound 和 signed encrypted challenge；M3 OpenClaw 迁移新增 review-only stage review summary；M4 审批从 planned 进入 partial，OpenClaw stage 会生成 pending approval，并可通过 Gateway token approve/reject。

Phase 1.1 的重点是把“人类参与”从看路线推进到做决定。当前 approve/reject 只记录审批结果，不执行 apply，避免把迁移审查误变成真实运行时变更。

## 用户可参与 Milestones

| Milestone | 状态 | 完成度 | 你可以怎么测 |
|---|---|---:|---|
| M0 本地消息闭环 | done | 100 | 跑 E0，确认 CLI send 写入 run/event |
| M1 Gateway 与 Dashboard | partial | 82 | 跑 E1，打开 Dashboard 看阶段、run、实验路线、审批 |
| M2 Feishu/Lark 边界 | partial | 60 | 配置 webhook 后跑 E2/E3 |
| M3 OpenClaw 迁移 | partial | 65 | 跑 E4，确认 stage review 是 review-only |
| M4 Agent Runtime 与审批 | partial | 25 | 跑 E5，确认 approval pending 和 decision audit |
| M5 记忆、搜索与插件 | planned | 8 | 等 E6 开放，验证 agent 记忆和工具链 |

## Human Experiments

| 实验 | 状态 | 角色 | 命令或入口 | 成功信号 |
|---|---|---|---|---|
| E0 本地消息闭环 | ready | 本机使用者 | `npm run myclaw -- send --text "hello from human" --json` | 返回 ok envelope，Dashboard 最近 Runs 有记录 |
| E1 Dashboard 可读性 | ready | 产品试用者 | `npm run myclaw -- dashboard --port 4321 --openclaw-source /Users/yanfenma/workspace/github/openclaw` 后打开 `http://127.0.0.1:4321` | Phase 1.1、Human Experiments、Approvals 可见 |
| E2 Feishu custom-bot outbound | needs_config | 飞书群机器人配置者 | `npm run myclaw -- send --channel feishu-webhook --webhook-url "$MYCLAW_FEISHU_WEBHOOK_URL" --text "hello" --json` | 飞书群收到消息，result code 为 0 |
| E3 Feishu callback 本地校验 | needs_config | 集成验证者 | 启动 gateway 后 POST `/feishu/events` challenge，再跑 `npm test -- packages/gateway/test/gateway.test.mjs` | challenge 回显；签名错误和 encrypted fixture 由测试覆盖 |
| E4 OpenClaw 迁移 stage | ready | 迁移审阅者 | `npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --stage --json` | `forReviewOnly=true`，stage 带 approval |
| E5 审批队列 | ready | 安全审阅者 | 用 token POST `/api/openclaw-migration/stage`，GET `/api/approvals`，POST `/api/approvals/<id>/decision` | pending approval 出现，decision 写入 record 和 event |
| E6 Agent 与记忆 | planned | 长期使用者 | 后续 `myclaw run --task ...` | step timeline、tool call、memory source 可追踪 |

## 本轮已完成

- 新增 `packages/core/src/approvals.mjs`，支持 create/list/read/decide approval。
- OpenClaw migration stage 会生成 pending approval，并写入 `state/approvals` 与 events。
- 新增 `packages/control-plane/src/openclaw-diff.mjs`，输出 review-only stage review summary。
- `/api/status` 内联 `approvals`、`openclawStageReview` 和兼容字段 `openclawStageDiff`，新增 `GET /api/approvals` 与 `GET /api/approvals/:id`。
- Gateway 新增 `POST /api/approvals/:id/decision`，仍受 mutation token guard 保护。
- Dashboard 新增 Approvals 区块，展示 pending/approved/rejected 与 stage review。
- E5 从 planned 改成 ready，用户可以亲自做一次审批决定。

## 当前能力边界

| 能力 | 状态 | 边界 |
|---|---|---|
| Approval queue | 已有种子 | 针对 OpenClaw migration stage；还不是 tool approval |
| Approval decision | 已有 | 只记录 approved/rejected，不执行 apply |
| OpenClaw stage review | 已有 | review-only 模块/字段摘要，不是可执行 patch 或真实 schema diff |
| Gateway/Dashboard control API | 已收敛 | 只读 GET route 共用 adapter；decision mutation 在 gateway |
| Feishu outbound text/card | 已有子集 | custom-bot webhook，不是 app-token rich card API |
| Agent runtime | 未做 | 暂无 LLM tool loop、tool approval、memory |

## 参考完成度

| 模块 | MyClaw | OpenClaw | Hermes-agent | OpenHuman | 当前差距 |
|---|---:|---:|---:|---:|---|
| Gateway / 控制面 | 65 | 90 | 78 | 86 | 已有 read route adapter 和 approval decision mutation，仍缺 WS/SSE、scoped token |
| Feishu/Lark 接入 | 60 | 92 | 42 | 35 | 有 encrypted challenge/custom-bot outbound facade，缺 WebSocket/policy/app token |
| Dashboard / 观测 | 73 | 78 | 55 | 90 | 有 stage review/approval queue，缺实时事件和完整 review drawer |
| OpenClaw 迁移 | 63 | 0 | 82 | 35 | 有 plan/stage/review summary/approval，缺 apply/rollback 和真实 schema diff |
| Agent Runtime | 8 | 76 | 92 | 90 | 还没有 agent turn/tool loop |
| Memory / Search | 10 | 52 | 94 | 96 | 还没有 SQLite/FTS/长期记忆 |
| Tools / Security | 32 | 88 | 74 | 84 | 有 migration approval seed，缺 tool schema、tool approval、sandbox |
| Plugins / Skills | 18 | 92 | 88 | 78 | 还没有 plugin manifest/skill loader |

## 当前可用命令

```bash
npm run myclaw -- send --text "hello from human" --json
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --stage --json
npm run myclaw -- dashboard --port 4321 --openclaw-source /Users/yanfenma/workspace/github/openclaw
MYCLAW_GATEWAY_TOKEN=dev-token npm run myclaw -- gateway --port 4322 --openclaw-source /Users/yanfenma/workspace/github/openclaw
curl -s http://127.0.0.1:4322/api/approvals
```

## 下一步

1. 把 approval queue 接到真实 tool action，而不只是 migration stage。
2. Dashboard 做可操作 review drawer，明确 approve/reject 的后果和不可执行边界。
3. Gateway scoped token、run redaction、mutation idempotency。
4. Agent runtime 最小 run/resume/tool loop。

## 验证记录

```bash
npm run check
npm test
```

结果：

- 单文件行数检查通过：98 个文件，最大 500 行限制未触发。
- 文档阶段同步检查通过，`stage-status.html` 和 `implementation-architecture.html` 都是 Phase 1.1。
- Node test 通过：37 个测试全部通过。
