# MyClaw 当前实现架构评审

更新时间：2026-05-17

## 总诊断

当前实现已经进入 Phase 0.3：MyClaw 有了 public GitHub 基线、共享 message runtime、gateway-backed dashboard，以及最小 HTTP inbound `POST /messages`。这一步把“本地能看状态”和“外部能送消息进来”合到了同一个控制面，是接 Feishu/Lark event adapter 前正确的最小闭环。

最大问题也很直接：gateway 还没有 token/auth、Feishu 签名校验和 event id 幂等，所以它只能作为本机开发入口；不能绑定公网，也不能直接作为飞书正式回调入口。

## 当前实现架构

| 模块 | 当前职责 | 阶段判断 | 不应扩大的职责 |
|---|---|---|---|
| `packages/core/src/envelope.mjs` | 生成 run id、event、ok/failed envelope | P0 稳定边界 | 不感知 Feishu、CLI、HTTP、dashboard |
| `packages/core/src/state.mjs` | 写入和读取 runs/events | P0.2 稳定边界 | 不做复杂查询和权限 |
| `packages/channels/src/index.mjs` | 注册 channel、解析 alias、声明能力、send、normalize inbound | P0.1 稳定边界 | 不跑 workflow、不调 LLM |
| `packages/runtime/src/messages.mjs` | 共享 send/receive/reply pipeline | P0.3 新增核心复用层 | 不处理 HTTP、CLI 参数或 UI |
| `packages/gateway/src/index.mjs` | 本地 HTTP gateway，接 `POST /messages` | P0.3 新增 inbound 控制面 | 不直接接公网、不做 agent runtime |
| `packages/dashboard/src/index.mjs` | Dashboard HTML 和只读状态 API | P0.2/P0.3 控制台视图 | 不执行危险 mutation |
| `packages/migrate/src/openclaw.mjs` | OpenClaw dry-run 迁移评估 | P0.2 稳定边界 | 不直接 apply runtime |
| `packages/cli/src/index.mjs` | 命令编排和服务启动 | P0.3 编排入口 | 不承载业务状态机 |

## 系统架构图

```text
User / Feishu future callback / local script
  -> CLI commands --------------------------.
  -> Gateway HTTP POST /messages --------.  |
                                          v  v
                                    packages/runtime
                                          |
                            ChannelAdapter registry/hook
                         .----------------+----------------.
                         v                                 v
                   console adapter                 feishu-event adapter (next)
                         |                                 |
                         v                                 v
                  core envelope/events              Feishu verification/idempotency
                         |
                         v
               core state JSON + JSONL
                         |
             .-----------+------------.
             v                        v
       control-plane status       migrate openclaw plan
             |                        |
             v                        v
        dashboard HTML          OpenClaw config/plugins
```

插件和 hook 边界：

- `ChannelAdapter registry` 是消息入口的扩展点。
- `packages/runtime` 是 CLI 和 gateway 共用的业务 pipeline。
- `packages/control-plane` 是 dashboard/gateway 共用的状态聚合层。
- `packages/migrate` 只产生 plan，不直接启用 OpenClaw runtime。

代码依赖关系：

```text
packages/cli
  -> packages/runtime
  -> packages/gateway
  -> packages/migrate
  -> packages/channels
  -> packages/core

packages/gateway
  -> packages/dashboard render view
  -> packages/control-plane status
  -> packages/runtime

packages/dashboard
  -> packages/control-plane status
```

## 数据流水线流程图

CLI outbound/inbound:

```text
myclaw send / myclaw receive
  -> packages/runtime.sendMessage/receiveMessage
  -> ChannelAdapter
  -> envelope events
  -> state/runs/<runId>.json + events.jsonl
```

HTTP inbound:

```text
POST /messages
  -> parse JSON
  -> receiveMessage({ source: "gateway" })
  -> ChannelAdapter.normalizeInbound
  -> optional ChannelAdapter.send(reply)
  -> envelope
  -> state JSON/JSONL
  -> HTTP JSON response
```

Dashboard:

```text
GET /
  -> dashboard HTML
  -> fetch /api/status
  -> listRuns + readEvents + listChannels + planOpenClawMigration
  -> render runs/events/channels/migration risk
```

GitHub 阶段发布：

```text
stage implementation
  -> npm run check
  -> npm test
  -> docs/build-review-html.mjs
  -> git commit
  -> git push origin main
  -> HTML Center publish
```

## 目录结构与文件行数

```text
myclaw/
  packages/
    core/             envelope、state、runs/events 读写
    channels/         ChannelAdapter registry
    runtime/          send/receive/reply pipeline
    gateway/          HTTP ingress 与 dashboard 托管
    dashboard/        HTML view 与 standalone dashboard server
    control-plane/    status/runs/events/migration 聚合
    migrate/          OpenClaw dry-run plan
    cli/              命令入口
  docs/               HTML design review report
  scripts/            repo 约束检查
```

| 文件 | 行数 | 职责 | 处理 |
|---|---:|---|---|
| `docs/build-review-html.mjs` | 398 | 生成模块化 HTML report | 已从 523 行拆出 `docs/lib/module-meta.mjs` |
| `packages/migrate/src/openclaw.mjs` | 348 | OpenClaw migration dry-run planner | 低于 500；后续 parser 可拆 |
| `docs/design-review.md` | 345 | 总体设计评审 | 低于 500 |
| `docs/index.html` | 321 | 全局 HTML 索引 | 已从 610 行压缩到 321 行 |
| `docs/modules/initial-mvp-plan.md` | 315 | 初期方案 | 低于 500 |
| `packages/dashboard/src/index.mjs` | 287 | Dashboard HTML view 与 standalone server | 低于 500；后续拆 template/client script |
| `packages/cli/src/index.mjs` | 298 | CLI 编排 | 低于 500；后续按 command 拆分 |

硬性规则：所有手写源文件和文档文件必须 `<=500` 行；`>=450` 行必须拆分或压缩。`npm run check` 已接入 `scripts/check-file-lines.mjs`，默认不豁免生成 HTML。

## 概念解释

| 概念 | 当前定义 | 边界 |
|---|---|---|
| Gateway | 本地 HTTP 控制面，当前承载 dashboard 和 `POST /messages` | 不做 agent runtime，不绑定公网 |
| Dashboard | 操作员查看状态、runs、events、migration risk 的 HTML view | 不直接执行业务 mutation |
| Runtime | CLI 与 gateway 共用的 send/receive/reply pipeline | 不解析 HTTP，不处理 UI |
| ChannelAdapter | 通道扩展点，负责 send 和 inbound normalize | 不写 state，不跑 workflow |
| Control Plane | 聚合 status/runs/events/migration 的只读服务层 | 不渲染 HTML |
| Migration Plan | OpenClaw 配置和插件的 dry-run inventory | 不读取 secret 实值，不 apply |
| State Store | JSON/JSONL run 和 event 持久化 | 暂不承担复杂查询 |

## 相似技术比较

| 设计点 | MyClaw 当前选择 | 相似技术 | 取舍 |
|---|---|---|---|
| HTTP 服务 | 裸 `node:http` | Fastify / Express | 依赖少、可控；schema、plugin、middleware 需要后续补 |
| 状态存储 | JSON + JSONL | SQLite / Litestream / event store | 启动快、可审计；查询能力弱，后续需要索引 |
| 通道扩展 | `ChannelAdapter` registry | OpenClaw channel plugins / Bot framework adapters | 边界轻；还没有 manifest 和运行时隔离 |
| Dashboard | 内联 HTML view | Vite/React dashboard | 零构建；交互复杂后需要拆模板和 client script |
| 迁移 | plan/stage/apply | Terraform plan/apply / OpenClaw config patch | 可审计、可回滚；短期不能“一键立即运行” |

## 请求-响应图

Gateway `/messages`：

```text
POST /messages
  request: { channel, from, conversation, text, reply? }
  -> handleGatewayRequest
  -> handlePostMessage
  -> receiveMessage
  -> recordRun
  response: envelope
```

Gateway `/api/status`：

```text
GET /api/status
  -> dashboard handler
  -> resolveStateDir
  -> listRuns(limit=20)
  -> readEvents(limit=50)
  -> listChannels()
  -> planOpenClawMigration()
  -> JSON payload
```

## 状态流图

```text
message ingress
  -> message.receive.started
  -> message.receive.completed
  -> message.reply.started        如果请求带 reply
  -> message.reply.completed
  -> ok

message ingress failure
  -> message.receive.started
  -> message.receive.failed
  -> failed envelope
```

Git 状态：

```text
Phase 0.2 baseline
  -> commit 0d15020
  -> public repo mayf3/myclaw
  -> Phase 0.3 working tree
  -> next commit + push
```

## 严重问题

| 问题 | 影响 | 证据 | 修复建议 |
|---|---|---|---|
| gateway 无鉴权 | 绑定非本机地址时可能被任意写入 message run | `POST /messages` 当前不检查 token | 默认继续 loopback；下一阶段加 token/mutation guard |
| Feishu event 未校验 | 不能直接作为正式飞书回调 | `POST /messages` 只接受通用 JSON | 新增 Feishu event adapter，处理 challenge、签名、event id |
| OpenClaw 仍不能 apply | migration 只做 inventory，不迁移 runtime | `migrate openclaw` 输出 unsupported surfaces | 继续 plan/stage/apply，先做 Feishu 模块 |

## 主要问题

| 问题 | 影响 | 证据 | 修复建议 |
|---|---|---|---|
| dashboard 仍包含大段 HTML 字符串 | 后续 UI 复杂后难测、难维护 | `packages/dashboard/src/index.mjs` 内联 HTML/CSS/JS | 拆 view template 和 client script |
| state 仍是 JSONL 文件查询 | runs 多时 dashboard 会变慢 | `listRuns` 读取 run JSON 文件 | Phase 1 增加索引或 SQLite |
| request body schema 是手写校验 | 错误反馈和类型演进有限 | gateway 手写 `readJsonBody` 和字段检查 | 后续用 schema/Zod 风格 contract |
| migration parser 是 best-effort JSON5 | 复杂 OpenClaw config 可能无法完整解析 | `stripJson5` 是轻量实现 | plan 阶段保留 raw config，后续引入正式 JSON5 parser |

## 细节问题

| 问题 | 影响 | 修复建议 |
|---|---|---|
| dashboard UI 还没有 message form | 需要 curl 才能测试 gateway | 增加本地发送表单和响应预览 |
| CLI 参数解析仍较轻 | 错误提示和布尔参数边界有限 | Phase 1 引入 schema/parser |
| HTML report 和源码同仓库 | repo 会较大，但当前有利于 public review | 后续考虑 GitHub Pages 或独立 docs 发布 |

## OpenClaw 一键迁移方案

Phase 0.3 对一键迁移的意义是补上控制面，而不是直接 apply。推荐顺序不变：

```text
plan
  -> dashboard review
  -> stage snapshot
  -> apply --module feishu
  -> apply providers/tools/memory by module
```

接下来可把 `migrate openclaw --output plan.json` 的结果在 dashboard 中展示，并提供只读 diff。等 Feishu event adapter 可运行后，再实现 `--apply --module feishu`。

## Linus 视角严苛审查

独立 subagent 已按“30 年 Linux 内核维护经验”做过审查，结论摘要：

- 之前报告不通过：缺少系统架构图、数据流水线、目录结构、文件行数、概念解释和技术比较。
- 之前实现有边界倒挂：gateway 直接依赖 dashboard handler，dashboard 同时聚合 state/channels/migration。
- 已修复：新增 `packages/control-plane`，gateway/dashboard 共用状态聚合；新增行数检查；补齐架构图、流水线、目录/行数、概念表和比较表。
- 仍需修复：gateway 无鉴权、Feishu event adapter 未实现、dashboard HTML 仍是一段内联字符串、`/messages` body schema 仍手写。

## 证据

| 证据 | 位置 | 说明 |
|---|---|---|
| public repo | `https://github.com/mayf3/myclaw` | Phase 0.2 已推送到 GitHub public 仓库 |
| runtime pipeline | `packages/runtime/src/messages.mjs` | CLI 和 gateway 共享 send/receive/reply |
| gateway 服务 | `packages/gateway/src/index.mjs` | `GET /api/health`、`POST /messages`、dashboard GET delegation |
| dashboard 视图 | `packages/dashboard/src/index.mjs` | 展示 runs/events/channels/migration 和 gateway 示例 |
| control-plane 状态层 | `packages/control-plane/src/status.mjs` | gateway/dashboard 共用 status/runs/events/migration 聚合 |
| 行数检查 | `scripts/check-file-lines.mjs` | `npm run check` 强制单文件不超过 500 行 |
| CLI commands | `packages/cli/src/index.mjs` | `dashboard` 和 `gateway` 均启动 gateway-backed 控制面 |
| 测试覆盖 | `packages/gateway/test/gateway.test.mjs`、`packages/runtime/test/messages.test.mjs` | 验证 HTTP ingress 和 runtime 复用 |
| 阶段状态 | `docs/stage-status.md` | 记录 Phase 0.3 当前范围、风险和下一步 |

## 实现风险

| 风险 | 当前等级 | 应对 |
|---|---|---|
| gateway 被误当公网服务 | 高 | 文档明确本机开发；下一阶段加 token/auth |
| Feishu shape 直接塞进 generic message | 中 | 新增 `feishu-event` adapter，不污染 console adapter |
| dashboard/gateway 包边界倒挂 | 中 | 后续抽 control-plane handler，dashboard 只做 view |
| JSONL 查询扩展性不足 | 中 | Phase 1 后增加 SQLite/FTS 或 run index |

## 修复优先级

| 优先级 | 任务 | 验收标准 |
|---|---|---|
| P0 | Feishu event adapter spike | 能处理 challenge 和一条文本消息事件样例 |
| P0 | Gateway token/mutation guard | 非 loopback 或缺 token 时拒绝 mutation |
| P0 | Dashboard message form | 不用 curl 即可测试 `POST /messages` |
| P1 | Migration plan viewer | dashboard 展示 `migrate --output` 的 plan/diff |
| P1 | State read index | 最近 runs 查询不全量读目录 |

## 验收记录

本阶段已验证：

```bash
npm run check
npm test
npm run myclaw -- receive --channel console --from ou_user --conversation oc_group --text hi --reply 收到 --json
```

测试覆盖：

- channel registry 和 alias。
- channel 能力声明。
- console inbound normalize。
- runtime send/receive。
- CLI send/receive envelope/state。
- state runs/events reader。
- dashboard HTML 和 `/api/status`。
- gateway `/api/health`、`POST /messages`、`GET /api/status`。
- OpenClaw migration planner。

结论：Phase 0.3 已经具备“本地 dashboard + HTTP inbound + GitHub 阶段提交”的骨架。下一阶段应该专注 Feishu event adapter 和 gateway 安全边界。
