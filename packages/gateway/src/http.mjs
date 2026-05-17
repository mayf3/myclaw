const MAX_BODY_BYTES = 1024 * 1024;

export function sendJson(response, status, payload) {
  sendText(response, status, "application/json; charset=utf-8", JSON.stringify(payload, null, 2));
}

export function sendHtml(response, html) {
  sendText(response, 200, "text/html; charset=utf-8", html);
}

export function sendText(response, status, contentType, body, cacheControl = "no-store") {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": cacheControl,
  });
  response.end(body);
}

export async function readJsonBody(request) {
  const rawBody = await readTextBody(request);
  if (!rawBody.trim()) {
    return { rawBody, body: {} };
  }
  try {
    return { rawBody, body: JSON.parse(rawBody) };
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

export function readTextBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let text = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large."));
        request.destroy();
        return;
      }
      text += chunk;
    });
    request.on("end", () => resolve(text));
    request.on("error", reject);
  });
}
