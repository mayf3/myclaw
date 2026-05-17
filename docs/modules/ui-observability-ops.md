# 控制台、观测与运维

## 诊断

UI 不是第一阶段核心，但观测能力必须从 CLI 阶段就开始设计。否则 gateway 和 Control UI 加入后只能倒推日志格式。Phase 0.7 的 dashboard 已展示 Feishu adapter readiness：能看到当前是 `ready/partial/blocked`，以及 signed webhook 是否 ready。

## 参考项目观察

OpenClaw：

- Control UI 通过 gateway schema 渲染 config 表单。
- gateway health/status 是运维入口。
- WS events 支撑实时 UI。
- security audit 和 doctor 是用户自查入口。

Hermes：

- CLI/TUI 对工具执行有实时 progress。
- session search 和 usage/cost 对长期使用有帮助。
- gateway 平台状态能帮助定位 channel 问题。

OpenHuman：

- UI-first 的 memory tree、controller registry 和 intelligence 页面说明：控制台不能只是 raw JSON，必须帮助人判断下一步。
- 本地状态、事件和 controller schema 适合做成可比较、可审阅的操作面。

## 推荐设计

Phase 0/1 CLI observability：

- `myclaw doctor`。
- `myclaw status <runId>`。
- `myclaw runs list`。
- `--json` 输出。
- run event JSONL。

Phase 4 Gateway observability：

- `/health`。
- `/status`。
- WS event stream。
- `/runs/:id/events`。

Phase 5/6 UI：

- 本地 Control UI。
- runs 列表。
- run step timeline。
- approval pending queue。
- config read-only view，后续可编辑。

Phase 0.6 dashboard 当前已经具备：

- 只读 `/api/status` 工作台，并通过 `/api/reference-completion`、`/api/feishu-adoption` 加载评审态数据。
- 参考完成度矩阵。
- Feishu/Lark 复用决策卡片。
- OpenClaw migration stage 摘要。
- runs/events/channels/raw JSON。

Phase 0.7 dashboard 新增：

- Feishu adapter facade readiness。
- signed webhook readiness。
- adapter issues/warnings 展示。

Phase 0.8 应补：

- run detail drawer。
- stage snapshot diff。
- `apply --module feishu` 人工确认入口。
- 事件 stream 或轮询刷新。

## HTML/Control UI 信息架构

第一版 UI 不做营销页，直接是工具界面：

```text
Runs
Approvals
Sessions
Tools
Config
Logs
```

每个 run 展示：

- status。
- started/ended。
- workflow input。
- step timeline。
- tool args/result 摘要。
- pending approval 操作。
- raw JSON。

## Logs

日志分三类：

- user-facing events：写入 run JSONL。
- diagnostic logs：写入 logs。
- audit events：approval、config change、plugin load。

## 运维命令

后续增加：

```bash
myclaw gateway start
myclaw gateway status
myclaw gateway stop
myclaw logs tail
myclaw security audit
```

## 关键风险

- 只靠 stdout，后续 UI 无法复现 run。
- UI 只展示最终答案，不展示 step 和 approval。
- logs 泄露 secret。
- HTML/Control UI 变成 landing page，反而不服务操作。

## 验收标准

- 任意 run 都能从 state 复原 timeline。
- pending approvals 有独立列表。
- status/doctor 能定位 config、state、tool policy 常见问题。
- UI 所需数据全部来自 gateway API，不读私有文件。
