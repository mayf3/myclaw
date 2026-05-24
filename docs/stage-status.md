# MyClaw 阶段状态

更新时间：2026-05-24

## 当前阶段

Phase 1.2: Structure Guardrails + Layered Human Testing Roadmap。

当前进度：M0 本地消息闭环完成；M1 Gateway/Dashboard 可用；M2 Feishu/Lark 仍是 custom-bot 与 callback 安全子集；M3 OpenClaw 迁移有 review-only stage review；M4 有 migration approval queue；M6 工程约束已落地到 `npm run check`；M7 已把路线改成分层人类测试图，但不把 planned 的 agent/记忆能力伪装成 ready。

新的层次判断：先做 L0 接入层和 L1 Gateway，因为它们决定人、飞书、CLI、HTTP 能不能稳定交换信息；然后做 L2 workflow/审批，保证动作有审计；后面再进入 L3 单 Agent、L4 Session Search/Provenance、L5 Agent-to-Agent 和 L6 Long Memory/Search。每一层都必须有你能亲手跑的实验，不接受只靠 agent 自评。

## 用户可参与 Milestones

| Milestone | 状态 | 完成度 | 你可以怎么测 |
|---|---|---:|---|
| M0 本地消息闭环 | done | 100 | 跑 E0，确认 CLI send 写入 run/event |
| M1 Gateway 与 Dashboard | partial | 82 | 跑 E1，打开 Dashboard 看阶段、run、实验路线、审批 |
| M2 Feishu/Lark 边界 | partial | 60 | 配置 webhook 后跑 E2/E3 |
| M3 OpenClaw 迁移 | partial | 65 | 跑 E4，确认 stage review 是 review-only |
| M4 Agent Runtime 与审批 | partial | 25 | 跑 E5，确认 approval pending 和 decision audit |
| M5 记忆、搜索与插件 | planned | 8 | 等 E6 开放，验证 agent 记忆和工具链 |
| M6 工程约束与技术债 | done | 100 | 跑 E7，确认结构红线由 `npm run check` 强制 |
| M7 分层交互测试路线 | partial | 45 | 看 L0-L6，每层都有实验入口；E8-E10 仍未开放 |

## 分层测试路线

| 层 | 重点 | 当前状态 | 你可以测什么 |
|---|---|---|---|
| L0 接入层 | CLI、webhook、Feishu/Lark inbound/outbound 归一化 | partial | E0 现在可测；E2/E3 配置后可测 |
| L1 Gateway | HTTP 控制面、鉴权、状态查询、事件进入 | partial | E1 Dashboard、E3 callback、E5 token mutation |
| L2 Workflow 与审批 | 迁移和后续工具调用进入 review/approval | partial | E4 OpenClaw stage、E5 approval decision；真实 tool action 待补 |
| L3 单 Agent Runtime | 任务拆解、工具调用、失败重试、人工确认 | planned | E6 后续开放 |
| L4 Session Search / Provenance | run、step、tool result 可检索，召回来源可解释 | planned | E8 后续开放 |
| L5 Agent-to-Agent | 多 agent 分工、交接上下文、互相 review | planned | E9 后续开放 |
| L6 Long Memory / Search | 长期事实、来源解释、遗忘策略和跨会话召回 | planned | E10 后续开放 |

## Human Experiments

| 实验 | 状态 | 角色 | 命令或入口 | 成功信号 |
|---|---|---|---|---|
| E0 本地消息闭环 | ready | 本机使用者 | `npm run myclaw -- send --text "hello from human" --json` | 返回 ok envelope，Dashboard 最近 Runs 有记录 |
| E1 Dashboard 可读性 | ready | 产品试用者 | `npm run myclaw -- dashboard --port 4321 --openclaw-source /Users/yanfenma/workspace/github/openclaw` 后打开 `http://127.0.0.1:4321` | Phase 1.2、Human Experiments、Approvals 可见 |
| E2 Feishu custom-bot outbound | needs_config | 飞书群机器人配置者 | `npm run myclaw -- send --channel feishu-webhook --webhook-url "$MYCLAW_FEISHU_WEBHOOK_URL" --text "hello" --json` | 飞书群收到消息，result code 为 0 |
| E3 Feishu callback 本地校验 | needs_config | 集成验证者 | 启动 gateway 后 POST `/feishu/events` challenge，再跑 `npm test -- packages/gateway/test/gateway.test.mjs` | challenge 回显；签名错误和 encrypted fixture 由测试覆盖 |
| E4 OpenClaw 迁移 stage | ready | 迁移审阅者 | `npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --stage --json` | stage 带 approval，review-only，不修改运行时 |
| E5 审批队列 | ready | 安全审阅者 | 用 token POST `/api/openclaw-migration/stage`，GET `/api/approvals`，POST `/api/approvals/<id>/decision` | pending approval 出现，decision 写入 record 和 event |
| E6 单 Agent Runtime | planned | 长期使用者 | 后续 `myclaw run --task ...` | step timeline、tool call、失败重试和人工确认可追踪 |
| E7 工程约束红线 | ready | 协作开发者 | `npm run check` 或 `node scripts/check-file-lines.mjs` | 生成物 up to date，输出 500 lines、20 files/dir、depth 4，且全部通过 |
| E8 Session Search / Provenance | planned | 长期使用者 | 后续 `myclaw search "..."` | 检索结果带 runId/stepId/messageId 和来源 |
| E9 Agent-to-Agent 协作 | planned | 协作任务测试者 | 后续 `myclaw run --task "..." --agents 2 --json` | 两个 agent 有独立 run/step，交接和 review 可追踪 |
| E10 Long Memory / Search | planned | 长期使用者 | 后续 `myclaw memory add/search/delete ...` | 召回结果带来源，可删除或禁用记忆 |

## 本轮已完成

- 恢复 HTML Center：4177 服务重新由 `html-center` tmux session 托管，旧 Phase 1.1 链接恢复 200。
- 新增 `scripts/html-center.mjs`、`npm run html-center`、`npm run publish:review`，把 status/start/publish/verify 固化为仓库命令。
- `myclaw doctor` 现在会报告 HTML Center health。
- `scripts/check-file-lines.mjs` 升级为结构检查：所有文本文件行数、目录文件数、目录深度都会失败退出。
- 新增 `scripts/check-generated-docs.mjs`，`npm run check` 会重建 HTML 并在生成物 stale 或缺失时失败。
- `docs/modules` 只保留 Markdown 源文档；生成 HTML 移到 `docs/rendered/modules`。
- `docs/build-review-html.mjs` 改为从 `docs/modules` 读取源文档、向 `docs/rendered/modules` 写 HTML。
- Dashboard/Control payload 的 phase 更新到 1.2，新增 E7 工程约束实验。
- Dashboard/Control payload 新增 L0-L6 分层路线，并新增 E8/E9/E10 作为后续 session provenance、agent 协作和长期记忆实验占位。
- 新增 control-plane invariant test，约束 layer 顺序、实验引用和 ready 状态，避免路线状态漂移。

## 当前能力边界

| 能力 | 状态 | 边界 |
|---|---|---|
| HTML Center | 已恢复 | 有仓库命令和 doctor health；还没有自动告警 |
| 结构红线 | 已强制 | 作用于 repo 当前文本文件，不扫描 `.git/.myclaw/node_modules` |
| 生成物新鲜度 | 已强制 | `npm run check` 会重建并检测 HTML 生成物 diff |
| 目录文件数 | 已强制 | 每个目录最多 20 个直接文件 |
| 目录深度 | 已强制 | 从 repo root 计算，最多 4 层目录 |
| 文件行数 | 已强制 | 单文件最多 500 行，450 行以上预警 |

## 你现在可以测试什么

| 测试入口 | 推荐程度 | 目的 |
|---|---|---|
| E0 本地消息闭环 | 现在就测 | 确认最小消息管线没坏 |
| E1 Dashboard | 现在就测 | 看当前阶段、审批队列、实验路线 |
| E4 OpenClaw stage | 现在就测 | 确认迁移仍是 review-only |
| E5 审批队列 | 现在就测 | 亲自 approve/reject 一条记录 |
| E7 工程约束 | 现在就测 | 验证技术债红线会挡住超限结构 |
| E2/E3 Feishu | 配置后测 | 验证飞书群消息和 callback 安全 |
| E6 单 Agent | 还不能测 | 还没实现 agent runtime |
| E8 Session Search | 还不能测 | 还没实现可检索 run/step/source |
| E9 Agent-to-Agent | 还不能测 | 还没实现多 agent 协作 |
| E10 Long Memory/Search | 还不能测 | 还没实现长期记忆和搜索 |

## 当前可用命令

```bash
npm run check
npm run html-center
npm run publish:review
npm test
npm run myclaw -- send --text "hello from human" --json
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --stage --json
npm run myclaw -- dashboard --port 4321 --openclaw-source /Users/yanfenma/workspace/github/openclaw
MYCLAW_GATEWAY_TOKEN=dev-token npm run myclaw -- gateway --port 4322 --openclaw-source /Users/yanfenma/workspace/github/openclaw
curl -s http://127.0.0.1:4322/api/approvals
```

## 下一步

1. 先补 L0/L1：Feishu 配置化 smoke、Gateway mutation audit、Dashboard health strip。
2. 再补 L2：把 approval queue 接到真实 tool action，而不只是 migration stage。
3. 再补 L3：Agent runtime 最小 run/resume/tool loop。
4. 最后进入 L5/L6：Agent-to-Agent 协作和 Long Memory/Search。

## 验证记录

```bash
npm run check
npm test
```

验证结果：

- `npm run check` 通过，输出 `Generated docs are up to date.`、`Structure check passed: 105 files, max 500 lines, 20 files/dir, depth 4.` 与 `Doc phase sync check passed.`
- `npm test` 通过，39 个测试全部通过，包含 doctor health 和分层路线 invariant 新用例。
- 结构快照：当前最大目录文件数为 15，目录是 `docs/modules`；当前最大目录深度为 4，目录是 `packages/gateway/src/routes`。
