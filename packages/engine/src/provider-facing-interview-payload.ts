import type {
  ProviderFacingInterviewPayload,
  ProviderFacingInterviewRequest,
  ReturnWorkspaceRecord
} from "@tax-engine/contracts";
import {
  type BuildProviderPayloadOptions,
  redactProviderPayload
} from "./provider-payload-redactor";

function buildInterviewRequest(workspace: ReturnWorkspaceRecord): ProviderFacingInterviewRequest {
  return {
    workspaceId: workspace.id,
    returnSummary: workspace.returnSummary,
    questions: workspace.seededReturn.interviewQuestions,
    structuredFacts: workspace.structuredFacts,
    auditTrail: workspace.auditTrail
  };
}

export function buildProviderFacingInterviewPayload(
  workspace: ReturnWorkspaceRecord,
  options: BuildProviderPayloadOptions = {}
): ProviderFacingInterviewPayload {
  const { payload, redactions, replacementCount } = redactProviderPayload(
    buildInterviewRequest(workspace),
    options
  );

  return {
    interview: payload,
    redactions,
    replacementCount
  };
}
