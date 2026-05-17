# 插件与 Skills

## 诊断

插件和 skills 都是扩展机制，但职责不同。插件给 MyClaw 增加 runtime capability；skills 给 agent 增加操作说明。MyClaw 初期必须把两者分开。

## 参考项目观察

Hermes：

- skills 是过程性记忆，适合沉淀工作流。
- plugin 可注册工具、hooks、CLI 命令。
- memory provider 和 context engine 是可插拔的，但属于后期能力。

OpenClaw：

- native plugin manifest 非常完整，可做配置验证和 capability ownership。
- plugin SDK 通过窄 subpath 暴露能力，避免大 barrel。
- plugin runtime 与 metadata snapshot 分离。
- bundled plugins 与外部插件兼容边界很清楚。

## 推荐设计

Phase 5 最小 plugin manifest：

```json
{
  "id": "github",
  "name": "GitHub",
  "version": "0.1.0",
  "tools": ["github.issue.list"],
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "token": { "type": "string" }
    }
  }
}
```

Runtime entry：

```ts
export function register(api: MyClawPluginApi) {
  api.registerTool(...);
}
```

最小 API：

```ts
type MyClawPluginApi = {
  registerTool(tool: ToolDescriptor): void;
  registerSkill?(skillRoot: string): void;
  logger: Logger;
};
```

## Skills 设计

Skill 是文件，不是 runtime code：

```text
skills/
  gh-pr-review/
    SKILL.md
```

加载顺序：

1. workspace skills。
2. user skills。
3. bundled skills。
4. plugin-provided skills。

Phase 3 只读 skills；Phase 6 再支持 skill create/update。

## Capability 边界

插件可以注册：

- tools。
- providers。
- skills。
- hooks。
- gateway routes。

但 MyClaw 初期只开放 tools + skills。providers 和 routes 后续再开放。

## 不建议第一阶段做

- 插件市场。
- 外部兼容承诺。
- 插件 lifecycle hook 大全。
- 插件覆盖 core tool。
- 插件直接改 prompt builder 内部。

## 关键风险

- 插件和 skill 混用，导致文本说明里偷偷改变 runtime 行为。
- 插件 loader 无 schema validation，坏插件让 gateway 起不来。
- 插件能覆盖 core tool，造成安全绕过。

## 验收标准

- plugin manifest 缺失或 schema 不合法时拒绝加载。
- plugin tool name 不能与 core tool 冲突。
- skill 只能影响 prompt，不直接执行代码。
- plugin enable/disable 后 visible tools 变化可由 `doctor` 或 `status` 显示。
