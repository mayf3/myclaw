# MyClaw 阶段状态

更新时间：2026-05-21

## 当前阶段

Phase 1.0: Human Experiment Roadmap + Control Route Adapter。

当前进度：M0 本地消息闭环完成；M1 Gateway/Dashboard 进入“人可以亲自测试”的可视化路线阶段；M2 Feishu/Lark 边界已有 custom-bot outbound 和 signed encrypted challenge；M3 OpenClaw 迁移仍保持 review-only stage；M4/M5 还没有 agent loop、approval queue、memory/search。

Phase 1.0 的重点不是继续堆 agent 能力，而是把大路线拆成用户可验证的实验，并把 dashboard 与 gateway 的只读控制面 API 收敛到共享 route adapter，避免后续状态接口漂移。

## 用户可参与 Milestones

| Milestone | 状态 | 完成度 | 你可以怎么测 |
|---|---|---:|---|
| M0 本地消息闭环 | done | 100 | 跑 E0，确认 CLI send 写入 run/event |
| M1 Gateway 与 Dashboard | partial | 78 | 跑 E1，打开 Dashboard 看阶段、run、实验路线 |
| M2 Feishu/Lark 边界 | partial | 60 | 配置 webhook 后跑 E2/E3 |
| M3 OpenClaw 迁移 | partial | 58 | 跑 E4，确认只 plan/stage 不 apply |
| M4 Agent Runtime 与审批 | planned | 10 | 等 E5 开放，验证危险动作审批 |
| M5 记忆、搜索与插件 | planned | 8 | 等 E6 开放，验证 agent 记忆和工具链 |

## Human Experiments

| 实验 | 状态 | 角色 | 命令或入口 | 成功信号 |
|---|---|---|---|---|
| E0 本地消息闭环 | ready | 本机使用者 | `npm run myclaw -- send --text "hello from human" --json` | 返回 ok envelope，Dashboard 最近 Runs 有记录 |
| E1 Dashboard 可读性 | ready | 产品试用者 | `npm run myclaw -- dashboard --port 4321 --openclaw-source /Users/yanfenma/workspace/github/openclaw` 后打开 `http://127.0.0.1:4321` | Phase 1.0、Human Experiments、命令和成功信号可见 |
| E2 Feishu custom-bot outbound | needs_config | 飞书群机器人配置者 | `npm run myclaw -- send --channel feishu-webhook --webhook-url "$MYCLAW_FEISHU_WEBHOOK_URL" --text "hello" --json` | 飞书群收到消息，result code 为 0 |
| E3 Feishu callback 本地校验 | needs_config | 集成验证者 | 启动 gateway 后 POST `/feishu/events` challenge，再跑 `npm test -- packages/gateway/test/gateway.test.mjs` | challenge 回显；签名错误和 encrypted fixture 由测试覆盖 |
| E4 OpenClaw 迁移 stage | ready | 迁移审阅者 | `npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --stage --json` | `forReviewOnly=true`，不修改运行时配置 |
| E5 审批队列 | planned | 安全审阅者 | 后续 `myclaw approvals list` | 危险动作默认暂停，审批进入 audit |
| E6 Agent 与记忆 | planned | 长期使用者 | 后续 `myclaw run --task ...` | step timeline、tool call、memory source 可追踪 |

## 本轮已完成

- 新增 `packages/control-plane/src/experiments.mjs`，提供 E0-E6 的人类实验路线。
- `/api/status` 内联 `experiments`，新增 `GET /api/experiments`。
- 新增 `packages/control-plane/src/http-routes.mjs`，统一 Dashboard 和 Gateway 的只读控制面 route。
- Dashboard 新增 Human Experiments 区块，展示实验命令、成功信号和解锁关系。
- Milestones 更新为 Phase 1.0，并把 M1 完成度提升到 78。

## 当前能力边界

| 能力 | 状态 | 边界 |
|---|---|---|
| Human roadmap | 已有 | 静态 payload，尚未由测试结果自动计算 |
| Gateway/Dashboard control API | 已收敛 | 只读 GET route 共用 adapter；mutation route 仍在 gateway |
| Feishu encrypted challenge | 已有 | 支持 signed encrypted URL verification |
| Feishu outbound text/card | 已有子集 | custom-bot webhook，不是 app-token rich card API |
| OpenClaw apply | 未做 | 仍停在 review-only plan/stage/summary |
| Agent runtime | 未做 | 暂无 LLM tool loop、approval queue、memory |

## 参考完成度

| 模块 | MyClaw | OpenClaw | Hermes-agent | OpenHuman | 当前差距 |
|---|---:|---:|---:|---:|---|
| Gateway / 控制面 | 66 | 90 | 78 | 86 | 已有共享 read route adapter，仍缺 WS/SSE、scoped token |
| Feishu/Lark 接入 | 60 | 92 | 42 | 35 | 有 encrypted challenge/custom-bot outbound facade，缺 WebSocket/policy/app token |
| Dashboard / 观测 | 66 | 78 | 55 | 90 | 有 run detail/stage summary/milestones/human experiments，缺 approval queue、实时事件 |
| OpenClaw 迁移 | 58 | 0 | 82 | 35 | 有 plan/stage/review summary，缺 apply/rollback/字段级 diff |
| Agent Runtime | 8 | 76 | 92 | 90 | 还没有 agent turn/tool loop |
| Memory / Search | 10 | 52 | 94 | 96 | 还没有 SQLite/FTS/长期记忆 |
| Tools / Security | 22 | 88 | 74 | 84 | 缺 tool schema、approval queue、sandbox |
| Plugins / Skills | 18 | 92 | 88 | 78 | 还没有 plugin manifest/skill loader |

## 当前可用命令

```bash
npm run myclaw -- channels --json
npm run myclaw -- send --text "hello from human" --json
npm run myclaw -- send --channel feishu-webhook --webhook-url "$MYCLAW_FEISHU_WEBHOOK_URL" --text "hello" --json
npm run myclaw -- dashboard --port 4321 --openclaw-source /Users/yanfenma/workspace/github/openclaw
MYCLAW_GATEWAY_TOKEN=dev-token MYCLAW_FEISHU_VERIFY_TOKEN=verify-token MYCLAW_FEISHU_ENCRYPT_KEY=encrypt-key \
  npm run myclaw -- gateway --port 4322 --openclaw-source /Users/yanfenma/workspace/github/openclaw
```

## 下一步

1. Dashboard approval queue 和字段级 migration diff drawer。
2. Gateway scoped token、run redaction、mutation idempotency。
3. Feishu app-token outbound client 与 access policy。
4. Agent runtime 最小 run/resume/tool loop。

## 验证记录

```bash
npm run check
npm test
```

结果：

- 单文件行数检查通过：94 个文件，最大 500 行限制未触发。
- 文档阶段同步检查通过，`stage-status.html` 和 `implementation-architecture.html` 都是 Phase 1.0。
- Node test 通过：34 个测试全部通过。
