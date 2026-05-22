export function buildOpenClawStageReview(plan, stage) {
  if (!stage) {
    return {
      kind: "openclaw-stage-review",
      schemaVersion: 1,
      forReviewOnly: true,
      status: "not-staged",
      stageId: null,
      approval: null,
      items: [],
      counts: { items: 0, blocked: plan.unsupported.length },
    };
  }
  const items = (stage.modules || []).flatMap((module) => diffItemsForModule(plan, stage, module));
  return {
    kind: "openclaw-stage-review",
    schemaVersion: 1,
    forReviewOnly: true,
    status: stage.status || "staged",
    stageId: stage.stageId,
    approval: stage.approval || null,
    items,
    counts: {
      items: items.length,
      blocked: stage.blocked?.length || 0,
    },
  };
}

export const buildOpenClawStageDiff = buildOpenClawStageReview;

function diffItemsForModule(plan, stage, module) {
  if (module.id === "feishu") {
    return [
      item(stage, module, {
        field: "channels",
        action: "map",
        source: (module.sourceChannels || []).join(", ") || "none",
        target: (module.myclawTargets || []).join(", ") || "none",
        impact: "Enable review path for Feishu/Lark channel configuration without applying secrets.",
      }),
    ];
  }
  if (module.id === "plugins") {
    return [
      item(stage, module, {
        field: "pluginEntries",
        action: "preserve",
        source: String(plan.inventory.pluginEntries.length),
        target: "draft records only",
        impact: "Plugin manifests are inventoried but not executed.",
      }),
    ];
  }
  if (module.id === "config") {
    return [
      item(stage, module, {
        field: "config.sections",
        action: "preserve",
        source: (plan.config.sections || []).join(", ") || "none",
        target: "raw config review",
        impact: "Supported sections must be mapped one by one before apply.",
      }),
    ];
  }
  if (module.id === "unsupported") {
    return [
      item(stage, module, {
        field: "unsupported",
        action: "block",
        source: String(plan.unsupported.length),
        target: "manual design work",
        impact: "Apply is blocked until MyClaw owns the missing schema/runtime surface.",
      }),
    ];
  }
  return [
    item(stage, module, {
      field: module.id,
      action: "review",
      source: module.status,
      target: "manual review",
      impact: module.nextAction || "Review required.",
    }),
  ];
}

function item(stage, module, input) {
  return {
    id: `${module.id}.${input.field}`,
    moduleId: module.id,
    stageId: stage.stageId,
    approvalId: stage.approval?.approvalId || null,
    status: module.status,
    field: input.field,
    action: input.action,
    source: input.source,
    target: input.target,
    impact: input.impact,
  };
}
