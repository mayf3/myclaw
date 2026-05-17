export function authorizeGatewayMutation(request, context) {
  const token = String(context.token || "");
  if (!token && !isLoopbackHost(context.host)) {
    return {
      ok: false,
      status: 403,
      payload: {
        ok: false,
        error: {
          code: "gateway_token_required",
          message: "Set MYCLAW_GATEWAY_TOKEN before enabling mutations on a non-loopback host.",
        },
      },
    };
  }
  if (!token || readRequestToken(request) === token) {
    return { ok: true };
  }
  return {
    ok: false,
    status: 401,
    payload: { ok: false, error: { code: "unauthorized", message: "Invalid gateway token." } },
  };
}

export function readRequestToken(request) {
  const authorization = request.headers.authorization || "";
  if (authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  return String(request.headers["x-myclaw-token"] || "");
}

export function isLoopbackHost(host) {
  return ["127.0.0.1", "localhost", "::1"].includes(String(host || "").toLowerCase());
}
