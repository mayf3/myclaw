export function buildMilestonesPayload() {
  return {
    schemaVersion: 1,
    computed: false,
    source: "static-roadmap",
    currentPhase: "1.0",
    currentMilestone: "M1",
    summary: "Phase 1.0 makes the roadmap testable by humans and removes duplicated control routes before deeper agent work.",
    milestones: [
      m("M0", "本地消息闭环", "done", 100, "CLI send/receive、state、channel registry 已可用"),
      m("M1", "Gateway 与 Dashboard", "partial", 78, "共享 control route adapter、run detail、reference matrix、人类实验路线已可用，缺 event stream"),
      m("M2", "Feishu/Lark 边界", "partial", 60, "signed encrypted challenge 与 custom-bot outbound facade 已有，缺 WebSocket/policy/app-token"),
      m("M3", "OpenClaw 迁移", "partial", 58, "plan/stage/review summary 已有，缺字段级 diff 和 apply"),
      m("M4", "Agent Runtime 与审批", "planned", 10, "还没有 LLM tool loop、approval queue 和 scoped token"),
      m("M5", "记忆、搜索与插件", "planned", 8, "还没有 SQLite/FTS、long memory、plugin manifest loader"),
    ],
  };
}

function m(id, label, status, score, evidence) {
  return { id, label, status, score, evidence };
}
