# 模块索引

这组文档是 MyClaw 的模块化 design review。每个模块都按同一套结构组织：参考项目观察、推荐设计、MVP 边界、依赖关系、风险和验收标准。新增 OpenHuman 和 OpenClaw 迁移目标后，初期方案从“先做完整 agent 平台”进一步收敛为“先做可观察的本地控制台 + 可恢复 workflow + 可审计迁移 plan”。

## 阅读顺序

1. [参考项目对比](./reference-comparison.md)
2. [OpenHuman 参考分析](./openhuman-analysis.md)
3. [MyClaw 初期实现方案](./initial-mvp-plan.md)
4. [OpenClaw 一键迁移方案](./openclaw-migration.md)
5. [Workflow Core](./workflow-core.md)
6. [接入层](./access-layer.md)
7. [Gateway](./gateway.md)
8. [Agent Runtime](./agent-runtime.md)
9. [工具、审批与安全](./tools-approval-security.md)
10. [记忆、Session 与搜索](./memory-session-search.md)
11. [插件与 Skills](./plugins-skills.md)
12. [配置、状态与存储](./config-state-storage.md)
13. [控制台、观测与运维](./ui-observability-ops.md)
14. [人类测试手册](./human-testing-playbook.md)
15. [阶段路线与验收](./roadmap-acceptance.md)

## 模块依赖图

```text
Controller Registry / Envelope / Event Bus
  -> Dashboard / Observability
  -> OpenClaw Migration Plan
  -> Workflow Core
  -> Tools / Approval / Security
  -> CLI Access Layer
  -> Gateway
      -> Agent Runtime
  -> Plugins / Skills
```

横向测试/治理文档：

```text
Human Testing Playbook
  -> Stage Status
  -> Roadmap / Acceptance
  -> Dashboard Human Experiments
```

## 第一阶段必须完成

- [workflow-core.html](./workflow-core.html) 的 envelope、runner、resume 状态机。
- [tools-approval-security.html](./tools-approval-security.html) 的 workspace boundary、timeout、stdout cap、approval。
- [access-layer.html](./access-layer.html) 的 CLI 命令。
- [config-state-storage.html](./config-state-storage.html) 的 state 目录和 JSONL/index 存储。
- [openclaw-migration.html](./openclaw-migration.html) 的 dry-run plan 和 staged snapshot 设计。
- [human-testing-playbook.html](./human-testing-playbook.html) 的可参与阶段、测试路径和反馈格式。

其它模块先保留接口，不急着完整实现。
