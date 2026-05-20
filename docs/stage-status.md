# MyClaw 阶段状态

更新时间：2026-05-20

## 当前阶段

Phase 0.9: Feishu Outbound Facade + Dashboard Milestones。

当前进度：M0 本地消息闭环完成；M1 Gateway/Dashboard 基本可用；M2 Feishu/Lark 边界进行中；M3 OpenClaw 迁移处于 review-only stage；M4 Agent Runtime 和审批还没开始。Phase 0.9 不是接完整 OpenClaw Feishu 插件，而是把 custom-bot outbound text/card result 的 MyClaw 目标契约先做稳。

## Milestones

| Milestone | 状态 | 完成度 | 说明 |
|---|---|---:|---|
| M0 本地消息闭环 | done | 100 | CLI send/receive、state、channel registry 已可用 |
| M1 Gateway 与 Dashboard | partial | 70 | HTTP 控制面、run detail、reference matrix 已可用，缺 event stream |
| M2 Feishu/Lark 边界 | partial | 58 | signed encrypted challenge 与 custom-bot outbound facade 已有，缺 WebSocket/policy |
| M3 OpenClaw 迁移 | partial | 55 | plan/stage/review summary 已有，缺字段级 diff 和 apply |
| M4 Agent Runtime 与审批 | planned | 10 | 还没有 LLM tool loop、approval queue 和 scoped token |
| M5 记忆、搜索与插件 | planned | 8 | 还没有 SQLite/FTS、long memory、plugin manifest loader |

## 本轮已完成

- `packages/feishu-adapter/src/outbound.mjs` 新增 custom-bot outbound facade。
  - `buildFeishuOutboundPayload` 支持 text 和 interactive card payload。
  - `normalizeFeishuSendResult` 统一 Feishu custom bot 返回结果。
- `threadId` 暂作为 result metadata，不宣称 webhook 支持真实线程回复。
- `feishu-webhook` channel 改为调用 Feishu adapter outbound facade。
- Feishu webhook channel 会识别 Feishu JSON 返回码，`StatusCode/code != 0` 时失败。
- `packages/control-plane/src/milestones.mjs` 新增阶段里程碑 payload。
- `/api/status` 返回静态 roadmap 型 `milestones`，payload 标记 `computed: false` 和 `source: static-roadmap`。
- Gateway/Dashboard 新增 `GET /api/milestones`。

## 当前能力边界

| 能力 | 状态 | 边界 |
|---|---|---|
| Feishu encrypted challenge | 已有 | 支持 signed encrypted URL verification |
| Feishu inbound event | 部分 | decrypt path 有，事件语义仍主要是 text normalize |
| Feishu outbound text | 已有 | custom-bot webhook payload |
| Feishu outbound card | 已有契约 | interactive card payload 构造，未接 app token API |
| Feishu thread result | 有 metadata | 不宣称 webhook 能真实 thread reply |
| Milestone dashboard | 已有 | 展示 M0-M5 完成度，不做编辑 |
| OpenClaw apply | 未做 | 仍停在 review-only plan/stage/summary |

## 参考完成度

| 模块 | MyClaw | OpenClaw | Hermes-agent | OpenHuman | 当前差距 |
|---|---:|---:|---:|---:|---|
| Gateway / 控制面 | 60 | 90 | 78 | 86 | 已拆 routes/auth，仍缺 WS/SSE、scoped token |
| Feishu/Lark 接入 | 58 | 92 | 42 | 35 | 有 encrypted challenge/custom-bot outbound facade，缺 WebSocket/policy/app token |
| Dashboard / 观测 | 60 | 78 | 55 | 90 | 有 run detail/stage summary/milestones，缺 approval queue、实时事件 |
| OpenClaw 迁移 | 55 | 0 | 82 | 35 | 有 plan/stage/review summary，缺 apply/rollback/字段级 diff |
| Agent Runtime | 8 | 76 | 92 | 90 | 还没有 agent turn/tool loop |
| Memory / Search | 10 | 52 | 94 | 96 | 还没有 SQLite/FTS/长期记忆 |
| Tools / Security | 22 | 88 | 74 | 84 | 缺 tool schema、approval queue、sandbox |
| Plugins / Skills | 18 | 92 | 88 | 78 | 还没有 plugin manifest/skill loader |

## 当前可用命令

```bash
npm run myclaw -- channels --json
npm run myclaw -- send --channel feishu-webhook --webhook-url "$MYCLAW_FEISHU_WEBHOOK_URL" --text "hello" --json
npm run myclaw -- dashboard --port 4321 --openclaw-source /Users/yanfenma/workspace/github/openclaw
MYCLAW_GATEWAY_TOKEN=dev-token MYCLAW_FEISHU_VERIFY_TOKEN=verify-token MYCLAW_FEISHU_ENCRYPT_KEY=encrypt-key \
  npm run myclaw -- gateway --port 4322 --openclaw-source /Users/yanfenma/workspace/github/openclaw
```

## 下一步

1. Phase 1 前置：controller/route adapter，停止 gateway/dashboard 复制 if 链。
2. Gateway scoped token 和 run redaction policy。
3. Dashboard approval queue 和字段级 migration diff drawer。
4. Replay guard 持久化到 state 或 SQLite。

## 验证记录

```bash
npm run check
npm test
```

结果：

- 单文件行数检查通过：91 个文件，最大 500 行限制未触发。
- 文档阶段同步检查通过。
- Node test 通过：33 个测试全部通过。
