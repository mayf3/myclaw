# 记忆、Session 与搜索

## 诊断

记忆不是第一阶段功能，但数据模型要从第一天为它留口。否则后面接入 agent 后，历史、记忆、workflow run、approval 会分散成多套不可检索日志。

## 参考项目观察

Hermes 最值得借鉴：

- SQLite state db。
- messages 表 + sessions 表。
- FTS5 全文搜索。
- parent_session_id 记录压缩/派生 lineage。
- session_search 工具将历史会话召回给 agent。
- MEMORY.md / USER.md 保存持久事实。

OpenClaw 最值得借鉴：

- JSONL transcript 直观、易调试。
- session key 区分 main/direct/group/cron/agent。
- session 生命周期有 daily/idle/manual reset。
- workspace bootstrap files：AGENTS.md、SOUL.md、TOOLS.md、USER.md。

OpenHuman 最值得借鉴：

- `memory/conversations/` 把 conversation JSONL 和 searchable memory 分开。
- `memory/store/` 用 SQLite、FTS、vector、graph 做统一 store，但通过 `MemoryClient` 隔离调用者。
- `memory/tree/` 是重管线：canonicalize、chunk、content_store、score、tree_source/tree_topic/tree_global、retrieval、jobs。
- `memory/ingestion/` 有 singleton queue，避免本地 LLM 抽取并发重入。

对 MyClaw 的结论：先做 conversation/run/session search，不要初期上 memory tree。

## 推荐设计

Phase 1/2 先做 run state，不做完整 memory：

```text
~/.myclaw/
  config.json5
  state/
    runs/
      <runId>.json
      <runId>.jsonl
    approvals.json
```

Phase 3 agent 加 transcript：

```text
~/.myclaw/
  agents/main/sessions/
    sessions.json
    <sessionId>.jsonl
```

Phase 3.5 加轻量 session search：

```text
state.db
  runs
  events
  messages
  tool_calls
  messages_fts
```

Phase 6 再迁移 SQLite：

```text
state.db
  runs
  run_steps
  approvals
  sessions
  messages
  messages_fts
  memories
```

## Memory 类型

分三类，避免混在一个文件里：

- User memory：用户偏好、稳定背景、称呼。
- Project memory：当前 workspace 的约定、脚本、路径。
- Procedure memory / skill：可复用工作流步骤。

推荐文件：

```text
workspace/
  AGENTS.md
  MYCLAW.md
  skills/
```

全局：

```text
~/.myclaw/memory/USER.md
~/.myclaw/memory/MEMORY.md
```

## Session Search

Phase 6 实现：

- keyword search。
- recent sessions。
- run search。
- approval history search。
- agent 可调用 `session_search`。

搜索结果不要直接塞全文，应返回摘要：

```ts
type SearchHit = {
  sessionId?: string;
  runId?: string;
  title: string;
  when: string;
  summary: string;
  source: "session" | "run" | "memory";
};
```

## MVP 边界

Phase 1：

- run JSONL。
- approval index。

Phase 3：

- agent transcript JSONL。
- session list/status。

Phase 3.5：

- SQLite + FTS。
- run/session/tool result search。
- `myclaw search`。

Phase 6：

- memory files。
- session_search tool。
- 可选 embedding/chunk/summary tree。

## 关键风险

- 过早做复杂 memory，会影响 workflow core。
- 把临时任务进度写入长期 memory，导致 prompt 污染。
- transcript 没有结构化 tool call，后续搜索无法理解行为。

## 验收标准

- 每个 run 可追溯到 step 和 approval。
- 每个 agent turn 可追溯到 tool call 和 tool result。
- memory 注入 prompt 前有大小限制和来源标注。
- session search 返回摘要和来源，不直接塞超长全文。
