# MyClaw 阶段状态

更新时间：2026-06-02

## 当前阶段

Phase 1.6: Tool Approval Smoke。

当前进度：M0 本地消息闭环完成；M1 Gateway/Dashboard 已补 health strip、mutation audit、`/api/audit`、`/api/events/stream` 和 scoped token；M2 Feishu/Lark 已从 credential presence 推进到 WebSocket 长连接群消息自动回复，并补了默认封闭 ingress、本地 policy 文件、persistent replay 和 Dashboard/API/SSE 脱敏；M3 OpenClaw 迁移有 review-only stage review；M4 已有 migration approval queue 和 safe smoke tool approval execution；M6 工程约束已落地到 `npm run check`；M7 已把路线改成分层人类测试图，但不把 planned 的 agent/记忆能力伪装成 ready。

本轮运行态：`~/.openduck/openclaw.json` 已只读转换为 `.myclaw/openduck-feishu.env`，该目录被 git ignore 且文件权限为 `600`；只输出变量名，不输出 secret 值。`myclaw-feishu-bot` tmux session 已启动，SDK 日志显示 websocket ready。openduck 对应的 `ai.openclaw.gateway.second` 已停掉，当前仍保留正在使用的 `ai.openclaw.gateway`。

新的层次判断：先做 L0 接入层和 L1 Gateway，因为它们决定人、飞书、CLI、HTTP 能不能稳定交换信息；然后做 L2 workflow/审批，保证动作有审计；后面再进入 L3 单 Agent、L4 Session Search/Provenance、L5 Agent-to-Agent 和 L6 Long Memory/Search。每一层都必须有你能亲手跑的实验，不接受只靠 agent 自评。

## 用户可参与 Milestones

| Milestone | 状态 | 完成度 | 你可以怎么测 |
|---|---|---:|---|
| M0 本地消息闭环 | done | 100 | 跑 E0，确认 CLI send 写入 run/event |
| M1 Gateway 与 Dashboard | partial | 92 | 跑 E1/E1B/E1C，打开 Dashboard 看阶段、健康、audit、stream、run、实验路线、审批 |
| M2 Feishu/Lark 边界 | partial | 88 | 跑 E2B/E2C：在备份飞书群发消息，看自动回复和脱敏 run |
| M3 OpenClaw 迁移 | partial | 65 | 跑 E4，确认 stage review 是 review-only |
| M4 Agent Runtime 与审批 | partial | 38 | 跑 E5/E5B，确认 approval pending、decision audit 和 approved 才执行 safe smoke tool |
| M5 记忆、搜索与插件 | planned | 8 | 等 E6 开放，验证 agent 记忆和工具链 |
| M6 工程约束与技术债 | done | 100 | 跑 E7，确认结构红线由 `npm run check` 强制 |
| M7 分层交互测试路线 | partial | 45 | 看 L0-L6，每层都有实验入口；E8-E10 仍未开放 |

## 分层测试路线

| 层 | 重点 | 当前状态 | 你可以测什么 |
|---|---|---|---|
| L0 接入层 | CLI、webhook、Feishu/Lark inbound/outbound 归一化 | partial | E0/E2A/E2B/E2C 现在可测；E2/E3 配置后可测 |
| L1 Gateway | HTTP 控制面、鉴权、状态查询、事件进入、SSE 事件流和 mutation audit | partial | E1 Dashboard、E1B health/audit、E1C stream/scoped token、E2A/E2B/E2C adapter readiness、E3 callback、E5 token mutation、E5B tool request |
| L2 Workflow 与审批 | 迁移和后续工具调用进入 review/approval | partial | E4 OpenClaw stage、E5 approval decision、E5B safe tool approval smoke |
| L3 单 Agent Runtime | 任务拆解、工具调用、失败重试、人工确认 | planned | E6 后续开放 |
| L4 Session Search / Provenance | run、step、tool result 可检索，召回来源可解释 | planned | E8 后续开放 |
| L5 Agent-to-Agent | 多 agent 分工、交接上下文、互相 review | planned | E9 后续开放 |
| L6 Long Memory / Search | 长期事实、来源解释、遗忘策略和跨会话召回 | planned | E10 后续开放 |

## Human Experiments

| 实验 | 状态 | 角色 | 命令或入口 | 成功信号 |
|---|---|---|---|---|
| E0 本地消息闭环 | ready | 本机使用者 | `npm run myclaw -- send --text "hello from human" --json` | 返回 ok envelope，Dashboard 最近 Runs 有记录 |
| E1 Dashboard 可读性 | ready | 产品试用者 | `npm run myclaw -- dashboard --port 4321 --openclaw-source $MYCLAW_OPENCLAW_SOURCE` 后打开 `http://127.0.0.1:4321` | Phase 1.6、Human Experiments、Approvals 可见 |
| E1B Dashboard health 与 Gateway audit | ready | 本地运维观察者 | 启动 gateway 后 POST `/messages`，再打开 Dashboard 或 GET `/api/audit` | 顶部健康条显示 ok/warn/fail；Gateway Mutation Audit 有记录；audit 不含正文或 token |
| E1C Gateway event stream 与 scoped token | ready | 本地接入层验证者 | 启动带 `MYCLAW_GATEWAY_SCOPED_TOKENS` 的非 loopback gateway，分别用 message/control/events token 测 `/messages`、`/api/status`、`/api/events/stream` | 错 scope 返回 `insufficient_scope`；events token 只能读 stream；control token 读控制面；SSE snapshot 不含 Feishu 明文或 token |
| E2 Feishu custom-bot outbound | needs_config | 飞书群机器人配置者 | `npm run myclaw -- send --channel feishu-webhook --webhook-url "$MYCLAW_FEISHU_WEBHOOK_URL" --text "hello" --json` | 飞书群收到消息，result code 为 0 |
| E2A Openduck Feishu credential presence | ready | 飞书测试群配置验证者 | `npm run import:openduck -- --json`；`set -a; source .myclaw/openduck-feishu.env; set +a; npm run myclaw -- dashboard --port 4321 --openclaw-source $MYCLAW_OPENCLAW_SOURCE` | 导入输出不含 secret 值；Dashboard 显示 app credentials ready、websocket runtime ready、app-token outbound ready；`.myclaw/` 仍 ignored |
| E2B Feishu WebSocket 群消息自动回复 | ready | 飞书测试群使用者 | 先确认 `.myclaw/feishu-policy.json` 有 allowedChatIds，再 `set -a; source .myclaw/openduck-feishu.env; set +a; npm run myclaw -- feishu-bot --reply-prefix "MyClaw 收到了" --reply-mode direct`；在群里发文本 | 群里直接收到 `MyClaw 收到了：...`，不是话题回复；Dashboard 最近 Runs 出现脱敏后的 `fb_*` |
| E2C Feishu hardening 与隐私读接口 | ready | 安全审阅者 | `node --test packages/feishu-bot/test/feishu-bot.test.mjs packages/control-plane/test/http-routes.test.mjs`；检查 `.myclaw/feishu-policy.json` ignored | 默认无 policy 时会跳过；重复 event 只回复一次；API 中正文、chat_id、sender_id 为 `[redacted]` |
| E3 Feishu callback 本地校验 | needs_config | 集成验证者 | 启动 gateway 后 POST `/feishu/events` challenge，再跑 `npm test -- packages/gateway/test/gateway.test.mjs` | challenge 回显；签名错误和 encrypted fixture 由测试覆盖 |
| E4 OpenClaw 迁移 stage | ready | 迁移审阅者 | `npm run myclaw -- migrate openclaw --source $MYCLAW_OPENCLAW_SOURCE --stage --json` | stage 带 approval，review-only，不修改运行时 |
| E5 审批队列 | ready | 安全审阅者 | 用 token POST `/api/openclaw-migration/stage`，GET `/api/approvals`，POST `/api/approvals/<id>/decision` | pending approval 出现，decision 写入 record 和 event |
| E5B Tool approval smoke | ready | 安全审阅者 | POST `/api/tool-requests/smoke-note`，GET `/api/approvals`，approve/reject 后 GET `/api/tool-requests` | pending tool-action 出现；approved 才写 `tool-runs/...`；rejected 的 result 为 null |
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
- Dashboard/Control payload 的 phase 更新到 1.6，新增 E5B tool approval smoke 实验。
- 新增 `packages/core/src/audit.mjs`，用本地 JSONL 记录 Gateway mutation audit。
- Gateway 对 `/messages`、`/api/openclaw-migration/stage`、approval decision 和 Feishu callback 写 audit，不保存请求正文或 token 值。
- Control-plane 新增 `/api/audit`，`/api/status` 内联 health 与 audit。
- Dashboard 顶部新增运行健康条，覆盖 Control API、state、HTML Center、Feishu adapter 和 mutation auth。
- Dashboard 新增 Gateway Mutation Audit 面板，用于查看最近写操作、状态码和 actor 类型。
- Control-plane 新增 `packages/control-plane/src/event-stream.mjs`，`GET /api/events/stream` 发送脱敏 snapshot 和 heartbeat。
- Gateway 非 loopback 控制面 GET 统一走 read auth；`events:read` 只读 stream，`control:read` 读状态控制面，legacy gateway token 仍是 `*`。
- Dashboard 通过同源 `EventSource("/api/events/stream")` 显示 stream snapshot/heartbeat，并随 heartbeat 自动刷新状态。
- 新增 `packages/tools/src/smoke-note.mjs`，把安全本地 tool request 接入 approval；只有 approved 后写相对路径 `tool-runs/...`，rejected 不执行。
- Gateway 新增 `POST /api/tool-requests/smoke-note` 和 `GET /api/tool-requests`，mutation 需要 `tool:request` 或 legacy mutation scope。
- Dashboard/Control payload 新增 L0-L6 分层路线，并新增 E8/E9/E10 作为后续 session provenance、agent 协作和长期记忆实验占位。
- 新增 control-plane invariant test，约束 layer 顺序、实验引用和 ready 状态，避免路线状态漂移。
- 新增本地人类测试手册 `docs/modules/human-testing-playbook.md`，把大方向、参与阶段、全流程测试路径和反馈格式固定下来。
- 新增 `scripts/import-openduck-config.mjs` 和 `npm run import:openduck`，从 `~/.openduck/openclaw.json` 生成本地 `.myclaw/openduck-feishu.env`，输出只包含变量名与缺失项，并拒绝写出 `.myclaw/` 之外。
- 新增 `scripts/check-local-secret-leaks.mjs`，`npm run check` 会扫描本地 `.myclaw/*.env` 中的敏感值是否出现在 git tracked 或 untracked 文件。
- 新增 `packages/feishu-bot` 插件包，独立封装 Feishu SDK WebSocket、EventDispatcher、app-token text reply 和默认 reply policy。
- Feishu bot 新增 ingress policy：默认无策略时封闭并跳过消息；支持 allowed chat、allowed sender、require mention、显式 `unsafeOpenIngress` 测试开关、unsupported message skip，并且 Feishu app API 业务失败会写 `feishu.bot.reply.failed`，不会误报 completed。
- Feishu bot 默认改为 `reply-mode direct`，用 chat message create 直接在群里发消息；只有显式 `--reply-mode thread` 才走话题回复。
- Feishu bot 新增 persistent replay store，重启后同一 Feishu event 不会重复回复；失败事件会标记 failed，后续可重试。
- Feishu bot 默认读取 ignored 的 `.myclaw/feishu-policy.json`，用于本地配置 allowed chat、allowed sender、require mention。
- Control-plane read API 对 Feishu run 脱敏：正文、chat_id、sender_id、reply raw 不再进入 Dashboard/API 明文输出。
- 新增 `packages/feishu-bot/myclaw.plugin.json`，先把插件 capability contract 固定下来，后续再做通用 loader。
- CLI 新增 `myclaw feishu-bot`，用于启动长连接群消息自动回复；主线 runtime/gateway 不直接依赖 Feishu SDK。
- 已停止 openduck 的 launchd job `ai.openclaw.gateway.second`；仍在运行的 `ai.openclaw.gateway` 未动。

## 当前能力边界

| 能力 | 状态 | 边界 |
|---|---|---|
| HTML Center | 已恢复 | 有仓库命令和 doctor health；还没有自动告警 |
| 结构红线 | 已强制 | 作用于 repo 当前文本文件，不扫描 `.git/.myclaw/node_modules` |
| 生成物新鲜度 | 已强制 | `npm run check` 会重建并检测 HTML 生成物 diff |
| 目录文件数 | 已强制 | 每个目录最多 20 个直接文件 |
| 目录深度 | 已强制 | 从 repo root 计算，最多 4 层目录 |
| 文件行数 | 已强制 | 单文件最多 500 行，450 行以上预警 |
| Openduck 配置导入 | 已可用 | 只写 ignored 的 `.myclaw/openduck-feishu.env`；不会把 secret 写进代码、文档、日志或 HTML report |
| Feishu WebSocket bot | 已可用 | 默认直接群消息回复；无 policy 时默认跳过；已支持本地 policy 文件、persistent replay 和 read redaction；缺 rich card 和 agent replyBuilder |
| Gateway mutation audit | 已可用 | 记录动作、状态码、actor 类型和资源类型；不保存 request body、token 或 secret |
| Dashboard health strip | 已可用 | 读取 `/api/status` 的 health payload；HTML Center 失败会显示 warn，不阻断 Dashboard |
| Gateway event stream | 已可用 | SSE snapshot/heartbeat，可驱动 Dashboard 自动刷新；还没有 seq/replay/delta |
| Gateway scoped token | 已可用 | 支持 `message:write`、`events:read`、`control:read` 和 legacy `*`；非 loopback 控制面 GET 需要 read scope |
| Tool approval smoke | 已可用 | 只支持 safe local note tool；approved 才写 `tool-runs/...`，还没有通用 tool schema/policy/sandbox |

## 你现在可以测试什么

| 测试入口 | 推荐程度 | 目的 |
|---|---|---|
| E0 本地消息闭环 | 现在就测 | 确认最小消息管线没坏 |
| E1 Dashboard | 现在就测 | 看当前阶段、审批队列、实验路线 |
| E1B Dashboard health/audit | 现在就测 | 看服务健康、Gateway 写操作审计、token/正文不泄露 |
| E1C Gateway stream/scoped token | 现在就测 | 看 stream 连接、Dashboard 自动刷新、非 loopback read plane 鉴权 |
| E2A Openduck Feishu credential presence | 现在就测 | 验证备份飞书群 app credentials 能被 MyClaw 识别 |
| E2B Feishu WebSocket 群回复 | 现在就测 | 你在备份飞书群发文本，确认 MyClaw 自动回复 |
| E2C Feishu hardening | 现在就测 | 确认重复事件、policy 文件和 Dashboard/API 脱敏 |
| E4 OpenClaw stage | 现在就测 | 确认迁移仍是 review-only |
| E5 审批队列 | 现在就测 | 亲自 approve/reject 一条记录 |
| E5B Tool approval smoke | 现在就测 | 验证工具请求必须先审批，approved 才执行，rejected 不执行 |
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
npm run import:openduck -- --json
npm run publish:review
npm test
npm run myclaw -- send --text "hello from human" --json
npm run myclaw -- feishu-bot --reply-prefix "MyClaw 收到了" --reply-mode direct --allowed-chat-ids "$MYCLAW_FEISHU_ALLOWED_CHAT_IDS"
node --test packages/feishu-bot/test/feishu-bot.test.mjs packages/control-plane/test/http-routes.test.mjs
npm run myclaw -- migrate openclaw --source $MYCLAW_OPENCLAW_SOURCE --stage --json
npm run myclaw -- dashboard --port 4321 --openclaw-source $MYCLAW_OPENCLAW_SOURCE
MYCLAW_GATEWAY_TOKEN=dev-token npm run myclaw -- gateway --port 4322 --openclaw-source $MYCLAW_OPENCLAW_SOURCE
MYCLAW_GATEWAY_SCOPED_TOKENS='[{"token":"message-token","scopes":["message:write"]},{"token":"events-token","scopes":["events:read"]},{"token":"control-token","scopes":["control:read"]}]' npm run myclaw -- gateway --host 0.0.0.0 --port 4322 --openclaw-source $MYCLAW_OPENCLAW_SOURCE
set -a; source .myclaw/openduck-feishu.env; set +a; npm run myclaw -- dashboard --port 4321 --openclaw-source $MYCLAW_OPENCLAW_SOURCE
set -a; source .myclaw/openduck-feishu.env; set +a; npm run myclaw -- feishu-bot --reply-prefix "MyClaw 收到了" --reply-mode direct
curl -s http://127.0.0.1:4322/api/approvals
curl -s http://127.0.0.1:4322/api/tool-requests/smoke-note -H "content-type: application/json" -H "x-myclaw-token: dev-token" -d '{"note":"human approval smoke"}'
curl -s http://127.0.0.1:4322/api/tool-requests
curl -s http://127.0.0.1:4322/api/audit
curl -N http://127.0.0.1:4322/api/events/stream -H "x-myclaw-token: events-token"
```

## 下一步

1. 把 safe smoke tool 提升成通用 `ToolDescriptor`、policy snapshot 和 sandbox dispatch。
2. 再补 Feishu rich card 和 agent replyBuilder 安全边界。
3. 拆 Dashboard renderer 和 docs builder，避免接近 450 行。
4. 再补 L3：Agent runtime 最小 run/resume/tool loop。
5. 再补 L4：Session Search / Provenance，确保 run/step/tool result 可追溯。

## 验证记录

```bash
npm run check
npm test
```

验证结果：

- `npm run check` 通过，输出 `Generated docs are up to date.`、`Structure check passed: 127 files, max 500 lines, 20 files/dir, depth 4.`、`Doc phase sync check passed.` 与 `Local secret leak check passed.`
- `npm test` 通过，新增覆盖 tool approval smoke、Gateway scoped token、非 loopback read auth、SSE snapshot、Dashboard stream 和 control-plane SSE Feishu redaction。
- 结构快照：当前最大目录文件数仍低于 20；当前最大目录深度仍为 4。
