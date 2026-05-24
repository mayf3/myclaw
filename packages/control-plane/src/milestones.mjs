export function buildMilestonesPayload() {
  return {
    schemaVersion: 1,
    computed: false,
    source: "static-roadmap",
    currentPhase: "1.2",
    currentMilestone: "M7",
    summary: "Phase 1.2 adds enforceable structure guardrails plus a layered human testing roadmap from access layer to memory.",
    milestones: [
      m("M0", "本地消息闭环", "done", 100, "CLI send/receive、state、channel registry 已可用"),
      m("M1", "Gateway 与 Dashboard", "partial", 82, "共享 control route adapter、run detail、reference matrix、人类实验路线已可用，缺 event stream"),
      m("M2", "Feishu/Lark 边界", "partial", 60, "signed encrypted challenge 与 custom-bot outbound facade 已有，缺 WebSocket/policy/app-token"),
      m("M3", "OpenClaw 迁移", "partial", 65, "plan/stage/review summary 与 stage review 已有，缺 apply/rollback"),
      m("M4", "Agent Runtime 与审批", "partial", 25, "已有 migration approval queue，缺 tool approval、LLM loop 和 scoped token"),
      m("M5", "记忆、搜索与插件", "planned", 8, "还没有 SQLite/FTS、long memory、plugin manifest loader"),
      m("M6", "工程约束与技术债", "done", 100, "npm run check 已强制 500 行、20 文件/目录、4 层目录深度和生成 HTML 新鲜度"),
      m("M7", "分层交互测试路线", "partial", 45, "L0-L6 测试路线已定义；E8-E10 仍是 planned，不代表能力已完成"),
    ],
  };
}

function m(id, label, status, score, evidence) {
  return { id, label, status, score, evidence };
}
