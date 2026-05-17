# MyClaw 当前实现架构评审

更新时间：2026-05-17

## 总诊断

当前实现已经进入 Phase 0.2：MyClaw 不再只是命令行消息 demo，而是有了可观察的本地控制台、runs/events 读取 API，以及 OpenClaw 迁移 dry-run inventory。这个方向符合“先把 dashboard 搞定”的判断，因为后续接飞书、gateway、agent runtime、memory 时都需要一个能看状态和风险的界面。

主要缺口也很明确：dashboard 现在是只读状态面板，还不是 gateway 控制台；OpenClaw 迁移现在只做 plan，不做 apply；Feishu 仍然只有 outbound webhook，没有完整 event ingress。

## 当前实现架构

| 模块 | 当前职责 | 阶段判断 | 不应扩大的职责 |
|---|---|---|---|
| `packages/core/src/envelope.mjs` | 生成 run id、event、ok/failed envelope | P0 稳定边界 | 不感知 Feishu、CLI、HTTP、dashboard |
| `packages/core/src/state.mjs` | 写入和读取 runs/events | P0.2 新增读取能力 | 不做复杂查询和权限 |
| `packages/channels/src/index.mjs` | 注册 channel、解析 alias、声明能力、send、normalize inbound | P0.1 稳定边界 | 不跑 workflow、不调 LLM |
| `packages/dashboard/src/index.mjs` | 本地 dashboard HTML 和 JSON API | P0.2 新增控制台 | 不直接执行危险动作 |
| `packages/migrate/src/openclaw.mjs` | OpenClaw dry-run 迁移评估 | P0.2 新增迁移入口 | 不直接 apply runtime |
| `packages/cli/src/index.mjs` | `doctor`、`channels`、`send`、`receive`、`dashboard`、`migrate openclaw` | P0.2 编排入口 | 不承载业务状态机 |
| `docs/` | 模块化 design review 和阶段状态 HTML | 持续沉淀 | 不替代测试和代码契约 |

代码依赖关系：

```text
packages/cli
  -> packages/channels
  -> packages/dashboard
  -> packages/migrate
  -> packages/core

packages/dashboard
  -> packages/core/state
  -> packages/channels
  -> packages/migrate

docs/build-review-html.mjs
  -> docs/*.md
  -> docs/*.html
```

## 数据流图

消息 outbound:

```text
用户/脚本
  -> myclaw send --text ...
  -> resolveChannel(channel)
  -> ChannelAdapter.send({ text, target, metadata })
  -> message.send.started / completed
  -> okEnvelope
  -> state/runs/<runId>.json + events.jsonl
```

消息 inbound:

```text
用户/脚本
  -> myclaw receive --text ... --from ... --conversation ...
  -> resolveChannel(channel)
  -> ChannelAdapter.normalizeInbound(raw)
  -> message.receive.started / completed
  -> 可选 ChannelAdapter.send(reply)
  -> okEnvelope
  -> state/runs/<runId>.json + events.jsonl
```

Dashboard:

```text
浏览器
  -> GET /
  -> dashboard HTML
  -> fetch /api/status
  -> listRuns + readEvents + listChannels + planOpenClawMigration
  -> 页面渲染 runs、events、channels、migration risk
```

OpenClaw migration:

```text
openclaw.json + extensions/*/openclaw.plugin.json
  -> planOpenClawMigration
  -> config sections + channel inventory + plugin entries
  -> MyClaw draft mapping + unsupported list
  -> CLI JSON / dashboard panel
```

## 请求-响应图

Dashboard `/api/status`：

```text
GET /api/status
  -> resolveStateDir
  -> listRuns(limit=20)
  -> readEvents(limit=50)
  -> listChannels()
  -> planOpenClawMigration()
  -> JSON payload
```

Migration CLI：

```text
myclaw migrate openclaw --source <path>
  -> resolve source repo/config
  -> parse openclaw.json best-effort
  -> scan extensions/*/openclaw.plugin.json
  -> detect configured channels/plugins/sections
  -> report unsupported surfaces
  -> optional --output migration-plan.json
```

## 状态流图

```text
send/receive command
  -> envelope
  -> recordRun()
  -> run JSON + events JSONL
  -> dashboard listRuns/readEvents
  -> operator observes state
```

Migration 状态：

```text
not-started
  -> dry-run plan
  -> staged snapshot     后续
  -> apply module-by-module     后续
  -> rollback via snapshot      后续
```

## 严重问题

| 问题 | 影响 | 证据 | 修复建议 |
|---|---|---|---|
| 还没有 gateway | 飞书事件和外部系统仍无法进入 MyClaw | dashboard 只有 `/api/status`，没有 `POST /messages` | 下一阶段新增 `packages/gateway`，并让 dashboard 复用 gateway 服务 |
| dashboard 无鉴权 | 如果绑定非本机地址，会暴露 runs、events、迁移信息 | `dashboard` 当前默认本机服务，但无 token | 只允许 `127.0.0.1` 默认；gateway 阶段加 token |
| OpenClaw 不能直接一键 apply | OpenClaw 插件/runtime 面太大，直接迁移风险不可控 | migration plan 报告大量 unsupported runtime surfaces | 保持 plan/stage/apply 三段式，不提供危险默认 apply |

## 主要问题

| 问题 | 影响 | 证据 | 修复建议 |
|---|---|---|---|
| dashboard 与未来 gateway 还不是同一服务对象 | 后续可能出现两套 API | `packages/dashboard` 目前独立 `http.createServer` | gateway 阶段抽共享 app handler |
| state 仍是 JSONL 文件查询 | runs 多时 dashboard 会变慢 | `listRuns` 读取 run JSON 文件 | Phase 1 增加索引或 SQLite |
| migration parser 是 best-effort JSON5 | 复杂 OpenClaw config 可能无法完整解析 | `stripJson5` 是轻量实现 | plan 阶段保留 raw config，后续引入正式 JSON5 parser |
| plugin manifest 只做 inventory | 无法直接运行 OpenClaw 插件 | migration 输出 `plugin-runtime` unsupported | 先为 Feishu adapter 做 runtime facade spike |

## 细节问题

| 问题 | 影响 | 修复建议 |
|---|---|---|
| dashboard UI 还没有筛选和详情抽屉 | run 多时查看不够快 | 增加 run type/status/channel 筛选和单 run JSON 面板 |
| CLI 参数解析仍较轻 | 错误提示和布尔参数边界有限 | gateway 前可暂缓，Phase 1 引入 schema/parser |
| dashboard 颜色和密度还只是基础工作台 | 可用但不够成熟 | 后续按真实 run 规模调密度和交互 |

## OpenClaw 一键迁移方案

一键迁移不能理解为“把 OpenClaw 目录复制过来立即运行”。推荐定义成可审计的一键流程：

```text
myclaw migrate openclaw --source <path> --output migration-plan.json
  -> plan
  -> 人工 review
  -> myclaw migrate openclaw --stage migration-plan.json   后续
  -> dashboard 显示 staged diff
  -> myclaw migrate openclaw --apply --module feishu       后续
```

当前 dry-run 已经能识别：

- `openclaw.json` config path。
- top-level config sections。
- configured channels，例如 Feishu。
- `extensions/*/openclaw.plugin.json` 插件 manifests。
- MyClaw 当前未实现的 runtime surfaces。
- MyClaw draft mapping。

## 证据

| 证据 | 位置 | 说明 |
|---|---|---|
| dashboard 服务 | `packages/dashboard/src/index.mjs` | 提供 HTML、`/api/status`、runs/events/channels/migration API |
| state reader | `packages/core/src/state.mjs` | `listRuns`、`readEvents` |
| migration planner | `packages/migrate/src/openclaw.mjs` | OpenClaw config 和 plugin manifest dry-run |
| CLI commands | `packages/cli/src/index.mjs` | `dashboard`、`migrate openclaw` |
| 测试覆盖 | `packages/dashboard/test/dashboard.test.mjs`、`packages/migrate/test/openclaw.test.mjs` | 验证 dashboard API 和 migration inventory |
| 阶段状态 | `docs/stage-status.md` | 记录 Phase 0.2 当前范围、风险和下一步 |

## 实现风险

| 风险 | 当前等级 | 应对 |
|---|---|---|
| dashboard 提前长成独立产品 | 中 | 下一阶段把 dashboard API 合并进 gateway handler |
| OpenClaw runtime surface 太大 | 高 | 继续用 plan/stage/apply，按 Feishu、providers、tools、memory 分模块迁移 |
| 飞书事件入口缺失 | 高 | gateway 下一个阶段必须做 `POST /messages` |
| JSONL 查询扩展性不足 | 中 | Phase 1 后增加 SQLite/FTS 或 run index |

## 修复优先级

| 优先级 | 任务 | 验收标准 |
|---|---|---|
| P0 | 新增 `packages/gateway` 最小 HTTP 服务 | `POST /messages` 能产出与 CLI receive 相同 envelope |
| P0 | dashboard 复用 gateway handler | dashboard 和 gateway 不分裂 API |
| P0 | migration `--output` snapshot 标准化 | 可生成稳定 migration plan 文件并在 dashboard 展示 |
| P1 | Feishu event adapter spike | 可以处理 challenge 和一条文本消息事件样例 |
| P1 | dashboard run 详情和筛选 | 能按 status/channel/type 找 run |
| P2 | migration `--apply --module feishu` | 只启用 Feishu 相关可控配置 |

## 验收记录

本阶段已验证：

```bash
npm run check
npm test
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --json
```

测试覆盖：

- channel registry 和 alias。
- channel 能力声明。
- console inbound normalize。
- CLI send/receive envelope/state。
- state runs/events reader。
- dashboard HTML 和 `/api/status`。
- OpenClaw migration planner。

结论：Phase 0.2 可以先支撑 dashboard-first 的推进方式；下一阶段应把 dashboard 与 gateway 合并，给飞书事件入口和迁移 apply 留稳定控制面。
