export function buildHumanExperimentsPayload() {
  return {
    schemaVersion: 1,
    computed: false,
    source: "static-human-roadmap",
    currentPhase: "1.1",
    title: "Human Experiment Roadmap",
    goal: "把每个阶段改成用户可亲自验证的实验，而不是只看 agent 自评。",
    planningMap: [
      step("M0", "本地消息闭环", "E0", "立即可测"),
      step("M1", "Gateway 与 Dashboard", "E1", "立即可测"),
      step("M2", "Feishu/Lark 边界", "E2/E3", "配置后可测"),
      step("M3", "OpenClaw 迁移", "E4", "立即可测"),
      step("M4", "审批与安全", "E5", "立即可测"),
      step("M5", "Agent Runtime 与记忆", "E6", "后续开放"),
    ],
    experiments: [
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
        successSignals: ["Human Experiments 区块可见", "当前 Phase 显示 1.0", "每个实验都有命令和成功信号"],
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
        title: "Agent Runtime 与记忆实验",
        status: "planned",
        role: "长期使用者",
        whatToTest: "未来验证一次 agent 任务能拆解、调用工具、写入记忆，并被 Dashboard 追踪。",
        commands: ["后续开放：myclaw run --task ...", "后续开放：myclaw memory search ..."],
        successSignals: ["任务有 step timeline", "tool call 有权限记录", "记忆可搜索并可解释来源"],
        nextUnlock: "长期插件/skills 实验",
      }),
    ],
  };
}

function step(milestone, label, experimentId, userState) {
  return { milestone, label, experimentId, userState };
}

function experiment(input) {
  return input;
}
