# 工具、审批与安全

## 诊断

工具系统必须和审批、安全边界一起设计。MyClaw 的核心风险不是“能不能执行命令”，而是模型或外部输入能否在不清楚的情况下触发副作用。

## 参考项目观察

Hermes 的工具注册模型值得借鉴：

- tool name。
- toolset/group。
- schema。
- handler。
- check_fn。
- max result size。
- tool availability 在发给模型前过滤。

OpenClaw 值得借鉴：

- tool policy 是模型可见性的一部分。
- sandbox、tool policy、elevated 是不同层。
- exec approval 是 operator intent guardrail，不是多租户安全边界。
- 安全文档明确 personal assistant trust model。

OpenClaw Lobster 值得直接借鉴：

- cwd 相对路径且不能逃出 workspace。
- timeout。
- stdout/stderr cap。
- strict JSON envelope。

## 推荐设计

Tool descriptor：

```ts
type ToolDescriptor = {
  name: string;
  description: string;
  schema: unknown;
  sideEffect: "none" | "read" | "write" | "network" | "exec";
  defaultApproval: "never" | "on_side_effect" | "always";
  execute: (ctx: ToolContext, args: unknown) => Promise<ToolResult>;
};
```

Approval request：

```ts
type ApprovalRequest = {
  approvalId: string;
  runId: string;
  stepId: string;
  prompt: string;
  items: unknown[];
  expiresAt?: string;
};
```

Phase 1.1 已落地的最小种子：

- `packages/core/src/approvals.mjs` 提供 approval create/list/read/decide。
- OpenClaw migration stage 会生成 pending approval。
- Gateway `POST /api/approvals/:id/decision` 必须配置 token，不能依赖 loopback 免 token。
- decision 只记录 approved/rejected，不执行 tool、apply 或 runtime mutation。
- 当前还不是完整 tool approval，只是给后续危险动作审批铺 state/API/UI。

## 第一批工具

Phase 2：

- `exec`：执行命令，默认需要 approval 或 allowlist。
- `read`：读取 workspace 内文件。
- `write`：写 workspace 内文件，默认需要 approval。
- `http.fetch`：网络请求，默认只允许 GET；POST 等后续。
- `llm.complete`：provider-backed 简单补全，后续给 agent 用。

## Policy 层

最小配置：

```json5
{
  tools: {
    allow: ["read", "exec"],
    deny: ["write"],
    fs: { workspaceOnly: true },
    exec: {
      security: "ask",
      allowlist: ["node --version", "pwd", "ls *"]
    }
  }
}
```

Policy 必须在两处生效：

- 发送给模型前过滤 visible tools。
- tool dispatch 前再次检查。

## 安全边界

MyClaw v0 明确采用：

- 单用户本地 assistant model。
- workspace-bound file access。
- dangerous/mutating action approval。
- local-only gateway default。
- structured state audit。

不承诺：

- hostile multi-tenant isolation。
- 防止本机恶意用户。
- 完整容器沙箱。

## 关键风险

- 只在 prompt 里告诉模型不要做危险事，没有 runtime enforcement。
- allow/deny 只影响 UI，不影响 dispatch。
- approval 只靠终端交互，不落盘，无法 resume。
- `exec` 支持 shell interpolation 时没有清楚的风险提示。

## 验收标准

- 未 allow 的 tool 不出现在 agent schema，且 dispatch 也拒绝。
- `write` 和高风险 `exec` 会生成 approvalId。
- approvalId 能被 `myclaw resume` 恢复。
- cwd escape、absolute path、`..` escape 都有测试。
- stdout/stderr cap 和 timeout 有测试。
