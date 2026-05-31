export function authorizeGatewayMutation(request, context, options = {}) {
  return authorizeGatewayScope(request, context, {
    allowLoopbackWithoutToken: true,
    code: "gateway_token_required",
    message: "Set MYCLAW_GATEWAY_TOKEN before enabling mutations on a non-loopback host.",
    scopes: options.scopes || ["mutation"],
  });
}

export function authorizeGatewayRead(request, context, options = {}) {
  return authorizeGatewayScope(request, context, {
    allowLoopbackWithoutToken: true,
    allowLoopbackWithConfiguredToken: true,
    code: "gateway_read_token_required",
    message: "Set a scoped gateway token before reading this endpoint on a non-loopback host.",
    scopes: options.scopes || ["read"],
  });
}

export function authorizeGatewayToken(request, context, options = {}) {
  return authorizeGatewayScope(request, context, {
    allowLoopbackWithoutToken: false,
    code: options.code || "gateway_token_required",
    message: options.message || "Set MYCLAW_GATEWAY_TOKEN before this mutation.",
    scopes: options.scopes || ["mutation"],
  });
}

function authorizeGatewayScope(request, context, options) {
  const token = String(context.token || "");
  const scopedTokens = normalizeScopedTokens(context.scopedTokens ?? process.env.MYCLAW_GATEWAY_SCOPED_TOKENS);
  const hasConfiguredToken = Boolean(token || scopedTokens.length);
  if (options.allowLoopbackWithoutToken && options.allowLoopbackWithConfiguredToken && isLoopbackHost(context.host)) {
    return { ok: true, auth: { kind: "loopback", scopes: [] } };
  }
  if (!hasConfiguredToken && options.allowLoopbackWithoutToken && isLoopbackHost(context.host)) {
    return { ok: true, auth: { kind: "loopback", scopes: [] } };
  }
  if (!hasConfiguredToken) {
    return {
      ok: false,
      status: 403,
      payload: {
        ok: false,
        error: {
          code: options.code,
          message: options.message,
        },
      },
    };
  }
  const requestToken = readRequestToken(request);
  if (token && requestToken === token) {
    return { ok: true, auth: { kind: "legacy-token", scopes: ["*"] } };
  }
  const credential = scopedTokens.find((item) => item.token && item.token === requestToken);
  if (credential) {
    if (hasAnyScope(credential.scopes, options.scopes)) {
      return { ok: true, auth: { kind: "scoped-token", scopes: credential.scopes } };
    }
    return {
      ok: false,
      status: 403,
      payload: { ok: false, error: { code: "insufficient_scope", message: "Gateway token scope is insufficient." } },
    };
  }
  return {
    ok: false,
    status: 401,
    payload: { ok: false, error: { code: "unauthorized", message: "Invalid gateway token." } },
  };
}

function normalizeScopedTokens(value) {
  if (!value) {
    return [];
  }
  const input = parseScopedTokens(value);
  return (Array.isArray(input) ? input : [])
    .map((item) => ({
      token: String(item.token || "").trim(),
      scopes: normalizeScopes(item.scopes),
    }))
    .filter((item) => item.token && item.scopes.length);
}

function parseScopedTokens(value) {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function normalizeScopes(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasAnyScope(actual = [], required = []) {
  return actual.includes("*") || required.some((scope) => actual.includes(scope));
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
