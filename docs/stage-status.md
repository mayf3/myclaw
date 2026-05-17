# MyClaw 阶段状态

更新时间：2026-05-18

## 当前阶段

Phase 0.8: Feishu Encrypted Challenge + Run Detail + Stage Summary。

这一轮把 Phase 0.7 留下的三个可落地问题补上：Feishu encrypted challenge 可以按 OpenClaw/Feishu 的 AES-256-CBC 方式解密；dashboard 和 API 能打开最新 run 的 detail；OpenClaw migration status 能返回 stage review summary。这个 summary 只用于人工审阅，不是字段级 diff，也不能作为 apply 输入。

## 已完成

- `packages/feishu-adapter/src/security.mjs` 新增 `decryptFeishuPayload`。
  - 使用 `sha256(encryptKey)` 作为 AES-256-CBC key。
  - encrypted payload 格式为 `base64(iv[16] + ciphertext)`。
  - gateway 处理顺序是 signature -> parse envelope -> decrypt -> token/challenge/event。
- Gateway `POST /feishu/events` 已支持 signed encrypted challenge。
- `packages/core/src/state.mjs` 新增 `readRun`。
- `packages/control-plane/src/status.mjs` 新增 `buildRunPayload` 和 `openclawStageSummary`。
- Dashboard 新增“最新 Run 详情”区块，并通过 `GET /api/runs/:runId` 读取 detail。
- Dashboard migration panel 新增 stage summary：staged modules、missing expected、blocked、review only 标记。
- Gateway/Dashboard 都支持 `GET /api/runs/:runId`。
- `GET /api/runs/:runId` 已做 runId 白名单校验，非法 id 返回 400。
- Feishu webhook readiness 不再把 token-only 模式标成可用；缺 encryptKey 时 blocked。
- 测试从 27 个增加到 30 个，覆盖 encrypted decrypt、signed encrypted challenge 和 runId 校验。

## Feishu/Lark 当前能力

| 能力 | 状态 | 说明 |
|---|---|---|
| OpenClaw 插件直接加载 | 不做 | 仍不直接加载 `@openclaw/feishu` |
| x-lark signature | 已有 | 有 `encryptKey` 时在 JSON parse 前校验 |
| encrypted challenge decrypt | 已有 | 解密后再 token/challenge |
| encrypted message event | 部分 | decrypt 已有，事件语义仍只支持 text normalize |
| Replay guard | 部分 | 缺 event id 直接拒绝；仍是内存 TTL |
| WebSocket mode | 未做 | 仅 readiness 字段 |
| outbound rich card | 未做 | 下一阶段再做 outbound facade |

## 参考完成度

| 模块 | MyClaw | OpenClaw | Hermes-agent | OpenHuman | 当前差距 |
|---|---:|---:|---:|---:|---|
| Gateway / 控制面 | 60 | 90 | 78 | 86 | 已拆 routes/auth，仍缺 WS/SSE、scoped token |
| Feishu/Lark 接入 | 50 | 92 | 42 | 35 | 有 adapter/signature/encrypted challenge，缺 WebSocket/policy/outbound |
| Dashboard / 观测 | 55 | 78 | 55 | 90 | 有 run detail/stage summary，缺 approval queue、实时事件 |
| OpenClaw 迁移 | 55 | 0 | 82 | 35 | 有 plan/stage/review summary，缺 apply/rollback/字段级 diff |
| Agent Runtime | 8 | 76 | 92 | 90 | 还没有 agent turn/tool loop |
| Memory / Search | 10 | 52 | 94 | 96 | 还没有 SQLite/FTS/长期记忆 |
| Tools / Security | 22 | 88 | 74 | 84 | 缺 tool schema、approval queue、sandbox |
| Plugins / Skills | 18 | 92 | 88 | 78 | 还没有 plugin manifest/skill loader |

## 当前可用命令

```bash
npm run myclaw -- dashboard --port 4321 --openclaw-source /Users/yanfenma/workspace/github/openclaw
MYCLAW_GATEWAY_TOKEN=dev-token MYCLAW_FEISHU_VERIFY_TOKEN=verify-token MYCLAW_FEISHU_ENCRYPT_KEY=encrypt-key \
  npm run myclaw -- gateway --port 4322 --openclaw-source /Users/yanfenma/workspace/github/openclaw
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --stage --json
```

## 下一步

1. Phase 0.9：Feishu outbound facade，先做 text/card/thread result，不接完整 OpenClaw tools。
2. Replay guard 持久化到 state 或 SQLite。
3. Dashboard 做字段级 diff drawer 和 approval queue。
4. Gateway scoped token 和 mutation audit。

## 验证记录

```bash
npm run check
npm test
```

结果：

- 单文件行数检查通过：88 个文件，最大 500 行限制未触发。
- 文档阶段同步检查通过。
- Node test 通过：30 个测试全部通过。
