import type {
  PartnerReviewConsentRecord,
  ProviderFacingPartnerReviewDocument,
  ProviderFacingPartnerReviewPayload,
  ProviderFacingPartnerReviewRequest,
  ReturnWorkspaceRecord
} from "@tax-engine/contracts";
import type { BuildProviderPayloadOptions } from "./provider-payload-redactor";
import { buildProviderFacingWorkspacePayload } from "./provider-facing-workspace-payload";

export interface BuildProviderFacingPartnerReviewPayloadOptions
  extends BuildProviderPayloadOptions {
  consent: PartnerReviewConsentRecord;
  requestedAt?: string;
}

function assertPartnerReviewConsent(consent: PartnerReviewConsentRecord) {
  if (!consent.shareRedactedDataWithPartner) {
    throw new Error("Partner review request requires consent to share redacted return data.");
  }

  if (!consent.acknowledgeSoftwareOnlyService) {
    throw new Error("Partner review request requires acknowledging the software-only service boundary.");
  }

  if (!consent.acknowledgeSeparateProfessionalEngagement) {
    throw new Error("Partner review request requires acknowledging the separate professional engagement boundary.");
  }

  if (!consent.capturedAt || consent.capturedAt.trim().length === 0) {
    throw new Error("Partner review request requires a consent timestamp.");
  }

  return {
    ...consent,
    capturedAt: consent.capturedAt.trim()
  };
}

function buildReviewDocuments(
  workspace: ReturnWorkspaceRecord
): ProviderFacingPartnerReviewDocument[] {
  return workspace.documents.map((document) => ({
    id: document.id,
    kind: document.kind,
    coverage: document.coverage,
    label: document.label,
    matchedFixtureId: document.matchedFixtureId,
    seededFactIds: document.seededFactIds
  }));
}

function buildPartnerReviewRequest(
  workspace: ReturnWorkspaceRecord,
  consent: PartnerReviewConsentRecord,
  requestedAt: string,
  unsupportedRoutes: ProviderFacingPartnerReviewRequest["unsupportedRoutes"]
): ProviderFacingPartnerReviewRequest {
  return {
    schemaVersion: 1,
    requestKind: "partner-review",
    workspaceId: workspace.id,
    workspaceUpdatedAt: workspace.updatedAt,
    requestedAt,
    consent,
    workspaceSummary: workspace.summary,
    documents: buildReviewDocuments(workspace),
    returnSummary: workspace.returnSummary,
    enginePreview: workspace.enginePreview,
    reviewNotes: workspace.seededReturn.reviewNotes,
    structuredFacts: workspace.structuredFacts,
    checklist: workspace.checklist,
    auditTrail: workspace.auditTrail,
    unsupportedRoutes
  };
}

export function buildProviderFacingPartnerReviewPayload(
  workspace: ReturnWorkspaceRecord,
  options: BuildProviderFacingPartnerReviewPayloadOptions
): ProviderFacingPartnerReviewPayload {
  const consent = assertPartnerReviewConsent(options.consent);
  const requestedAt = options.requestedAt ?? consent.capturedAt;
  const payload = buildProviderFacingWorkspacePayload(workspace, options);

  return {
    reviewRequest: buildPartnerReviewRequest(
      payload.workspace,
      consent,
      requestedAt,
      payload.unsupportedRoutes
    ),
    redactions: payload.redactions,
    replacementCount: payload.replacementCount
  };
}
