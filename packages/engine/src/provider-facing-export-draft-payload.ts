import type {
  ProviderFacingExportDraft,
  ProviderFacingExportDraftPayload,
  ReturnWorkspaceRecord
} from "@tax-engine/contracts";
import {
  type BuildProviderPayloadOptions,
  redactProviderPayload
} from "./provider-payload-redactor";

function buildExportDraft(workspace: ReturnWorkspaceRecord): ProviderFacingExportDraft {
  return {
    workspaceId: workspace.id,
    returnSummary: workspace.returnSummary,
    enginePreview: workspace.enginePreview,
    checklist: workspace.checklist,
    auditTrail: workspace.auditTrail
  };
}

export function buildProviderFacingExportDraftPayload(
  workspace: ReturnWorkspaceRecord,
  options: BuildProviderPayloadOptions = {}
): ProviderFacingExportDraftPayload {
  const { payload, redactions, replacementCount } = redactProviderPayload(
    buildExportDraft(workspace),
    options
  );

  return {
    exportDraft: payload,
    redactions,
    replacementCount
  };
}
