export function buildMilestonesPayload() {
  return {
    schemaVersion: 1,
    computed: false,
    source: "static-roadmap",
    currentPhase: "0.9",
    currentMilestone: "M2",
    summary: "Phase 0 is about local-first message, gateway, dashboard, Feishu boundary and reviewable OpenClaw migration.",
    milestones: [
      m("M0", "本地消息闭环", "done", 100, "CLI send/receive、state、channel registry 已可用"),
      m("M1", "Gateway 与 Dashboard", "partial", 70, "HTTP 控制面、run detail、reference matrix 已可用，缺 event stream"),
      m("M2", "Feishu/Lark 边界", "partial", 58, "signed encrypted challenge 与 custom-bot outbound facade 已有，缺 WebSocket/policy"),
      m("M3", "OpenClaw 迁移", "partial", 55, "plan/stage/review summary 已有，缺字段级 diff 和 apply"),
      m("M4", "Agent Runtime 与审批", "planned", 10, "还没有 LLM tool loop、approval queue 和 scoped token"),
      m("M5", "记忆、搜索与插件", "planned", 8, "还没有 SQLite/FTS、long memory、plugin manifest loader"),
    ],
  };
}

function m(id, label, status, score, evidence) {
  return { id, label, status, score, evidence };
}
