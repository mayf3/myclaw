# MyClaw 阶段状态

更新时间：2026-05-23

## 当前阶段

Phase 1.2: Structure Guardrails + HTML Center Recovery。

当前进度：M0 本地消息闭环完成；M1 Gateway/Dashboard 可用；M2 Feishu/Lark 仍是 custom-bot 与 callback 安全子集；M3 OpenClaw 迁移有 review-only stage review；M4 有 migration approval queue；M6 工程约束已落地到 `npm run check`。

这轮先修复 HTML Center 4177 服务不可访问的问题，再把技术债红线写成硬检查：单文件最多 500 行、每个目录最多 20 个文件、最多 4 层子目录。独立审查指出初版还有 HTML Center 不可复现、行数检查可绕过、生成 HTML stale 三个 High，本轮已补进仓库脚本和 `npm run check`。

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

## Human Experiments

| 实验 | 状态 | 角色 | 命令或入口 | 成功信号 |
|---|---|---|---|---|
| E0 本地消息闭环 | ready | 本机使用者 | `npm run myclaw -- send --text "hello from human" --json` | 返回 ok envelope，Dashboard 最近 Runs 有记录 |
| E1 Dashboard 可读性 | ready | 产品试用者 | `npm run myclaw -- dashboard --port 4321 --openclaw-source /Users/yanfenma/workspace/github/openclaw` 后打开 `http://127.0.0.1:4321` | Phase 1.2、Human Experiments、Approvals 可见 |
| E2 Feishu custom-bot outbound | needs_config | 飞书群机器人配置者 | `npm run myclaw -- send --channel feishu-webhook --webhook-url "$MYCLAW_FEISHU_WEBHOOK_URL" --text "hello" --json` | 飞书群收到消息，result code 为 0 |
| E3 Feishu callback 本地校验 | needs_config | 集成验证者 | 启动 gateway 后 POST `/feishu/events` challenge，再跑 `npm test -- packages/gateway/test/gateway.test.mjs` | challenge 回显；签名错误和 encrypted fixture 由测试覆盖 |
| E4 OpenClaw 迁移 stage | ready | 迁移审阅者 | `npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --stage --json` | stage 带 approval，review-only，不修改运行时 |
| E5 审批队列 | ready | 安全审阅者 | 用 token POST `/api/openclaw-migration/stage`，GET `/api/approvals`，POST `/api/approvals/<id>/decision` | pending approval 出现，decision 写入 record 和 event |
| E6 Agent 与记忆 | planned | 长期使用者 | 后续 `myclaw run --task ...` | step timeline、tool call、memory source 可追踪 |
| E7 工程约束红线 | ready | 协作开发者 | `npm run check` 或 `node scripts/check-file-lines.mjs` | 生成物 up to date，输出 500 lines、20 files/dir、depth 4，且全部通过 |

## 本轮已完成

- 恢复 HTML Center：4177 服务重新由 `html-center` tmux session 托管，旧 Phase 1.1 链接恢复 200。
- 新增 `scripts/html-center.mjs`、`npm run html-center`、`npm run publish:review`，把 status/start/publish/verify 固化为仓库命令。
- `myclaw doctor` 现在会报告 HTML Center health。
- `scripts/check-file-lines.mjs` 升级为结构检查：所有文本文件行数、目录文件数、目录深度都会失败退出。
- 新增 `scripts/check-generated-docs.mjs`，`npm run check` 会重建 HTML 并在生成物 stale 或缺失时失败。
- `docs/modules` 只保留 Markdown 源文档；生成 HTML 移到 `docs/rendered/modules`。
- `docs/build-review-html.mjs` 改为从 `docs/modules` 读取源文档、向 `docs/rendered/modules` 写 HTML。
- Dashboard/Control payload 的 phase 更新到 1.2，新增 E7 工程约束实验。

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
| E6 Agent/Memory | 还不能测 | 还没实现 agent runtime 和记忆 |

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

1. 拆 `packages/dashboard/src/client.mjs` 为 section renderer registry。
2. 把 approval queue 接到真实 tool action，而不只是 migration stage。
3. 做真实 OpenClaw source/target schema diff drawer。
4. Agent runtime 最小 run/resume/tool loop。

## 验证记录

```bash
npm run check
npm test
```

验证结果：

- `npm run check` 通过，输出 `Generated docs are up to date.`、`Structure check passed: 103 files, max 500 lines, 20 files/dir, depth 4.` 与 `Doc phase sync check passed.`
- `npm test` 通过，38 个测试全部通过，包含 doctor health 新用例。
- 结构快照：当前最大目录文件数为 15，目录是 `docs/modules`；当前最大目录深度为 4，目录是 `packages/gateway/src/routes`。
