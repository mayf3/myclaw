import { dashboardClientJs } from "./client.mjs";
import { dashboardCss } from "./styles.mjs";

const assets = new Map([
  ["/assets/dashboard.css", { contentType: "text/css; charset=utf-8", body: dashboardCss }],
  ["/assets/dashboard.js", { contentType: "text/javascript; charset=utf-8", body: dashboardClientJs }],
]);

export function getDashboardAsset(pathname) {
  return assets.get(pathname) || null;
}
