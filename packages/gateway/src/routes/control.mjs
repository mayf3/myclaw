import { getDashboardAsset, renderDashboardHtml } from "../../../dashboard/src/index.mjs";
import { resolveControlGetRoute } from "../../../control-plane/src/http-routes.mjs";
import { sendHtml, sendJson, sendText } from "../http.mjs";

export async function handleGetRequest(url, response, context) {
  if (url.pathname === "/") {
    sendHtml(response, renderDashboardHtml());
    return true;
  }
  const asset = getDashboardAsset(url.pathname);
  if (asset) {
    sendText(response, 200, asset.contentType, asset.body, "public, max-age=60");
    return true;
  }
  const route = await resolveControlGetRoute(url, { ...context, service: "myclaw-gateway" });
  if (route.handled) {
    sendJson(response, route.status, route.payload);
    return true;
  }
  return false;
}
