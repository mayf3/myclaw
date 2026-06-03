# MyClaw 阶段状态

更新时间：2026-06-03

## 当前阶段

Phase 1.7: LLM Reply Smoke。

当前进度：M0 本地消息闭环完成；M1 Gateway/Dashboard 已有 health strip、mutation audit、`/api/audit`、`/api/events/stream` 和 scoped token；M2 Feishu/Lark 已能在备份群直接文本回复，并有默认封闭 ingress、本地 policy、persistent replay 和 read redaction；M3 OpenClaw 迁移仍是 review-only stage；M4 已有 migration approval queue、safe tool approval smoke 和真实 OpenAI Responses 单轮回复；M6 工程约束已落地到 `npm run check`；M7 已把路线改成分层人类测试图。

本轮新增：`myclaw ask` 可以调用 OpenAI Responses 产生真实 LLM 文本回复，结果写入 `ask_*` run；Feishu bot 增加显式 `--reply-provider llm --llm-privacy-ack` 模式。默认 Feishu bot 仍不会把群消息送到 LLM，必须由人明确切换和确认隐私边界。

还不能做：LLM 还不能调用工具、读文件、写文件、跑 shell 或访问记忆。下一阶段才会做 ToolDescriptor、policy snapshot、durable dispatch 和模型工具循环。

## 用户可参与 Milestones

| Milestone | 状态 | 完成度 | 你可以怎么测 |
|---|---|---:|---|
| M0 本地消息闭环 | done | 100 | 跑 E0，确认 CLI send 写入 run/event |
| M1 Gateway 与 Dashboard | partial | 92 | 跑 E1/E1B/E1C，打开 Dashboard 看阶段、健康、audit、stream、run、实验路线、审批 |
| M2 Feishu/Lark 边界 | partial | 88 | 跑 E2B/E2C：在备份飞书群发消息，看自动回复和脱敏 run |
| M3 OpenClaw 迁移 | partial | 65 | 跑 E4，确认 stage review 是 review-only |
| M4 Agent Runtime 与审批 | partial | 48 | 跑 E5/E5B/E6A，确认审批、safe tool smoke 和真实 LLM 单轮回复 |
| M5 记忆、搜索与插件 | planned | 8 | 等 E6/E8 开放，验证工具循环、session search 和记忆 |
| M6 工程约束与技术债 | done | 100 | 跑 E7，确认结构红线由 `npm run check` 强制 |
| M7 分层交互测试路线 | partial | 45 | 看 L0-L6，每层都有实验入口；E8-E10 仍未开放 |

## 分层测试路线

| 层 | 重点 | 当前状态 | 你可以测什么 |
|---|---|---|---|
| L0 接入层 | CLI、webhook、Feishu/Lark inbound/outbound 归一化 | partial | E0/E2A/E2B/E2C 现在可测；E2/E3 配置后可测 |
| L1 Gateway | HTTP 控制面、鉴权、状态查询、事件进入、SSE 事件流和 mutation audit | partial | E1/E1B/E1C/E5/E5B 现在可测 |
| L2 Workflow 与审批 | 迁移和后续工具调用进入 review/approval | partial | E4/E5/E5B 现在可测 |
| L3 单 Agent Runtime | 真实回复、后续任务拆解、工具调用、失败重试、人工确认 | partial | E6A 现在可测真实 LLM 回复；E6 工具循环后续开放 |
| L4 Session Search / Provenance | run、step、tool result 可检索，召回来源可解释 | planned | E8 后续开放 |
| L5 Agent-to-Agent | 多 agent 分工、交接上下文、互相 review | planned | E9 后续开放 |
| L6 Long Memory / Search | 长期事实、来源解释、遗忘策略和跨会话召回 | planned | E10 后续开放 |

## Human Experiments

| 实验 | 状态 | 角色 | 命令或入口 | 成功信号 |
|---|---|---|---|---|
| E0 本地消息闭环 | ready | 本机使用者 | `npm run myclaw -- send --text "hello from human" --json` | 返回 ok envelope，Dashboard 最近 Runs 有记录 |
| E1 Dashboard 可读性 | ready | 产品试用者 | `npm run myclaw -- dashboard --port 4321 --openclaw-source $MYCLAW_OPENCLAW_SOURCE` 后打开 `http://127.0.0.1:4321` | Phase 1.7、Human Experiments、Approvals 可见 |
| E1B Dashboard health 与 Gateway audit | ready | 本地运维观察者 | 启动 gateway 后 POST `/messages`，再打开 Dashboard 或 GET `/api/audit` | 顶部健康条显示 ok/warn/fail；audit 不含正文或 token |
| E1C Gateway event stream 与 scoped token | ready | 本地接入层验证者 | 启动带 `MYCLAW_GATEWAY_SCOPED_TOKENS` 的非 loopback gateway，分别测 `/messages`、`/api/status`、`/api/events/stream` | 错 scope 返回 `insufficient_scope`；SSE snapshot 脱敏 |
| E2A Openduck Feishu credential presence | ready | 飞书测试群配置验证者 | `npm run import:openduck -- --json`；再加载 `.myclaw/openduck-feishu.env` 启 Dashboard | 输出不含 secret 值；Dashboard 显示 app credentials/runtime/outbound ready |
| E2B Feishu WebSocket 群消息自动回复 | ready | 飞书测试群使用者 | `set -a; source .myclaw/openduck-feishu.env; set +a; npm run myclaw -- feishu-bot --reply-prefix "MyClaw 收到了" --reply-mode direct` | 群里直接收到确定性回复，不是话题回复；`fb_*` run 脱敏 |
| E2C Feishu hardening 与隐私读接口 | ready | 安全审阅者 | `node --test packages/feishu-bot/test/feishu-bot.test.mjs packages/control-plane/test/http-routes.test.mjs` | 默认无 policy 时跳过；重复 event 只回复一次；API 脱敏 |
| E3 Feishu callback 本地校验 | needs_config | 集成验证者 | 启动 gateway 后 POST `/feishu/events` challenge，再跑 gateway tests | challenge 回显；签名错误和 encrypted fixture 由测试覆盖 |
| E4 OpenClaw 迁移 stage | ready | 迁移审阅者 | `npm run myclaw -- migrate openclaw --source $MYCLAW_OPENCLAW_SOURCE --stage --json` | stage 带 approval，review-only，不修改运行时 |
| E5 审批队列 | ready | 安全审阅者 | 用 token POST `/api/openclaw-migration/stage`，GET `/api/approvals`，POST decision | pending approval 出现，decision 写入 record 和 event |
| E5B Tool approval smoke | ready | 安全审阅者 | POST `/api/tool-requests/smoke-note`，approve/reject 后 GET `/api/tool-requests` | pending tool-action 出现；approved 才写 `tool-runs/...`；rejected 不执行 |
| E6A LLM Reply Smoke | ready | 真实智能回复测试者 | `OPENAI_API_KEY=... npm run myclaw -- ask --text "用三句话介绍 MyClaw" --json` | 返回 provider=`openai-responses`、answer、toolCalls=[]；缺 key 时返回 `llm_config_required` |
| E6 单 Agent Runtime | planned | 长期使用者 | 后续 `myclaw run --task ...` | step timeline、tool call、失败重试和人工确认可追踪 |
| E7 工程约束红线 | ready | 协作开发者 | `npm run check` | 生成物 up to date，500 行、20 文件/目录、depth 4 全部通过 |
| E8 Session Search / Provenance | planned | 长期使用者 | 后续 `myclaw search "..."` | 检索结果带 runId/stepId/messageId 和来源 |
| E9 Agent-to-Agent 协作 | planned | 协作任务测试者 | 后续 `myclaw run --task "..." --agents 2 --json` | 两个 agent 有独立 run/step，交接和 review 可追踪 |
| E10 Long Memory / Search | planned | 长期使用者 | 后续 `myclaw memory add/search/delete ...` | 召回结果带来源，可删除或禁用记忆 |

## 本轮已完成

- 新增 `packages/llm/src/openai-responses.mjs`，封装 OpenAI Responses 调用、timeout、`store:false`、usage 归一化和 missing key 错误。
- 新增 `packages/agent/src/ask.mjs`，提供单轮 `askAgent`，写入 `ask_*` run、事件、usage、answer 和 `toolCalls: []`。
- CLI 新增 `myclaw ask --text ... [--model] [--json]`。
- Feishu bot CLI 新增 `--reply-provider llm --llm-privacy-ack`，只有显式开启并确认隐私边界时才把群消息交给 LLM。
- Dashboard health 新增 `llm-provider`，只显示是否配置 key 和模型名，不显示 key。
- control-plane 默认只暴露 LLM answer 长度型 preview，不通过 Dashboard/API 输出完整 answer。
- state 摘要支持 agent answer，但不保存用户输入明文摘要，只记录长度型 redacted preview。
- 新增 llm/agent/cli 测试，确认 missing key 不伪造回复、OpenAI request 不返回 API key、run 事件不含 prompt/secret。

## 当前能力边界

| 能力 | 状态 | 边界 |
|---|---|---|
| LLM 回复 | 已可测 | 单轮文本 answer；不支持工具调用、上下文检索、长期记忆或 streaming |
| Feishu LLM 回复 | 显式可测 | 必须 `--reply-provider llm --llm-privacy-ack`；默认仍是确定性 reply policy |
| HTML Center | 已恢复 | 有仓库命令和 doctor health；还没有自动告警 |
| 结构红线 | 已强制 | 单文件最多 500 行，目录最多 20 个直接文件，目录深度最多 4 |
| Openduck 配置导入 | 已可用 | 只写 ignored 的 `.myclaw/openduck-feishu.env`；不会把 secret 写进代码、文档、日志或 HTML report |
| Feishu WebSocket bot | 已可用 | 默认直接群消息回复；无 policy 时默认跳过；缺 rich card 和 agent replyBuilder |
| Gateway mutation audit | 已可用 | 记录动作、状态码、actor 类型和资源类型；不保存 request body、token 或 secret |
| Gateway event stream | 已可用 | SSE snapshot/heartbeat；还没有 seq/replay/delta |
| Tool approval smoke | 已可用 | 只支持 safe local note tool；approved 才写 `tool-runs/...`；还没有通用 tool schema/policy/sandbox |

## 你现在可以测试什么

| 测试入口 | 推荐程度 | 目的 |
|---|---|---|
| E6A LLM Reply Smoke | 现在就测 | 开始测试真实 LLM 回复，不再是非智能 echo |
| E2B Feishu 确定性群回复 | 现在就测 | 保留低风险群内通信回归 |
| Feishu LLM 模式 | 准备好 key 后测 | 用备份群测试真实智能回复，但必须显式启动 `--reply-provider llm --llm-privacy-ack` |
| E1 Dashboard | 现在就测 | 看当前阶段、LLM provider health、审批队列、实验路线 |
| E5B Tool approval smoke | 现在就测 | 验证工具请求必须先审批，approved 才执行 |
| E7 工程约束 | 现在就测 | 验证技术债红线会挡住超限结构 |
| E6 单 Agent 工具循环 | 还不能测 | 下一阶段实现 ToolDescriptor/durable dispatch/model tool calling |
| E8/E9/E10 | 还不能测 | 需要 session provenance、agent runtime 和 memory store |

## 当前可用命令

```bash
npm run check
npm test
npm run myclaw -- ask --text "用一句话介绍 MyClaw 当前进度" --json
OPENAI_API_KEY= npm run myclaw -- ask --text "missing key smoke" --json
npm run myclaw -- dashboard --port 4321 --openclaw-source $MYCLAW_OPENCLAW_SOURCE
MYCLAW_GATEWAY_TOKEN=dev-token npm run myclaw -- gateway --port 4322 --openclaw-source $MYCLAW_OPENCLAW_SOURCE
set -a; source .myclaw/openduck-feishu.env; set +a; npm run myclaw -- feishu-bot --reply-prefix "MyClaw 收到了" --reply-mode direct
set -a; source .myclaw/openduck-feishu.env; set +a; npm run myclaw -- feishu-bot --reply-provider llm --llm-privacy-ack --reply-mode direct
curl -s http://127.0.0.1:4321/api/status
curl -s http://127.0.0.1:4322/api/tool-requests
curl -N http://127.0.0.1:4322/api/events/stream -H "x-myclaw-token: events-token"
```

## 下一步

1. 把 safe smoke tool 提升成通用 `ToolDescriptor`、policy snapshot 和 sandbox dispatch。
2. 把 OpenAI Responses 接到模型工具调用循环，但只暴露 policy 裁剪后的工具。
3. 为 ToolRequest 增加 durable claim/recovery、idempotency key、timeout、failed/retry/cancelled 状态。
4. 拆 Dashboard renderer 和 docs builder，避免接近 450 行。
5. 再补 L4：Session Search / Provenance，确保 run/step/tool result 可追溯。

## 验证记录

```bash
node --check packages/llm/src/openai-responses.mjs packages/agent/src/ask.mjs packages/cli/src/index.mjs packages/cli/src/reply-builder.mjs
node --test packages/llm/test/openai-responses.test.mjs packages/agent/test/ask.test.mjs packages/cli/test/ask.test.mjs packages/dashboard/test/dashboard.test.mjs
```

最终提交前还必须跑：

```bash
npm run check
npm test
```
