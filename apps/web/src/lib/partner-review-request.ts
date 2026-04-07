import type {
  PartnerReviewConsentRecord,
  ProviderDirectIdentifier,
  ProviderFacingPartnerReviewRequest,
  ProviderFacingPayloadRedaction,
  ReturnWorkspaceRecord
} from "@tax-engine/contracts";
import { buildProviderFacingPartnerReviewPayload } from "@tax-engine/engine/src/provider-facing-partner-review-payload";
import { collectProviderDirectIdentifiersFromWorkspace } from "@tax-engine/engine/src/provider-direct-identifiers";

export interface ProviderPartnerReviewRequestBundle {
  task: "partner-review";
  requestId: string;
  requestedAt: string;
  reviewRequest: ProviderFacingPartnerReviewRequest;
  redactions: ProviderFacingPayloadRedaction[];
  replacementCount: number;
}

export interface ProviderPartnerReviewRequestDownload {
  bundle: ProviderPartnerReviewRequestBundle;
  fileName: string;
  contents: string;
}

export interface BuildProviderPartnerReviewRequestBundleOptions {
  consent: PartnerReviewConsentRecord;
  directIdentifiers?: ProviderDirectIdentifier[];
  now?: string;
}

function sanitizeFileToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "workspace";
}

export function buildProviderPartnerReviewRequestBundle(
  workspace: ReturnWorkspaceRecord,
  options: BuildProviderPartnerReviewRequestBundleOptions
): ProviderPartnerReviewRequestBundle {
  const requestedAt = options.now ?? new Date().toISOString();
  const directIdentifiers = [
    ...collectProviderDirectIdentifiersFromWorkspace(workspace),
    ...(options.directIdentifiers ?? [])
  ];
  const payload = buildProviderFacingPartnerReviewPayload(workspace, {
    consent: options.consent,
    directIdentifiers,
    requestedAt
  });

  return {
    task: "partner-review",
    requestId: `partner-review:${payload.reviewRequest.workspaceId}:${requestedAt}`,
    requestedAt,
    reviewRequest: payload.reviewRequest,
    redactions: payload.redactions,
    replacementCount: payload.replacementCount
  };
}

export function buildProviderPartnerReviewRequestDownload(
  workspace: ReturnWorkspaceRecord,
  options: BuildProviderPartnerReviewRequestBundleOptions
): ProviderPartnerReviewRequestDownload {
  const bundle = buildProviderPartnerReviewRequestBundle(workspace, options);
  const workspaceToken = sanitizeFileToken(bundle.reviewRequest.workspaceId);
  const dateToken = sanitizeFileToken(bundle.requestedAt.slice(0, 10));

  return {
    bundle,
    fileName: `${workspaceToken}-${dateToken}-partner-review-request.json`,
    contents: `${JSON.stringify(bundle, null, 2)}\n`
  };
}
