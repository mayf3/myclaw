export function buildMilestonesPayload() {
  return {
    schemaVersion: 1,
    computed: false,
    source: "static-roadmap",
    currentPhase: "1.5",
    currentMilestone: "M1",
    summary:
      "Phase 1.5 adds Gateway SSE snapshots and scoped tokens on top of mutation audit and Dashboard health.",
    milestones: [
      m("M0", "本地消息闭环", "done", 100, "CLI send/receive、state、channel registry 已可用"),
      m("M1", "Gateway 与 Dashboard", "partial", 92, "共享 control route adapter、run detail、reference matrix、人类实验路线、health strip、mutation audit、SSE snapshot 和 scoped token 已可用，缺 route schema"),
      m(
        "M2",
        "Feishu/Lark 边界",
        "partial",
        88,
        "signed encrypted challenge、custom-bot outbound facade、openduck credential import、WebSocket app-token 群回复、default-closed local policy、persistent replay 和 redacted reads 已可用，缺 rich card/agent replyBuilder",
      ),
      m("M3", "OpenClaw 迁移", "partial", 65, "plan/stage/review summary 与 stage review 已有，缺 apply/rollback"),
      m("M4", "Agent Runtime 与审批", "partial", 25, "已有 migration approval queue，缺 tool approval、LLM loop 和 tool execution policy"),
      m("M5", "记忆、搜索与插件", "planned", 8, "还没有 SQLite/FTS、long memory、plugin manifest loader"),
      m("M6", "工程约束与技术债", "done", 100, "npm run check 已强制 500 行、20 文件/目录、4 层目录深度和生成 HTML 新鲜度"),
      m("M7", "分层交互测试路线", "partial", 45, "L0-L6 测试路线已定义；E8-E10 仍是 planned，不代表能力已完成"),
    ],
  };
}

function m(id, label, status, score, evidence) {
  return { id, label, status, score, evidence };
}
