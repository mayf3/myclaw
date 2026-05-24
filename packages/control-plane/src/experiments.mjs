export function buildHumanExperimentsPayload() {
  const experiments = [
    experiment({
      id: "E0",
      milestone: "M0",
      title: "本地消息闭环",
      status: "ready",
      role: "本机使用者",
      whatToTest: "确认 CLI 能发送消息、写入 run/event，并能用 JSON 输出复核结果。",
      commands: ['npm run myclaw -- send --text "hello from human" --json'],
      successSignals: ["命令返回 ok envelope", "state 里新增 run", "Dashboard 最近 Runs 能看到这条消息"],
      nextUnlock: "E1 Dashboard 可视化检查",
    }),
    experiment({
      id: "E1",
      milestone: "M1",
      title: "Dashboard 可读性与路线图检查",
      status: "ready",
      role: "产品试用者",
      whatToTest: "打开 Dashboard，判断 3 分钟内能否看懂当前阶段、最近消息、参考完成度和下一步。",
      commands: [
        "npm run myclaw -- dashboard --port 4321 --openclaw-source /Users/yanfenma/workspace/github/openclaw",
        "open http://127.0.0.1:4321",
        "curl -s http://127.0.0.1:4321/api/experiments",
      ],
      successSignals: ["Human Experiments 区块可见", "当前 Phase 显示 1.2", "每个实验都有命令和成功信号"],
      nextUnlock: "E2 Feishu outbound smoke",
    }),
    experiment({
      id: "E2",
      milestone: "M2",
      title: "Feishu custom-bot outbound",
      status: "needs_config",
      role: "飞书群机器人配置者",
      whatToTest: "用 Feishu/Lark custom bot webhook 验证 MyClaw 能把文本发到群里。",
      commands: [
        'export MYCLAW_FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/..."',
        'npm run myclaw -- send --channel feishu-webhook --webhook-url "$MYCLAW_FEISHU_WEBHOOK_URL" --text "hello from MyClaw" --json',
      ],
      successSignals: ["飞书群收到消息", "返回 result.code 为 0", "Dashboard 最新 run 显示 feishu-webhook"],
      nextUnlock: "E3 signed callback smoke",
    }),
    experiment({
      id: "E3",
      milestone: "M2",
      title: "Feishu callback 本地校验",
      status: "needs_config",
      role: "集成验证者",
      whatToTest: "先用 verify token 验证 callback challenge，再用测试套件覆盖 signed/encrypted fixture。",
      commands: [
        "MYCLAW_FEISHU_VERIFY_TOKEN=verify-token MYCLAW_FEISHU_ENCRYPT_KEY=encrypt-key npm run myclaw -- gateway --port 4322",
        'curl -s http://127.0.0.1:4322/feishu/events -H "content-type: application/json" -d \'{"token":"verify-token","challenge":"plain"}\'',
        "npm test -- packages/gateway/test/gateway.test.mjs",
      ],
      successSignals: ["本地 challenge 回显 plain", "签名错误 fixture 被拒绝", "encrypted challenge fixture 通过"],
      nextUnlock: "E4 migration review",
    }),
    experiment({
      id: "E4",
      milestone: "M3",
      title: "OpenClaw 迁移 review-only stage",
      status: "ready",
      role: "迁移审阅者",
      whatToTest: "确认一键迁移当前只做 plan/stage，不会直接 apply OpenClaw 运行时配置。",
      commands: [
        "npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --json",
        "npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --stage --json",
      ],
      successSignals: ["输出 destructive=false", "stage.forReviewOnly=true", "Dashboard stage summary 显示 missing/blocked"],
      nextUnlock: "E5 approval queue",
    }),
    experiment({
      id: "E5",
      milestone: "M4",
      title: "审批队列与迁移确认",
      status: "ready",
      role: "安全审阅者",
      whatToTest: "验证 OpenClaw stage 会生成 pending approval，并且用户能用 gateway token 明确 approve/reject。",
      commands: [
        "MYCLAW_GATEWAY_TOKEN=dev-token npm run myclaw -- gateway --port 4322 --openclaw-source /Users/yanfenma/workspace/github/openclaw",
        'curl -s http://127.0.0.1:4322/api/openclaw-migration/stage -H "content-type: application/json" -H "x-myclaw-token: dev-token" -d "{}"',
        "curl -s http://127.0.0.1:4322/api/approvals",
        'curl -s http://127.0.0.1:4322/api/approvals/<approvalId>/decision -H "content-type: application/json" -H "x-myclaw-token: dev-token" -d \'{"decision":"rejected","reason":"human smoke"}\'',
      ],
      successSignals: ["pending approval 出现在 Dashboard", "decision 写入 approval record", "events timeline 出现 approval.decided"],
      nextUnlock: "E6 agent tool loop",
    }),
    experiment({
      id: "E6",
      milestone: "M5",
      title: "单 Agent Runtime 实验",
      status: "planned",
      role: "长期使用者",
      whatToTest: "未来验证一次 agent 任务能拆解、调用工具、失败重试、请求人工确认，并被 Dashboard 追踪。",
      commands: ["后续开放：myclaw run --task ...", "后续开放：myclaw run --resume <runId>"],
      successSignals: ["任务有 step timeline", "tool call 有权限记录", "失败可重试或进入人工确认"],
      nextUnlock: "E8 Session provenance 实验",
    }),
    experiment({
      id: "E7",
      milestone: "M6",
      title: "工程约束红线检查",
      status: "ready",
      role: "协作开发者",
      whatToTest: "确认生成 HTML 不 stale，且每个目录最多 20 个文件、最多 4 层子目录、单文件最多 500 行都会被 npm run check 拦住。",
      commands: ["npm run check", "node scripts/check-generated-docs.mjs", "node scripts/check-file-lines.mjs"],
      successSignals: ["生成文档输出 up to date", "结构检查输出 20 files/dir", "结构检查输出 depth 4", "没有目录或文件超过红线"],
      nextUnlock: "下一阶段拆 Dashboard renderer 并接入 tool approval",
    }),
    experiment({
      id: "E8",
      milestone: "M7",
      title: "Session Search / Provenance 实验",
      status: "planned",
      role: "长期使用者",
      whatToTest: "未来验证 run、step、tool result 能按关键词检索，并且召回结果带来源，给单 Agent 和 Agent-to-Agent 复用。",
      commands: ["后续开放：myclaw search \"...\"", "后续开放：myclaw show <runId> --json"],
      successSignals: ["检索结果带 runId/stepId/messageId", "召回内容有来源和时间", "上下文注入有大小上限"],
      nextUnlock: "E9 Agent-to-Agent 协作实验",
    }),
    experiment({
      id: "E9",
      milestone: "M7",
      title: "Agent-to-Agent 协作实验",
      status: "planned",
      role: "协作任务测试者",
      whatToTest: "未来验证两个 agent 能围绕同一任务分工、交接上下文、互相审查结果，并留下可追踪记录。",
      commands: ["后续开放：myclaw run --task \"拆解并互审一个任务\" --agents 2 --json"],
      successSignals: ["每个 agent 有独立 run/step", "交接上下文有记录", "最终结果经过另一个 agent review"],
      nextUnlock: "E10 Long Memory / Search 长期记忆实验",
    }),
    experiment({
      id: "E10",
      milestone: "M7",
      title: "Long Memory / Search 长期记忆实验",
      status: "planned",
      role: "长期使用者",
      whatToTest: "未来验证 MyClaw 能保存长期事实、按来源检索、解释为什么召回，并支持遗忘或降权。",
      commands: ["后续开放：myclaw memory add ...", "后续开放：myclaw memory search \"...\"", "后续开放：myclaw memory delete <id>"],
      successSignals: ["召回结果带来源", "记忆能被 run 引用", "用户可删除或禁用一条记忆"],
      nextUnlock: "长期个性化和跨会话 agent",
    }),
  ];
  return {
    schemaVersion: 1,
    computed: false,
    source: "static-human-roadmap",
    currentPhase: "1.2",
    title: "Human Experiment Roadmap",
    goal: "把每个阶段改成用户可亲自验证的实验：先接入层和 gateway，再进入 agent、agent 协作和复杂记忆。",
    layerRoadmap: [
      layer("L0", "接入层", "人与外部系统的消息进入、发出和归一化。", "partial", ["E0", "E2", "E3"]),
      layer("L1", "Gateway", "统一 HTTP 控制面、鉴权、状态查询、事件进入。", "partial", ["E1", "E3", "E5"]),
      layer("L2", "Workflow 与审批", "迁移和后续工具调用必须先进入 review/approval。", "partial", ["E4", "E5"]),
      layer("L3", "单 Agent Runtime", "一次任务能拆解、执行、失败重试、人工确认和验收。", "planned", ["E6"]),
      layer("L4", "Session Search / Provenance", "run、step、tool result 可检索，召回来源可解释。", "planned", ["E8"]),
      layer("L5", "Agent-to-Agent", "多个 agent 能分工、交接上下文、互相校验结果。", "planned", ["E9"]),
      layer("L6", "Long Memory / Search", "长期事实、来源解释、遗忘策略和跨会话召回。", "planned", ["E10"]),
    ],
    planningMap: [
      step("M0", "本地消息闭环", "E0", "立即可测"),
      step("M1", "Gateway 与 Dashboard", "E1", "立即可测"),
      step("M2", "Feishu/Lark 边界", "E2/E3", "配置后可测"),
      step("M3", "OpenClaw 迁移", "E4", "立即可测"),
      step("M4", "审批与安全", "E5", "立即可测"),
      step("M5", "Agent Runtime 与记忆", "E6", "后续开放"),
      step("M6", "工程约束与技术债", "E7", "立即可测"),
      step("M7", "分层交互测试路线", "E8/E9/E10", "路线已定义，功能后续开放"),
    ],
    experiments,
  };
}

function layer(id, label, purpose, status, experiments) {
  return { id, label, purpose, status, experiments };
}

function step(milestone, label, experimentId, userState) {
  return { milestone, label, experimentId, userState };
}

function experiment(input) {
  return input;
}
