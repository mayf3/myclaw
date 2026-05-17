export const dashboardCss = `
:root{
  color-scheme:light;
  --bg:#f4f6f7;
  --panel:#ffffff;
  --ink:#17202a;
  --muted:#657282;
  --line:#d8dee6;
  --line-strong:#c7d0da;
  --accent:#0f766e;
  --accent-soft:#dff3ef;
  --blue:#1d4ed8;
  --blue-soft:#dbeafe;
  --warn:#9a3412;
  --warn-soft:#ffedd5;
  --danger:#991b1b;
  --danger-soft:#fee2e2;
  --ok:#166534;
  --ok-soft:#dcfce7;
  --code:#0f172a;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0;
  background:var(--bg);
  color:var(--ink);
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","Microsoft YaHei",sans-serif;
  font-size:14px;
  line-height:1.5;
}
a{color:var(--accent);text-decoration:none}
a:hover,a:focus{text-decoration:underline}
.shell{display:grid;grid-template-columns:268px minmax(0,1fr);min-height:100vh}
.sidebar{
  position:sticky;
  top:0;
  height:100vh;
  overflow:auto;
  border-right:1px solid var(--line);
  background:#fff;
  padding:22px 18px;
}
.brand h1{margin:0 0 8px;font-size:22px;line-height:1.2}
.brand p{margin:0;color:var(--muted)}
.eyebrow{
  margin:0 0 6px;
  color:#45515f;
  font-size:12px;
  font-weight:800;
  letter-spacing:0;
  text-transform:uppercase;
}
nav{display:grid;gap:6px;margin-top:24px}
nav a{display:block;border-radius:6px;padding:8px 10px;color:#26323d;font-weight:700}
nav a:hover,nav a:focus{background:var(--accent-soft);text-decoration:none}
main{width:100%;max-width:1360px;padding:24px}
.topbar{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:16px;
  margin-bottom:16px;
}
.topbar h2{margin:0 0 4px;font-size:25px;line-height:1.2}
.topbar p{margin:0;color:var(--muted)}
button{
  border:1px solid var(--accent);
  border-radius:6px;
  background:var(--accent);
  color:#fff;
  padding:8px 12px;
  font:inherit;
  font-weight:800;
  cursor:pointer;
}
button:focus{outline:3px solid var(--accent-soft);outline-offset:2px}
section{margin-bottom:16px}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.stat{
  min-height:96px;
  border:1px solid var(--line);
  background:#fff;
  border-radius:8px;
  padding:14px;
}
.stat span{display:block;color:var(--muted);font-size:12px;font-weight:700}
.stat strong{display:block;margin-top:10px;font-size:30px;line-height:1}
.panel{
  border:1px solid var(--line);
  background:var(--panel);
  border-radius:8px;
  padding:16px;
}
.panel h3{margin:0 0 8px;font-size:17px}
.panel p{margin:0 0 10px;color:var(--muted)}
.section-head{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:12px;
  margin-bottom:12px;
}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.empty{
  border:1px dashed var(--line-strong);
  border-radius:8px;
  padding:16px;
  color:var(--muted);
  background:#fafbfc;
}
.pill,.tag{
  display:inline-flex;
  align-items:center;
  border-radius:999px;
  background:#eef2f6;
  color:#334155;
  padding:3px 9px;
  font-size:12px;
  font-weight:800;
  white-space:nowrap;
}
.pill.ok,.tag.ok{background:var(--ok-soft);color:var(--ok)}
.pill.warn,.tag.warn{background:var(--warn-soft);color:var(--warn)}
.pill.fail,.tag.fail{background:var(--danger-soft);color:var(--danger)}
.pill.info,.tag.info{background:var(--blue-soft);color:var(--blue)}
.reference-list{display:grid;gap:0;overflow:auto}
.reference-row{
  display:grid;
  grid-template-columns:210px 110px minmax(260px,1fr) 92px 92px 92px;
  gap:10px;
  align-items:center;
  min-width:860px;
  border-bottom:1px solid var(--line);
  padding:10px 0;
}
.reference-row:last-child{border-bottom:0}
.reference-header{
  position:sticky;
  top:0;
  z-index:1;
  background:#f8fafc;
  color:#334155;
  font-size:12px;
  font-weight:900;
}
.reference-name strong{display:block}
.reference-name span{display:block;color:var(--muted);font-size:12px}
.bar{
  height:10px;
  overflow:hidden;
  border-radius:999px;
  background:#e5e7eb;
}
.bar span{display:block;height:100%;background:var(--accent)}
.bar.weak span{background:var(--warn)}
.bar.bad span{background:var(--danger)}
.score{font-weight:900}
.small{font-size:12px;color:var(--muted)}
.criteria{margin-top:6px}
.criteria summary{cursor:pointer;color:#334155;font-size:12px;font-weight:800}
.criteria p{margin:7px 0 0}
.decision-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.decision-card{border:1px solid var(--line);border-radius:8px;padding:12px;background:#fff}
.decision-card strong{display:block;margin-bottom:6px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{border-bottom:1px solid var(--line);padding:9px 8px;text-align:left;vertical-align:top}
th{background:#f1f5f9;color:#334155;font-size:12px}
tr:last-child td{border-bottom:0}
.truncate{max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
pre{
  margin:0;
  border:1px solid var(--line);
  border-radius:8px;
  background:var(--code);
  color:#e5e7eb;
  padding:12px;
  overflow:auto;
  max-height:360px;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
@media (max-width:1080px){
  .reference-row{grid-template-columns:190px 94px minmax(240px,1fr) 86px 86px 86px}
}
@media (max-width:880px){
  .shell{display:block}
  .sidebar{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}
  nav{grid-template-columns:repeat(2,minmax(0,1fr))}
  main{padding:18px}
  .topbar{display:block}
  .topbar button{margin-top:12px}
  .stats,.two-col,.decision-grid{grid-template-columns:1fr}
  .reference-row{grid-template-columns:180px 90px minmax(220px,1fr) 82px 82px 82px}
}
`;
