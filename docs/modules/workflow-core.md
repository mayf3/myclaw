# Workflow Core

## 诊断

Workflow Core 是 MyClaw 的地基。它必须先于 agent 和 gateway 完成，因为 agent 只是生成或调用 workflow，gateway 只是远程控制 workflow。

## 参考项目观察

Hermes 的核心是 agent loop，workflow 不是第一等实体；这让它强在对话，但不适合作为 MyClaw 的 v0 起点。

OpenClaw Lobster 把 workflow 结果规范成 envelope，并支持 approval/resume，这是最值得吸收的设计。

## 推荐设计

Core 包只负责四件事：

- parse：把 string/file JSON 转成 workflow AST。
- run：按 step 执行，调用 tool registry。
- persist：把 run、step、approval 写入 state store。
- normalize：所有结果转成统一 envelope。

最小类型：

```ts
type Workflow = {
  id?: string;
  name?: string;
  steps: WorkflowStep[];
};

type WorkflowStep = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  approval?: "never" | "on_side_effect" | "always";
};

type RunStatus =
  | "created"
  | "running"
  | "needs_approval"
  | "ok"
  | "failed"
  | "cancelled";
```

Envelope 必须成为模块间协议：

```ts
type MyClawEnvelope =
  | {
      ok: true;
      status: "ok" | "needs_approval" | "cancelled";
      output: unknown[];
      requiresApproval: null | ApprovalRequest;
    }
  | {
      ok: false;
      error: { type?: string; message: string };
    };
```

## MVP 边界

Phase 1 只支持：

- pipeline string：`exec echo hello`。
- JSON workflow file。
- 串行 steps。
- single approval pause。
- resume approve/deny。
- timeout、stdout cap。

先不做：

- DAG。
- 条件分支。
- 循环。
- 并发。
- 外部 channel callback。
- LLM 自动生成 workflow。

## 模块依赖

输入依赖：

- `tools` 提供 tool descriptor 和 execute。
- `config-state-storage` 提供 state path 和 persistence adapter。

输出依赖：

- `cli` 调 `runWorkflow` / `resumeWorkflow`。
- `gateway` 调同一组 API。
- `agent-runtime` 后续把 tool call 映射成 workflow step 或直接调用 core runner。

## 关键风险

- AST 太复杂会拖慢第一阶段。
- 结果格式不统一会导致 CLI/gateway/UI 各写一套解析。
- approval 只存在内存里会导致进程退出后无法恢复。

## 验收标准

- `runWorkflow()` 和 `resumeWorkflow()` 是纯业务 API，不依赖 CLI。
- 所有成功、失败、approval、cancel 都返回 envelope。
- run 状态可从磁盘恢复。
- workflow step 失败后能看到 step id、tool name、错误消息。
