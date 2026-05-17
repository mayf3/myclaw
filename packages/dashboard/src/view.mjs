export function renderDashboardHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MyClaw Dashboard</title>
    <link rel="stylesheet" href="/assets/dashboard.css" />
  </head>
  <body>
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <p class="eyebrow">MyClaw Phase 0.8</p>
          <h1>运行与参考完成度</h1>
          <p>本地状态、OpenClaw 迁移、Feishu 复用决策、参考项目差距。</p>
        </div>
        <nav aria-label="Dashboard 导航">
          <a href="#overview">总览</a>
          <a href="#references">参考完成度</a>
          <a href="#feishu">Feishu/Lark</a>
          <a href="#migration">OpenClaw 迁移</a>
          <a href="#run-detail">Run 详情</a>
          <a href="#activity">运行与事件</a>
          <a href="#channels">通道</a>
          <a href="#raw">原始状态</a>
        </nav>
      </aside>

      <main>
        <header class="topbar">
          <div>
            <p class="eyebrow">Operational Console</p>
            <h2>MyClaw Dashboard</h2>
            <p id="subtitle">正在读取 /api/status ...</p>
          </div>
          <button type="button" id="refresh" aria-label="刷新状态">刷新</button>
        </header>

        <section id="overview" class="stats" aria-label="总览指标">
          <div class="stat"><span>参考完成度</span><strong id="completionScore">-</strong></div>
          <div class="stat"><span>最近 Runs</span><strong id="runCount">-</strong></div>
          <div class="stat"><span>最近事件</span><strong id="eventCount">-</strong></div>
          <div class="stat"><span>迁移阻塞项</span><strong id="migrationRisk">-</strong></div>
        </section>

        <section id="references" class="panel">
          <div class="section-head">
            <div>
              <h3>阶段参考完成度矩阵</h3>
              <p>每个模块都和 OpenClaw、Hermes-agent、OpenHuman 对齐，避免只看单点功能。</p>
            </div>
            <span id="referenceUpdated" class="pill">未加载</span>
          </div>
          <div id="referenceMatrix" class="empty">暂无参考矩阵</div>
        </section>

        <div class="two-col">
          <section id="feishu" class="panel">
            <div class="section-head">
              <div>
                <h3>Feishu/Lark 复用决策</h3>
                <p>回答：能不能直接用或参考现成的 OpenClaw Lark/Feishu 插件。</p>
              </div>
              <span id="feishuDecision" class="pill warn">待评估</span>
            </div>
            <div id="feishuPanel" class="empty">暂无 Feishu 决策</div>
          </section>

          <section id="migration" class="panel">
            <div class="section-head">
              <div>
                <h3>OpenClaw 迁移 Stage</h3>
                <p>当前只允许 plan/stage，不直接 apply 运行时配置。</p>
              </div>
              <span id="stageStatus" class="pill">未 stage</span>
            </div>
            <div id="migrationPanel" class="empty">暂无迁移计划</div>
          </section>
        </div>

        <section id="run-detail" class="panel">
          <div class="section-head">
            <div>
              <h3>最新 Run 详情</h3>
              <p>显示最近一次 run 的 envelope、事件和关键结果，避免只看摘要。</p>
            </div>
            <span id="runDetailStatus" class="pill">未加载</span>
          </div>
          <div id="runDetailPanel" class="empty">暂无 run detail</div>
        </section>

        <section id="activity" class="two-col">
          <div class="panel">
            <h3>最近 Runs</h3>
            <div id="runsTable" class="empty">暂无运行记录</div>
          </div>
          <div class="panel">
            <h3>事件 Timeline</h3>
            <div id="eventsTable" class="empty">暂无事件记录</div>
          </div>
        </section>

        <div class="two-col">
          <section id="channels" class="panel">
            <h3>通道能力</h3>
            <div id="channelsTable" class="empty">暂无通道</div>
          </section>

          <section class="panel">
            <h3>Gateway 入站样例</h3>
            <pre>POST /messages
Content-Type: application/json

{
  "channel": "console",
  "from": "local-user",
  "conversation": "local-thread",
  "text": "hello",
  "reply": "received"
}</pre>
          </section>
        </div>

        <section id="raw" class="panel">
          <div class="section-head">
            <div>
              <h3>原始状态</h3>
              <p>用于调试 status payload，不作为主要阅读入口。</p>
            </div>
          </div>
          <pre id="rawJson">{}</pre>
        </section>
      </main>
    </div>
    <script type="module" src="/assets/dashboard.js"></script>
  </body>
</html>`;
}
