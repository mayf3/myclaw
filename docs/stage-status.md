# MyClaw 阶段状态

更新时间：2026-05-17

## 当前阶段

Phase 0.7: Feishu Adapter Facade + Gateway Route Split。

这一轮把 Phase 0.6 的设计结论落成代码：MyClaw 不直接加载 OpenClaw `extensions/feishu`，而是先建立自己的 Feishu adapter facade；gateway 不再把 auth、Feishu、message、migration、dashboard 全塞进 `index.mjs`，改成 route 模块。

## 已完成

- 新增 `packages/feishu-adapter`：
  - `buildFeishuAdapterConfig`：兼容 OpenClaw Feishu 的关键字段 `appId/appSecret/verificationToken/encryptKey/domain/connectionMode`。
  - `describeFeishuAdapterReadiness`：输出 adapter 当前 readiness。
  - `validateFeishuWebhookSignature`：按 OpenClaw/Feishu 公式校验 `x-lark-request-*` 签名。
  - `validateFeishuVerificationToken`：保持 verification token 边界。
  - `createFeishuReplayGuard`：把 Feishu event id 去重从 gateway 主文件移出。
  - `normalizeFeishuEvent`：Feishu text event normalize 迁到 adapter facade。
- `packages/channels` 的 `feishu-event` channel 改为调用 adapter facade。
- `packages/gateway/src/index.mjs` 从 321 行降到 90 行。
- 新增 gateway 模块：
  - `auth.mjs`
  - `http.mjs`
  - `routes/control.mjs`
  - `routes/feishu.mjs`
  - `routes/messages.mjs`
  - `routes/migration.mjs`
- `GET /api/feishu-adoption` 返回 `feishuAdapter` readiness。
- Dashboard Feishu 面板展示 adapter readiness、signed webhook 是否 ready。
- Gateway 增加 `--feishu-encrypt-key`，也支持 `MYCLAW_FEISHU_ENCRYPT_KEY`。
- 测试从 21 个增加到 27 个，覆盖 Feishu adapter config、签名、replay、normalize 和 gateway signed callback。

## 当前可用命令

```bash
npm run myclaw -- doctor
npm run myclaw -- channels
npm run myclaw -- send --text "hello"
npm run myclaw -- receive --from local-user --conversation local-thread --text "hello" --reply "received" --json
npm run myclaw -- dashboard --port 4321 --openclaw-source /Users/yanfenma/workspace/github/openclaw
npm run myclaw -- gateway --port 4322 --openclaw-source /Users/yanfenma/workspace/github/openclaw --feishu-verify-token verify-token --feishu-encrypt-key encrypt-key
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --stage --json
```

## Feishu/Lark 当前能力

| 能力 | 状态 | 说明 |
|---|---|---|
| OpenClaw 插件直接加载 | 不做 | 仍不直接加载 `@openclaw/feishu` |
| Config facade | 已有 | 覆盖核心字段，暂不做 secret ref runtime |
| Verification token | 已有 | 支持 body token 验证 |
| x-lark signature | 已有 | 有 `encryptKey` 时在 JSON parse 前校验 |
| Replay guard | 已有 | 内存 TTL 去重，后续要持久化 |
| encrypt payload 解密 | 未做 | 当前仍 501 |
| WebSocket mode | 未做 | 仅 readiness 字段，不启动连接 |
| outbound rich card | 未做 | 下一阶段再做 outbound facade |

## 参考完成度

| 模块 | MyClaw | OpenClaw | Hermes-agent | OpenHuman | 当前差距 |
|---|---:|---:|---:|---:|---|
| Gateway / 控制面 | 60 | 90 | 78 | 86 | 已拆 routes/auth，仍缺 WS/SSE、scoped token |
| Feishu/Lark 接入 | 45 | 92 | 42 | 35 | 有 adapter/signature，缺 encrypt/WebSocket/policy/outbound |
| Dashboard / 观测 | 47 | 78 | 55 | 90 | 缺 run detail、stage diff、approval queue、实时事件 |
| OpenClaw 迁移 | 50 | 0 | 82 | 35 | 已有 plan/stage，缺 apply/rollback/diff UI |
| Agent Runtime | 8 | 76 | 92 | 90 | 还没有 agent turn/tool loop |
| Memory / Search | 10 | 52 | 94 | 96 | 还没有 SQLite/FTS/长期记忆 |
| Tools / Security | 22 | 88 | 74 | 84 | 缺 tool schema、approval queue、sandbox |
| Plugins / Skills | 18 | 92 | 88 | 78 | 还没有 plugin manifest/skill loader |

## 当前实现架构

```text
POST /feishu/events
  -> packages/gateway/src/routes/feishu.mjs
  -> packages/feishu-adapter signature/token/replay/normalize contract
  -> packages/runtime.receiveMessage(rawInbound)
  -> packages/channels feishu-event
  -> packages/core state

GET /api/feishu-adoption
  -> packages/control-plane
  -> packages/feishu-adapter readiness
  -> dashboard Feishu panel
```

## 下一步

1. Phase 0.8：实现 Feishu encrypted challenge decrypt，继续参考 OpenClaw 的 AES-256-CBC 流程。
2. Dashboard 做 run detail 和 stage diff，避免继续依赖 raw JSON。
3. Gateway 增加 scoped token 和 mutation audit。
4. Feishu outbound facade：先定义 text/card/thread reply result，不直接接完整 OpenClaw tools。

## 验证记录

```bash
npm run check
npm test
```

结果：

- 单文件行数检查通过：83 个文件，最大 500 行限制未触发。
- Node test 通过：27 个测试全部通过。
- 新增测试覆盖 Feishu adapter facade 和 gateway signed webhook callback。
