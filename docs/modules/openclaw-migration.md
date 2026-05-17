# OpenClaw 一键迁移方案

## 模块诊断

“一键迁移 OpenClaw”必须被设计成可审计、可分阶段启用、可回滚的迁移流程，而不是复制目录后直接运行。OpenClaw 的 config、channels、plugins、secrets、tools、memory、browser 自动化和 gateway runtime 耦合面很大；MyClaw 当前只具备 channel boundary、state、dashboard 和 dry-run inventory。

推荐把一键迁移定义为三段：`plan`、`stage`、`apply`。Phase 0.2 已实现 `plan` 的最小版本。

## 参考项目观察

OpenClaw 的迁移相关输入主要来自：

- `~/.openclaw/openclaw.json`：主配置，JSON5，包含 agents、channels、plugins、models、gateway、tools、browser 等。
- `extensions/*/openclaw.plugin.json`：插件 manifest，声明 channels、providers、contracts、skills、configSchema。
- `docs/gateway/configuration.md` 和 `docs/gateway/config-channels.md`：说明 channel、安全策略和 config validation。
- `extensions/feishu`：后续飞书/Lark 接入的重点。

可借鉴点：

- config schema 严格、unknown keys fail closed。
- channel plugin 和 provider plugin manifest 化。
- channel access policy 分 DM/group/mention。
- Control UI 能展示配置 schema。

不建议照搬：

- 不要一开始复刻完整 plugin runtime。
- 不要让 migration 直接写 secrets。
- 不要把所有 OpenClaw channels 一次性启用。
- 不要把 dashboard、gateway、agent runtime 在 Phase 0 同时做大。

## MyClaw 推荐设计

```text
OpenClaw source
  -> myclaw migrate openclaw --source <path>
  -> migration plan JSON
  -> dashboard review
  -> stage snapshot
  -> module apply
```

迁移命令分层：

| 命令 | 阶段 | 行为 |
|---|---|---|
| `myclaw migrate openclaw --source <path>` | Phase 0.2 | dry-run inventory，不写状态 |
| `myclaw migrate openclaw --source <path> --output plan.json` | Phase 0.2 | 写可审计 plan 文件 |
| `myclaw migrate openclaw --stage plan.json` | Phase 1 | 写 MyClaw migration snapshot，不启用 runtime |
| `myclaw migrate openclaw --apply --module feishu` | Phase 2 | 只启用 Feishu 相关可控配置 |
| `myclaw migrate openclaw --rollback <snapshot>` | Phase 2+ | 回滚 staged/apply 结果 |

## MVP 边界

Phase 0.2 已完成：

- 读取 OpenClaw source。
- 识别 config path。
- best-effort parse `openclaw.json`。
- 扫描 `extensions/*/openclaw.plugin.json`。
- 输出 channels、pluginEntries、unsupported、recommendedSteps、myclawDraft。
- dashboard 展示 migration risk。

Phase 0.2 不做：

- 不读取 secrets 的真实值。
- 不迁移 memory DB。
- 不迁移 sessions/transcripts。
- 不运行 OpenClaw plugin code。
- 不启用 gateway 或 channel listener。

## 后续阶段

| 阶段 | 目标 | 验收标准 |
|---|---|---|
| Phase 0.2 | dry-run plan | `migrate openclaw` 输出稳定 JSON |
| Phase 1 | staged snapshot | plan 可写入 MyClaw state，并在 dashboard 展示 diff |
| Phase 2 | Feishu module apply | 只迁移 Feishu config 到 MyClaw Feishu adapter |
| Phase 3 | providers/tools apply | provider 和 tool contracts 分批迁移 |
| Phase 4 | memory/session migration | 明确 schema 后再迁移长期状态 |

## 关键风险

| 风险 | 等级 | 应对 |
|---|---|---|
| OpenClaw 插件 runtime 过大 | 高 | manifest 先 inventory，runtime 后适配 |
| secrets 泄露 | 高 | plan 中只保留 env ref、path ref、redacted marker |
| 自动启用 channel 导致误发消息 | 高 | apply 默认 disabled，需要 dashboard 确认 |
| JSON5 parse 不完整 | 中 | Phase 1 引入正式 parser 或调用 OpenClaw schema export |
| MyClaw schema 未成型 | 中 | stage snapshot 保留 raw config，不强行丢字段 |

## 验收标准

- `migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --json` 能返回 `ok: true`。
- 输出包含 `config.sections`、`inventory.channels`、`inventory.pluginEntries`、`unsupported`。
- dashboard `/api/status` 能展示 migration risk。
- dry-run 不修改 OpenClaw 目录、不修改 MyClaw state。
- docs 中明确 plan/stage/apply 顺序。
