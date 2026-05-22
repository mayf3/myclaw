const moduleDefinitions = [
  {
    id: "gateway",
    label: "Gateway / 控制面",
    phase: "1.1",
    openclaw: 90,
    hermes: 78,
    openhuman: 86,
    gap: "已拆 routes/auth、共享 read route adapter，并有 approval decision mutation，仍缺 WS/event stream、scoped token、route schema",
    next: "增加 mutation audit 和 scoped token",
    criteria: [
      c("gateway-http", "HTTP health/status/messages/runs/stage routes", "done", 100, "packages/gateway/src/routes"),
      c("gateway-guard", "loopback/token mutation guard", "done", 80, "packages/gateway/src/auth.mjs"),
      c("gateway-adapter", "shared read control route adapter", "partial", 80, "packages/control-plane/src/http-routes.mjs"),
      c("gateway-stream", "WS/SSE event stream and scoped token", "missing", 0, "OpenClaw/Hermes reference"),
    ],
  },
  {
    id: "feishu",
    label: "Feishu/Lark 接入",
    phase: "1.1",
    openclaw: 92,
    hermes: 42,
    openhuman: 35,
    gap: "已有 adapter/signature/encrypted challenge/custom-bot outbound facade，缺 WebSocket、policy、app token rich card",
    next: "扩展 encrypted event、app token outbound、policy 和持久 replay",
    criteria: [
      c("feishu-event", "event challenge/text normalization", "partial", 70, "packages/feishu-adapter/src/index.mjs"),
      c("feishu-security", "verify token, x-lark signature, replay guard, encrypted challenge", "partial", 75, "packages/feishu-adapter/test/feishu-adapter.test.mjs"),
      c("feishu-runtime", "custom-bot outbound facade, encrypted events, WebSocket, policy", "partial", 35, "packages/feishu-adapter/src/outbound.mjs"),
    ],
  },
  {
    id: "dashboard",
    label: "Dashboard / 观测",
    phase: "1.0",
    openclaw: 78,
    hermes: 55,
    openhuman: 90,
    gap: "已有 run detail/stage summary/stage review/approval queue/human experiments，缺实时事件和完整 review drawer",
    next: "把 approval queue 和 event stream 做成一等操作面",
    criteria: [
      c("dashboard-status", "state/runs/events/channels/milestones/experiments/approvals view", "done", 84, "packages/dashboard/src/client.mjs"),
      c("dashboard-reference", "reference matrix, Feishu adoption and adapter readiness", "partial", 65, "packages/dashboard/src/client.mjs"),
      c("dashboard-actions", "run detail, approval queue and stage review summary", "partial", 70, "packages/dashboard/src/client.mjs"),
    ],
  },
  {
    id: "migration",
    label: "OpenClaw 迁移",
    phase: "0.8",
    openclaw: 0,
    hermes: 82,
    openhuman: 35,
    gap: "已有 plan/stage/review summary/stage review/approval seed，缺 apply/rollback 和字段级 diff UI",
    next: "只允许从 staged snapshot apply --module feishu",
    criteria: [
      c("migration-plan", "dry-run config and manifest inventory", "done", 75, "packages/migrate/src/openclaw.mjs"),
      c("migration-stage", "reviewable stage snapshot with checksum, diff and approval", "partial", 80, "packages/migrate/src/stage.mjs"),
      c("migration-apply", "field diff UI, apply, rollback", "missing", 35, "docs/modules/openclaw-migration.md"),
    ],
  },
  {
    id: "agent-runtime",
    label: "Agent Runtime",
    phase: "1+",
    openclaw: 76,
    hermes: 92,
    openhuman: 90,
    gap: "还没有 agent turn、tool loop、subagent、context budget",
    next: "先做 run/resume/approval 状态机，再接 LLM/tool loop",
    criteria: [
      c("runtime-envelope", "message envelope and persistence seed", "partial", 25, "packages/runtime/src/messages.mjs"),
      c("agent-loop", "LLM turn and tool loop", "missing", 0, "Phase 1 backlog"),
      c("agent-context", "context budget and subagent runner", "missing", 0, "Hermes/OpenHuman reference"),
    ],
  },
  {
    id: "memory",
    label: "Memory / Session Search",
    phase: "1+",
    openclaw: 52,
    hermes: 94,
    openhuman: 96,
    gap: "仅有 JSON/JSONL state，没有 SQLite/FTS/long-term memory",
    next: "先做 run/session FTS，再做长期记忆",
    criteria: [
      c("state-files", "runs/events persisted as local files", "partial", 30, "packages/core/src/state.mjs"),
      c("session-search", "SQLite/FTS session search", "missing", 0, "Hermes reference"),
      c("long-memory", "long-term memory tree/entity graph", "missing", 0, "OpenHuman reference"),
    ],
  },
  {
    id: "tools-security",
    label: "Tools / Approval / Security",
    phase: "1+",
    openclaw: 88,
    hermes: 74,
    openhuman: 84,
    gap: "已有 migration approval queue，缺 tool schema、tool approval、policy snapshot、sandbox",
    next: "把 approval 从 message reply 提升成独立 state",
    criteria: [
      c("mutation-guard", "gateway mutation token guard", "partial", 40, "packages/gateway/src/index.mjs"),
      c("approval-state", "approval as first-class state", "partial", 45, "packages/core/src/approvals.mjs"),
      c("tool-policy", "tool schema/policy/sandbox", "missing", 0, "OpenClaw/OpenHuman reference"),
    ],
  },
  {
    id: "plugins-skills",
    label: "Plugins / Skills",
    phase: "2+",
    openclaw: 92,
    hermes: 88,
    openhuman: 78,
    gap: "仅有 channel registry，没有 plugin manifest/skill loader",
    next: "先做只读 skill loader，再做 plugin manifest",
    criteria: [
      c("channel-registry", "static channel registry", "partial", 30, "packages/channels/src/index.mjs"),
      c("skill-rule", "design review skill governance", "partial", 25, "~/.codex/skills/web-design-review/SKILL.md"),
      c("plugin-runtime", "manifest validation and runtime loader", "missing", 0, "OpenClaw reference"),
    ],
  },
];

export function buildReferenceCompletionPayload() {
  const modules = moduleDefinitions.map(withScore);
  const average = Math.round(modules.reduce((sum, item) => sum + item.myclaw, 0) / modules.length);
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    scale: "0-100, computed from explicit MyClaw criteria and compared to reference capability",
    average,
    references: [
      { id: "openclaw", label: "OpenClaw", role: "channel/plugin/gateway/security reference" },
      { id: "hermes-agent", label: "Hermes-agent", role: "agent loop/memory/gateway operations reference" },
      { id: "openhuman", label: "OpenHuman", role: "UI/control plane/memory/controller reference" },
    ],
    modules,
  };
}

export function buildFeishuAdoptionPayload() {
  return {
    schemaVersion: 1,
    directUse: false,
    referenceUse: true,
    source: "/Users/yanfenma/workspace/github/openclaw/extensions/feishu",
    packageName: "@openclaw/feishu",
    verdict:
      "Do not directly load the OpenClaw Feishu plugin in MyClaw Phase 0. It depends on OpenClaw plugin-sdk/runtime contracts. Reuse the design, schema, security tests, and event/outbound normalization ideas.",
    reuse: [
      "config schema: appId/appSecret/verificationToken/encryptKey/domain/connectionMode/accounts",
      "security posture: x-lark signature uses sha256(timestamp + nonce + encryptKey + rawBody)",
      "event model: message, card action, reaction, comment, media and dedup keys",
      "policy model: DM/group allowlist, mention requirement, pairing/approval",
      "outbound model: text/card/threading/send result normalization; MyClaw has a facade, not app token delivery yet",
    ],
    blockers: [
      "OpenClaw plugin depends on @openclaw/plugin-sdk and OpenClaw runtime APIs",
      "plugin surface includes doc/drive/wiki/bitable tools far beyond MyClaw Phase 0",
      "direct loading would import OpenClaw config, secret and approval semantics before MyClaw owns them",
    ],
    next: "Use the MyClaw Feishu adapter facade as the only gateway dependency, then port encrypted events, app-token outbound and policy pieces.",
  };
}

function c(id, label, status, points, evidence) {
  return { id, label, status, points, evidence };
}

function withScore(item) {
  const myclaw = Math.round(item.criteria.reduce((sum, criterion) => sum + criterion.points, 0) / item.criteria.length);
  return { ...item, myclaw };
}
