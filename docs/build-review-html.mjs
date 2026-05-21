import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { moduleMeta, moduleOrder } from "./lib/module-meta.mjs";
const ROOT = new URL(".", import.meta.url).pathname;
const MODULES_DIR = path.join(ROOT, "modules");
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[`"'’‘“”]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    || "section";
}
function inlineMarkdown(value) {
  let text = escapeHtml(value);
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const resolved = href.endsWith(".md") ? href.replace(/\.md($|#)/, ".html$1") : href;
    return `<a href="${escapeHtml(resolved)}">${label}</a>`;
  });
  return text;
}
function parseMarkdownTable(lines, start) {
  const header = lines[start];
  const divider = lines[start + 1] ?? "";
  if (!header.includes("|") || !/^\s*\|?\s*:?-{3,}/.test(divider)) {
    return null;
  }
  const rows = [];
  let index = start;
  while (index < lines.length && lines[index].includes("|")) {
    rows.push(lines[index]);
    index += 1;
  }
  const cells = (row) =>
    row
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => inlineMarkdown(cell.trim()));
  const [head, , ...body] = rows;
  return {
    next: index,
    html: `<div class="table-wrap"><table><thead><tr>${cells(head)
      .map((cell) => `<th>${cell}</th>`)
      .join("")}</tr></thead><tbody>${body
      .map((row) => `<tr>${cells(row).map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`,
  };
}
function renderMarkdown(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const title = lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim() ?? "模块评审";
  const headings = [];
  const body = [];
  let inCode = false;
  let codeLang = "";
  let code = [];
  let list = [];
  const flushList = () => {
    if (list.length) {
      body.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
      list = [];
    }
  };
  const flushCode = () => {
    if (inCode) {
      if (codeLang.trim().toLowerCase() === "mermaid") {
        body.push(`<div class="mermaid">${escapeHtml(code.join("\n"))}</div>`);
      } else {
        body.push(
          `<pre class="code" data-lang="${escapeHtml(codeLang || "text")}"><code>${escapeHtml(
            code.join("\n"),
          )}</code></pre>`,
        );
      }
      inCode = false;
      codeLang = "";
      code = [];
    }
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("```")) {
      if (inCode) {
        flushCode();
      } else {
        flushList();
        inCode = true;
        codeLang = line.replace(/^```/, "").trim();
        code = [];
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    const table = parseMarkdownTable(lines, i);
    if (table) {
      flushList();
      body.push(table.html);
      i = table.next - 1;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const text = heading[2].trim();
      if (level === 1) {
        continue;
      }
      const id = slugify(text);
      headings.push({ id, text, level });
      body.push(`<h${level} id="${id}">${inlineMarkdown(text)}</h${level}>`);
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      list.push(line.replace(/^\s*-\s+/, ""));
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      list.push(line.replace(/^\s*\d+\.\s+/, ""));
      continue;
    }
    if (!line.trim()) {
      flushList();
      continue;
    }
    flushList();
    body.push(`<p>${inlineMarkdown(line.trim())}</p>`);
  }
  flushList();
  flushCode();
  return { title, headings, html: body.join("\n") };
}
const css = `
:root{color-scheme:light;--bg:#f6f7f8;--panel:#fff;--ink:#1b1f23;--muted:#66717d;--line:#d8dee4;--accent:#0f766e;--accent-soft:#e0f2ef;--warn:#9a3412;--warn-soft:#ffedd5;--critical:#991b1b;--critical-soft:#fee2e2;--code:#101827}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","Microsoft YaHei",sans-serif;font-size:15px;line-height:1.6}
a{color:var(--accent);text-decoration:none}a:hover,a:focus{text-decoration:underline}
.shell{display:grid;grid-template-columns:292px minmax(0,1fr);min-height:100vh}
aside{position:sticky;top:0;height:100vh;overflow:auto;border-right:1px solid var(--line);background:#fff;padding:22px 18px}
main{max-width:1120px;width:100%;padding:30px}
.brand h1{margin:0 0 6px;font-size:21px;line-height:1.2}.brand p{margin:0 0 18px;color:var(--muted);font-size:13px}
nav{display:grid;gap:6px;margin-top:14px}nav a{display:block;border-radius:6px;padding:8px 10px;color:#26323d}nav a:hover,nav a:focus{background:var(--accent-soft);text-decoration:none}
.back{display:inline-block;margin-bottom:18px;color:#475569}
.hero{border:1px solid var(--line);border-left:5px solid var(--accent);background:#fff;padding:20px 22px;margin-bottom:18px}
.hero h2{margin:0 0 8px;font-size:25px;line-height:1.25}.hero p{margin:0;color:#34404b;max-width:860px}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.tag{border-radius:999px;background:#eef2f6;color:#334155;padding:3px 9px;font-size:12px;font-weight:700}.tag.p0{background:var(--critical-soft);color:var(--critical)}.tag.p1{background:var(--warn-soft);color:var(--warn)}.tag.phase{background:var(--accent-soft);color:#115e59}
.content{border:1px solid var(--line);background:#fff;padding:22px}.content h2{margin:24px 0 10px;padding-top:8px;font-size:21px}.content h2:first-child{margin-top:0}.content h3{margin:18px 0 8px;font-size:17px}.content p{margin:8px 0;color:#2f3944}.content ul{margin:8px 0 14px;padding-left:22px}.content li{margin:5px 0}
code{border-radius:4px;background:#eef2f6;color:var(--code);padding:2px 5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em}
.code{position:relative;margin:14px 0;border:1px solid var(--line);background:#0f172a;color:#e5e7eb;border-radius:8px;padding:16px;overflow:auto}.code code{background:transparent;color:inherit;padding:0}
.mermaid{margin:14px 0;border:1px solid var(--line);border-radius:8px;background:#fff;padding:14px;overflow:auto}
.table-wrap{overflow:auto;margin:14px 0}table{width:100%;border-collapse:collapse;border:1px solid var(--line);background:#fff}th,td{border-bottom:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}th{background:#eef2f6;font-size:13px}tr:last-child td{border-bottom:0}
.module-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}.module-link{border:1px solid var(--line);border-radius:8px;background:#fff;padding:12px}.module-link strong{display:block;margin-bottom:4px}.module-link span{display:block;color:var(--muted);font-size:13px}
@media (max-width:860px){.shell{display:block}aside{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}nav{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:20px}.module-grid{grid-template-columns:1fr}}
`;
const mermaidScript = `<script type="module">import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";mermaid.initialize({startOnLoad:true,theme:"default"});</script>`;
function moduleShell({ slug, title, headings, body }) {
  const meta = moduleMeta[slug] ?? { phase: "未分配", priority: "P2", label: "模块", summary: "" };
  const navItems = headings
    .filter((item) => item.level === 2)
    .map((item) => `<a href="#${item.id}">${escapeHtml(item.text)}</a>`)
    .join("\n");
  const siblingLinks = moduleOrder
    .filter((id) => id !== slug)
    .map((id) => {
      const sibling = moduleMeta[id];
      const source = readFileSync(path.join(MODULES_DIR, `${id}.md`), "utf8");
      const titleLine = source.match(/^#\s+(.+)$/m)?.[1] ?? id;
      return `<a class="module-link" href="./${id}.html"><strong>${escapeHtml(
        titleLine,
      )}</strong><span>${escapeHtml(sibling.summary)}</span></a>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · MyClaw 模块评审</title>
    <style>${css}</style>
  </head>
  <body>
    <div class="shell">
      <aside>
        <div class="brand">
          <h1>${escapeHtml(title)}</h1>
          <p>MyClaw 模块化设计评审</p>
        </div>
        <a class="back" href="../index.html">← 返回全局索引</a>
        <nav aria-label="模块导航">
          <a href="#module-summary">模块诊断</a>
          ${navItems}
          <a href="#related-modules">相关模块</a>
        </nav>
      </aside>
      <main>
        <section id="module-summary" class="hero">
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(meta.summary)}</p>
          <div class="meta">
            <span class="tag ${meta.priority.toLowerCase()}">${escapeHtml(meta.priority)}</span>
            <span class="tag phase">${escapeHtml(meta.phase)}</span>
            <span class="tag">${escapeHtml(meta.label)}</span>
          </div>
        </section>
        <article class="content">
          ${body}
          <h2 id="related-modules">相关模块</h2>
          <div class="module-grid">${siblingLinks}</div>
        </article>
      </main>
    </div>
    ${mermaidScript}
  </body>
</html>
`;
}
function buildModule(slug) {
  const mdPath = path.join(MODULES_DIR, `${slug}.md`);
  const source = readFileSync(mdPath, "utf8");
  const parsed = renderMarkdown(source);
  writeFileSync(
    path.join(MODULES_DIR, `${slug}.html`),
    moduleShell({ slug, title: parsed.title, headings: parsed.headings, body: parsed.html }),
  );
}
function buildDesignReview() {
  const source = readFileSync(path.join(ROOT, "design-review.md"), "utf8");
  const parsed = renderMarkdown(source);
  const body = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(parsed.title)} · MyClaw</title>
    <style>${css}</style>
  </head>
  <body>
    <div class="shell">
      <aside>
        <div class="brand">
          <h1>${escapeHtml(parsed.title)}</h1>
          <p>总览 HTML 版本</p>
        </div>
        <a class="back" href="./index.html">← 返回全局索引</a>
        <nav aria-label="总览导航">
          <a href="#module-summary">总诊断</a>
          ${parsed.headings
            .filter((item) => item.level === 2)
            .map((item) => `<a href="#${item.id}">${escapeHtml(item.text)}</a>`)
            .join("\n")}
        </nav>
      </aside>
      <main>
        <section id="module-summary" class="hero">
          <h2>总览</h2>
          <p>MyClaw 模块化设计评审的总判断、阶段路线和模块入口。</p>
          <div class="meta">
            <span class="tag p0">P0</span>
            <span class="tag phase">全局</span>
            <span class="tag">架构评审</span>
          </div>
        </section>
        <article class="content">${parsed.html}</article>
      </main>
    </div>
    ${mermaidScript}
  </body>
</html>
`;
  writeFileSync(path.join(ROOT, "design-review.html"), body);
}
function buildStageStatus() {
  const source = readFileSync(path.join(ROOT, "stage-status.md"), "utf8");
  const parsed = renderMarkdown(source);
  const body = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(parsed.title)} · MyClaw</title>
    <style>${css}</style>
  </head>
  <body>
    <div class="shell">
      <aside>
        <div class="brand">
          <h1>${escapeHtml(parsed.title)}</h1>
          <p>当前阶段与实现状态</p>
        </div>
        <a class="back" href="./index.html">← 返回全局索引</a>
        <nav aria-label="阶段状态导航">
          <a href="#module-summary">状态摘要</a>
          ${parsed.headings
            .filter((item) => item.level === 2)
            .map((item) => `<a href="#${item.id}">${escapeHtml(item.text)}</a>`)
            .join("\n")}
        </nav>
      </aside>
      <main>
        <section id="module-summary" class="hero">
          <h2>阶段状态</h2>
          <p>MyClaw 当前 Phase 1.0 的可运行能力、用户实验、验证记录、下一步和风险。</p>
          <div class="meta">
            <span class="tag p0">P0</span>
            <span class="tag phase">Phase 1.0</span>
            <span class="tag">状态文档</span>
          </div>
        </section>
        <article class="content">${parsed.html}</article>
      </main>
    </div>
    ${mermaidScript}
  </body>
</html>
`;
  writeFileSync(path.join(ROOT, "stage-status.html"), body);
}
function buildImplementationArchitecture() {
  const source = readFileSync(path.join(ROOT, "implementation-architecture.md"), "utf8");
  const parsed = renderMarkdown(source);
  const body = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(parsed.title)} · MyClaw</title>
    <style>${css}</style>
  </head>
  <body>
    <div class="shell">
      <aside>
        <div class="brand">
          <h1>${escapeHtml(parsed.title)}</h1>
          <p>当前实现架构与阶段评审</p>
        </div>
        <a class="back" href="./index.html">← 返回全局索引</a>
        <nav aria-label="架构评审导航">
          <a href="#module-summary">总诊断</a>
          ${parsed.headings
            .filter((item) => item.level === 2)
            .map((item) => `<a href="#${item.id}">${escapeHtml(item.text)}</a>`)
            .join("\n")}
        </nav>
      </aside>
      <main>
        <section id="module-summary" class="hero">
          <h2>当前实现架构</h2>
          <p>MyClaw Phase 1.0 的人类实验路线、共享控制路由和当前架构审查。</p>
          <div class="meta">
            <span class="tag p0">P0</span>
            <span class="tag phase">Phase 1.0</span>
            <span class="tag">实现评审</span>
          </div>
        </section>
        <article class="content">${parsed.html}</article>
      </main>
    </div>
    ${mermaidScript}
  </body>
</html>
`;
  writeFileSync(path.join(ROOT, "implementation-architecture.html"), body);
}
function rewriteIndexLinks() {
  const indexPath = path.join(ROOT, "index.html");
  let html = readFileSync(indexPath, "utf8");
  html = html
    .replaceAll("./design-review.md", "./design-review.html")
    .replaceAll("./stage-status.md", "./stage-status.html")
    .replaceAll("./implementation-architecture.md", "./implementation-architecture.html")
    .replaceAll("./modules/README.md", "./modules/README.html");
  for (const slug of moduleOrder) {
    html = html.replaceAll(`./modules/${slug}.md`, `./modules/${slug}.html`);
  }
  writeFileSync(indexPath, html);
}
for (const slug of moduleOrder) {
  buildModule(slug);
}
const readmePath = path.join(MODULES_DIR, "README.md");
if (statSync(readmePath).isFile()) {
  const source = readFileSync(readmePath, "utf8");
  const parsed = renderMarkdown(source);
  writeFileSync(
    path.join(MODULES_DIR, "README.html"),
    moduleShell({ slug: "roadmap-acceptance", title: parsed.title, headings: parsed.headings, body: parsed.html }),
  );
}
buildDesignReview();
buildStageStatus();
buildImplementationArchitecture();
rewriteIndexLinks();
const htmlFiles = readdirSync(MODULES_DIR).filter((file) => file.endsWith(".html")).length + 4;
console.log(`Generated ${htmlFiles} HTML files`);
