# 接入层

## 诊断

MyClaw 的接入层要分三层演进：CLI 是第一入口，Gateway 是本地服务入口，外部渠道是最后一层。不要一开始做 Telegram/WhatsApp/Discord。

## 参考项目观察

Hermes 有 CLI、gateway、ACP、batch 等多个入口，但核心 agent 统一。这个方向值得借鉴。

OpenClaw 的接入层更完整：CLI、WebSocket gateway、WebChat、macOS/iOS/Android nodes、多渠道插件。但对 MyClaw 初期太重。

## 推荐设计

接入层分层：

```text
CLI
  -> Core API

Gateway HTTP/WS
  -> Core API
  -> Agent API

Channel Adapters
  -> Gateway API
```

第一阶段 CLI 命令：

```bash
myclaw init
myclaw doctor
myclaw run "exec echo hello"
myclaw run workflow.json --json
myclaw status <runId>
myclaw resume <approvalId> --approve
myclaw resume <approvalId> --deny
```

CLI 不能含业务逻辑，只负责：

- 参数解析。
- 调 core API。
- 格式化输出。
- exit code。

## 接入协议

所有接入层都应该使用同一组领域操作：

```ts
runWorkflow(input, options): Promise<RunResult>
resumeApproval(input): Promise<RunResult>
getRun(runId): Promise<RunRecord | null>
listRuns(filter): Promise<RunSummary[]>
```

CLI 和 Gateway 只是在这层外面套不同 transport。

## MVP 边界

Phase 0/1：

- 只实现 CLI。
- CLI 直接调用 core，不走 HTTP。
- `--json` 输出完整 envelope。
- 默认输出面向人读，但不隐藏 runId/approvalId。

Phase 4：

- CLI 增加 `--gateway` 模式。
- Gateway 提供 HTTP/WS。
- CLI 可以本地 direct 或 remote gateway 两种执行。

## 不建议第一阶段做

- OAuth。
- DM pairing。
- Slack/Telegram/WhatsApp。
- browser Control UI。
- daemon/service install。

## 关键风险

- CLI 里写业务逻辑，后续 gateway 会复制一遍。
- 文本输出不稳定，会破坏脚本调用。
- 错误只打印字符串，不保留结构化 error。

## 验收标准

- CLI 每个命令都有 JSON 输出模式。
- CLI exit code 与 envelope 状态一致。
- 同一 workflow 通过 CLI direct 和未来 gateway 模式能得到同形结果。
- `doctor` 能检查 Node 版本、state 目录、config schema、workspace path。
