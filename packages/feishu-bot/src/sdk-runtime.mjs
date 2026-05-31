export async function loadFeishuSdkRuntime() {
  return createFeishuSdkRuntime(await import("@larksuiteoapi/node-sdk"));
}

export function createFeishuSdkRuntime(sdk) {
  return {
    createClient(config) {
      assertCredentials(config);
      return new sdk.Client({
        appId: config.appId,
        appSecret: config.appSecret,
        appType: sdk.AppType.SelfBuild,
        domain: resolveDomain(sdk, config.domain),
      });
    },

    createEventDispatcher(config) {
      return new sdk.EventDispatcher({
        encryptKey: config.encryptKey || undefined,
        verificationToken: config.verificationToken || undefined,
      });
    },

    createWsClient(config, callbacks = {}) {
      assertCredentials(config);
      return new sdk.WSClient({
        appId: config.appId,
        appSecret: config.appSecret,
        domain: resolveDomain(sdk, config.domain),
        loggerLevel: sdk.LoggerLevel?.info,
        ...callbacks,
      });
    },
  };
}

function assertCredentials(config = {}) {
  if (!config.appId || !config.appSecret) {
    throw new Error("Feishu app credentials are required.");
  }
}

function resolveDomain(sdk, value) {
  if (value === "lark") {
    return sdk.Domain.Lark;
  }
  return sdk.Domain.Feishu;
}
