# 配置、状态与存储

## 诊断

配置和状态是 MyClaw 的可恢复基础。第一阶段不需要数据库，但必须把 config、state、workspace、transcript 的目录边界定清楚。

## 参考项目观察

Hermes：

- `~/.hermes/config.yaml` 和 `.env` 简单直接。
- session 用 SQLite + WAL + FTS5，适合长期运行。
- 文件权限做了 owner-only。

OpenClaw：

- `~/.openclaw/openclaw.json` 使用 JSON5。
- strict schema validation，未知 key 会拒绝启动。
- last-known-good config、doctor repair、Control UI schema lookup 很成熟。
- state/config/credentials 权限是安全审计重点。

## 推荐设计

默认目录：

```text
~/.myclaw/
  config.json5
  secrets.json
  state/
  logs/
  memory/
  plugins/
```

Workspace：

```text
~/.myclaw/workspace
```

可以通过环境变量覆盖：

```bash
MYCLAW_HOME=/path/to/home
MYCLAW_CONFIG_PATH=/path/to/config.json5
```

## Config Schema

用 Zod 做 runtime schema：

```ts
const ConfigSchema = z.object({
  workspace: z.string().default("~/.myclaw/workspace"),
  tools: ToolsConfigSchema.default({}),
  gateway: GatewayConfigSchema.default({}),
  models: ModelsConfigSchema.default({}),
}).strict();
```

严格策略：

- unknown root key 报错。
- 类型错误报错。
- config 写入必须 atomic。
- secrets 不写入普通 config。

## State Store

Phase 1：

- JSON files + JSONL event log。
- atomic write。
- id 用 timestamp + random suffix。

Phase 6：

- SQLite migration。
- WAL。
- FTS。
- schema version。

## Secrets

先支持：

- env var。
- `secrets.json`。
- `.myclaw/*.env` 本地文件；例如 `npm run import:openduck -- --json` 会从 `~/.openduck/openclaw.json` 生成 `.myclaw/openduck-feishu.env`，只输出变量名和缺失项，不输出 secret 值，不复用 openduck gateway token。

后续：

- file ref。
- exec ref。
- OS keychain。

## 关键风险

- config 非 strict，用户写错字段但系统悄悄忽略。
- secrets 混进 logs/transcript。
- 从 OpenClaw/openduck 迁移配置时把 appSecret、verify token、encrypt key 或 webhook URL 写进 git、报告或命令行参数。
- state 只存在内存，approval 无法恢复。
- 后期数据库迁移没有 schema version。

## 验收标准

- `myclaw doctor` 能显示 config 路径、state 路径、workspace 路径。
- config parse 错误能定位字段。
- state 文件写入是 atomic。
- secrets 不出现在 `--json` 输出和 logs。
- `.myclaw/` 始终 git ignored，导入脚本生成的 env 文件权限为 `600`，并拒绝写到非 ignored 路径或 symlink 路径。
- `npm run check` 会扫描本地 `.myclaw/*.env` 中的敏感值是否进入 git tracked 文件。
