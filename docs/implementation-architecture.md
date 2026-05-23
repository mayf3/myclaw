# MyClaw Phase 1.2 实现架构可视化评审

更新时间：2026-05-23

## 总诊断

Phase 1.2 先处理两个会让后续研发变脏的问题：HTML Center 链接不可访问，以及生成文档和源文档混在同一目录导致结构膨胀。独立 Linus 视角审查指出最初修复仍有 3 个 High：HTML Center 不可复现、行数检查可绕过、生成 HTML 可能 stale。本轮已补成硬约束：`npm run check` 现在会重建并校验 HTML 生成物、检查所有文本文件的 500 行上限、检查 20 文件/目录和 4 层目录深度。

| 评分项 | 当前分 | 判断 |
|---|---:|---|
| 设计清晰度 | 8/10 | 结构红线变成机器检查，E7 可由用户亲自跑 |
| 可扩展性 | 8/10 | 源文档与生成 HTML 拆开，后续模块页不再挤爆目录 |
| 可靠性 | 8/10 | HTML Center 有仓库命令和 doctor health，仍缺自动告警 |
| 可维护性 | 8/10 | 结构债务和生成物 stale 进入 `npm run check`，Dashboard client 仍要拆 |
| 安全性 | 7/10 | 本轮未扩大 mutation 面，沿用 Phase 1.1 token 审批边界 |

## 大规划图

这张图回答：当前哪些能力已经可由用户亲手测试，哪些还在后续阶段。

```mermaid
flowchart LR
  E0[E0 本地消息] --> E1[E1 Dashboard]
  E1 --> E4[E4 OpenClaw stage]
  E4 --> E5[E5 Approval decision]
  E5 --> E7[E7 工程约束]
  E7 --> Next1[拆 Dashboard renderer]
  Next1 --> Next2[Tool approval]
  Next2 --> E6[E6 Agent + Memory]
  E2[E2 Feishu outbound] -.配置后.-> E3[E3 callback smoke]
```

Review 观察：

- 优点：E7 把技术债约束变成可执行实验。
- 优点：当前可测入口已经覆盖消息、Dashboard、迁移、审批、结构约束。
- 风险：E6 仍未实现，不能测试 agent runtime 和记忆。
- 改进：下一阶段把审批接到真实 tool action。

## 系统上下文图

这张图回答：HTML Center、文档生成、Dashboard 和本地用户之间的边界。

```mermaid
flowchart LR
  User[本地用户] --> Browser[Browser]
  Browser --> Dashboard[MyClaw Dashboard :4321]
  Browser --> HtmlCenter[HTML Center :4177]
  User --> Check[npm run check]
  Check --> Structure[structure guardrails]
  Check --> Generated[generated docs freshness]
  User --> Doctor[myclaw doctor]
  Doctor --> HtmlCenter
  Docs[docs/*.md] --> Builder[docs/build-review-html.mjs]
  Modules[docs/modules/*.md] --> Builder
  Builder --> Rendered[docs/rendered/modules/*.html]
  Builder --> Index[docs/index.html]
  Index --> HtmlCenter
```

Review 观察：

- 优点：旧链接打不开的根因是服务未运行，已用 `ensure_html_center.py` 恢复。
- 优点：HTML 生成物移动后，`docs/modules` 只放源文档。
- 风险：HTML Center 仍依赖 tmux 常驻，没有自动告警。
- 改进：后续把 doctor 结果显示到 Dashboard 顶部 health strip。

## 模块架构图

这张图回答：结构约束如何进入开发闭环。

```mermaid
flowchart TB
  Package[package.json] --> CheckScript[npm run check]
  CheckScript --> Syntax[node --check]
  CheckScript --> Generated[scripts/check-generated-docs.mjs]
  CheckScript --> Structure[scripts/check-file-lines.mjs]
  CheckScript --> PhaseSync[scripts/check-doc-phase-sync.mjs]
  Generated --> Builder[docs/build-review-html.mjs]
  Generated --> Fresh[fail on generated diff]
  Structure --> LineLimit[500 lines/file]
  Structure --> FileLimit[20 files/directory]
  Structure --> DepthLimit[4 directory levels]
  Structure --> TextDetect[all text files]
  BuildDocs[docs/build-review-html.mjs] --> Rendered[docs/rendered/modules]
  BuildDocs --> DocsRoot[docs/*.html]
```

Review 观察：

- 优点：约束是硬失败，不是 README 建议。
- 优点：目录文件数按直接文件计算，能防止一个目录变抽屉。
- 风险：`docs/build-review-html.mjs` 414 行，仍接近 450 预警。
- 改进：拆 Markdown parser、shell template、index rewrite。

## 核心业务流程图

这张图回答：一次文档构建和结构检查如何流动。

```mermaid
flowchart TD
  Start[编辑源码/文档] --> Build[node docs/build-review-html.mjs]
  Build --> ReadMd[读取 docs/modules/*.md]
  ReadMd --> WriteHtml[写入 docs/rendered/modules/*.html]
  WriteHtml --> Rewrite[重写 docs/index.html 链接]
  Rewrite --> Check[npm run check]
  Check --> Lines{文件 <= 500 行?}
  Lines --> Files{目录 <= 20 文件?}
  Files --> Depth{目录深度 <= 4?}
  Depth --> Phase{HTML phase 同步?}
  Phase --> Fresh{生成 HTML 无 diff?}
  Fresh --> Pass[可提交/发布]
```

Review 观察：

- 优点：生成物目录也接受结构检查。
- 优点：`check-generated-docs` 会在 HTML 生成物过期时失败。
- 风险：index 仍是手写 HTML，后续也应从数据生成。
- 改进：下一步把 index metadata 抽到结构化数据。

## 关键时序图

这张图回答：旧 HTML Center 链接如何恢复。

```mermaid
sequenceDiagram
  participant U as User
  participant C as Codex
  participant H as HTML Center
  participant T as tmux

  U->>C: 打不开 4177 链接
  C->>H: GET /view/.../index.html
  H--xC: connection refused
  C->>T: node scripts/html-center.mjs start
  T-->>C: started html-center
  C->>H: GET /api/health
  H-->>C: ok
  C->>H: GET old report URL
  H-->>C: 200 OK
```

Review 观察：

- 优点：旧链接无需重新上传即可恢复。
- 风险：如果 tmux session 再掉，链接仍会失败。
- 改进：doctor 已能报 health；下一步把 health 结果放进 Dashboard。

## 状态机图

这张图回答：结构检查从通过到失败的状态如何流转。

```mermaid
stateDiagram-v2
  [*] --> Clean
  Clean --> CrowdedDirectory: >20 direct files
  Clean --> DeepDirectory: depth >4
  Clean --> LongFile: >500 lines
  Clean --> GeneratedDrift: rendered HTML stale
  Clean --> PhaseDrift: rendered phase stale
  CrowdedDirectory --> Clean: split directory
  DeepDirectory --> Clean: flatten structure
  LongFile --> Clean: split file
  GeneratedDrift --> Clean: rebuild and commit HTML
  PhaseDrift --> Clean: rebuild HTML
  Clean --> [*]
```

Review 观察：

- 优点：四类技术债都有明确失败原因。
- 风险：20 文件/目录会迫使生成物规划更谨慎。
- 改进：失败时输出修复建议和当前 top offenders。

## 数据模型 / ER 图

这张图回答：文档源文件、生成文件和结构规则的关系。

```mermaid
erDiagram
  SOURCE_DOC ||--|| RENDERED_DOC : generates
  DIRECTORY ||--o{ FILE : contains
  STRUCTURE_RULE ||--o{ VIOLATION : detects

  SOURCE_DOC { string path string kind }
  RENDERED_DOC { string path string entry }
  DIRECTORY { string path int depth int directFiles }
  FILE { string path int lines }
  STRUCTURE_RULE { string name int limit }
  VIOLATION { string path string reason }
```

Review 观察：

- 优点：源文档和生成文档现在有不同目录职责。
- 风险：生成文件仍入仓，体积会增长。
- 改进：后续可考虑只发布生成物，不长期跟踪全部 HTML。

## 数据流图

这张图回答：检查数据从文件系统如何变成失败/通过。

```mermaid
flowchart LR
  FS[repo filesystem] --> Walk[walk excluding .git/.myclaw/node_modules]
  Walk --> Files[checkable files]
  Walk --> Directories[directory records]
  Files --> TextDetect[text/binary detection]
  TextDetect --> LineCounts[line counts]
  Directories --> FileCounts[direct file counts]
  Directories --> Depths[relative depths]
  LineCounts --> Report[check result]
  FileCounts --> Report
  Depths --> Report
```

Review 观察：

- 优点：检查逻辑很小，容易理解。
- 风险：二进制会跳过行数，但会计入目录文件数；文本文件默认进入行数检查。
- 改进：加白名单配置前先保持硬规则简单。

## 部署图

这张图回答：本机服务现在如何运行。

```mermaid
flowchart TB
  subgraph Local[Developer machine]
    Dashboard[myclaw-dashboard tmux :4321]
    Gateway[myclaw-gateway tmux :4322]
    HtmlCenter[html-center tmux :4177]
    Repo[myclaw repo]
    Repo --> Dashboard
    Repo --> Gateway
    Repo --> Doctor[myclaw doctor]
    Repo --> Publish[scripts/html-center.mjs publish]
    Repo --> HtmlCenter
  end
  Browser --> Dashboard
  Browser --> HtmlCenter
```

Review 观察：

- 优点：三个本地服务都回到 tmux 常驻。
- 风险：没有统一 supervisor。
- 改进：doctor 已有 HTML Center health；后续做统一 services status。

## Human Experiments

| 实验 | 状态 | 用户动作 | 成功信号 |
|---|---|---|---|
| E0 | ready | `send --text` | ok envelope，run 可见 |
| E1 | ready | 打开 Dashboard | Phase 1.2、Approvals 可见 |
| E4 | ready | `migrate openclaw --stage --json` | stage 带 approval，review-only |
| E5 | ready | GET approvals + POST decision | approval 变 approved/rejected |
| E7 | ready | `npm run check` | 输出 500 行、20 文件/目录、depth 4 |
| E2/E3 | needs_config | Feishu webhook/callback | 配置后可测 |
| E6 | planned | agent run + memory search | 后续开放 |

## 概念解释

| 概念 | 含义 | 当前边界 |
|---|---|---|
| Structure guardrail | 机器强制的技术债红线 | 500 行、20 文件、4 层深度 |
| Direct file count | 一个目录下直接文件数 | 不递归计入子目录 |
| Rendered docs | 从 Markdown 生成的 HTML | 位于 `docs/rendered/modules` |
| HTML Center | 本机报告中心 | 依赖 4177 服务常驻 |
| Phase sync | Markdown 与 HTML 阶段一致性 | 防止 stale report |
| Generated freshness | 生成物新鲜度 | `check-generated-docs` 重建后检测 diff |

## 相似技术比较

| 维度 | MyClaw Phase 1.2 | OpenClaw | Hermes-agent | OpenHuman |
|---|---|---|---|---|
| 结构约束 | 硬性 check 脚本 | 大 repo 模块化 | 成熟工程分层 | Rust workspace 分层 |
| 文档发布 | HTML Center + rendered docs | docs/control UI | README/ops docs | UI/docs 混合 |
| 审批 | migration approval seed | 成熟 policy/approval | ops guard | risk/autonomy policy |
| Dashboard | 本地只读 console | control UI | TUI/ops | UI-first |

## 目录结构与文件行数

| 路径 | 行数/文件数 | 职责 | 评价 |
|---|---:|---|---|
| `scripts/check-file-lines.mjs` | 120 行 | 文本文件行数、目录文件数、深度检查 | 健康 |
| `scripts/check-generated-docs.mjs` | 63 行 | 重建 HTML 并检测 stale 生成物 | 健康 |
| `scripts/html-center.mjs` | 121 行 | HTML Center status/start/publish/verify，发布前校验生成物 | 健康 |
| `docs/build-review-html.mjs` | 414 行 | HTML report builder | 接近 450，下一轮拆 |
| `docs/modules` | 15 文件 | 模块 Markdown 源文档 | 已低于 20 |
| `docs/rendered/modules` | 15 文件 | 生成 HTML 模块页 | 已低于 20 |
| `packages/cli/src/index.mjs` | 354 行 | CLI 命令与 doctor | 健康，但继续增长要拆命令 |
| `packages/dashboard/src/client.mjs` | 344 行 | Dashboard client | 仍需拆 renderer |
| `packages/core/src/approvals.mjs` | 198 行 | approval state | 健康 |

当前最大目录深度是 4，当前最大目录文件数是 15。

## 风险分级

| 等级 | 问题 | 影响 | 建议 |
|---|---|---|---|
| Medium | HTML Center 依赖 tmux 常驻 | 服务掉了链接就打不开 | doctor 已覆盖，后续纳入 Dashboard health |
| High | Dashboard client 仍在变大 | 下轮功能会推向 400+ 行 | 拆 section renderer registry |
| Medium | docs build script 414 行 | 接近拆分预警 | 拆 parser/template/rewrite |
| Medium | 20 文件硬限制会影响生成物布局 | 以后新增模块需规划目录 | 保持 source/rendered 分离 |
| Low | 结构检查没有配置文件 | 规则变更需改脚本 | 先保持硬规则，避免早配置化 |

## Linus 视角严苛审查

独立 subagent 结论：初版不建议直接进入下一阶段，必须先修 HTML Center 可复现、行数检查绕过、生成物 stale 这三个 High。处理后结论：可以进入下一阶段，但 Dashboard client 和 docs builder 已经接近需要拆分的边界，不允许继续堆功能。

| 等级 | 发现 | 处理 |
|---|---|---|
| High | HTML Center 恢复只是手工补丁 | 已加 `scripts/html-center.mjs`、`npm run html-center`、`npm run publish:review` 和 `myclaw doctor` health |
| High | 行数检查只看白名单扩展，可被 `.sh/.yaml/Dockerfile` 绕过 | 已改成默认检查所有文本文件，二进制检测排除 |
| High | HTML 生成物可能 stale，旧 sync 只看 Phase 字符串 | 已加 `scripts/check-generated-docs.mjs`，`npm run check` 重建后 fail on diff |
| High | `docs/rendered` 未跟踪会导致索引坏链 | 本轮跟踪生成 HTML，并由 generated docs check 校验缺失/多余 |
| Medium | `docs/build-review-html.mjs` 414 行接近阈值 | 记录为下一阶段拆分任务 |
| Medium | Dashboard client 344 行继续增长 | 下一阶段拆 renderer registry |
| Low | 硬规则会带来目录规划成本 | 保留，作为技术债刹车 |

## Skill 规范自检

- 已按 `web-design-review` 输出可视化 design review dashboard。
- 报告覆盖系统上下文、模块架构、业务流程、时序、状态机、ER、数据流、部署图。
- 报告包含目录行数、概念解释、相似技术比较、风险分级、Linus 视角。
- 单文件 500 行、每目录 20 文件、目录深度 4 层由 `npm run check` 执行。
- 本轮已更新 `web-design-review` skill 的 500 行、20 文件/目录、4 层深度约束；按 `skill-creator` 原则保持 `SKILL.md` 247 行，未增加额外过程文档。

## 下一阶段建议

1. 拆 `packages/dashboard/src/client.mjs` 为 section renderer registry。
2. 拆 `docs/build-review-html.mjs` 为 parser/template/rewrite。
3. 把 approval queue 接到真实 tool action。
4. 做真实 OpenClaw source/target schema diff drawer。
