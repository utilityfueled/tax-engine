import { NextResponse } from "next/server";
import { resolveDeploymentMode } from "../../../../lib/deployment-mode";
import { resolveHostedWorkspaceActor } from "../../../../lib/hosted-auth";
import { containsUnsafeDirectIdentifier } from "../../../../lib/provider-request-privacy";
import {
  checkRateLimitForEnvironment,
  rateLimitUnavailableResponse,
  rateLimitTiers,
  resolveClientIdentifier
} from "../../../../lib/rate-limit";
import { safeParseJsonBody } from "../../../../lib/safe-body-parser";
import type {
  ProviderExportDraftRequest,
  ProviderExportDraftResponse
} from "../../../../lib/provider-export-draft-request";
import { providerRateLimitStore } from "../shared-rate-limit";

function isProviderExportDraftRequest(value: unknown): value is ProviderExportDraftRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ProviderExportDraftRequest>;

  return candidate.task === "export-draft"
    && typeof candidate.requestId === "string"
    && typeof candidate.requestedAt === "string"
    && !!candidate.exportDraft
    && Array.isArray(candidate.redactions)
    && typeof candidate.replacementCount === "number";
}

function buildSummary(request: ProviderExportDraftRequest): ProviderExportDraftResponse {
  const remainingChecklistCount = request.exportDraft.checklist.filter((item) => item.status !== "ready").length;
  const previewIncluded = request.exportDraft.enginePreview !== null;

  return {
    requestId: request.requestId,
    provider: "mock-local",
    summary: previewIncluded
      ? `Export draft includes a deterministic preview and ${remainingChecklistCount} checklist item(s) still need attention.`
      : `Export draft is missing a deterministic preview and ${remainingChecklistCount} checklist item(s) still need attention.`,
    previewIncluded,
    remainingChecklistCount,
    redactionCount: request.redactions.length
  };
}

export async function POST(request: Request) {
  const env = process.env;
  const clientId = resolveClientIdentifier(request.headers);
  const rateCheck = await checkRateLimitForEnvironment(
    providerRateLimitStore,
    `provider:${clientId}`,
    rateLimitTiers.provider,
    env
  );

  if (rateCheck.unavailable) return rateLimitUnavailableResponse();

  if (!rateCheck.allowed) {
    const retryAfterSeconds = Math.ceil(
      (rateCheck.retryAfterMs ?? rateLimitTiers.provider.windowMs) / 1000
    );

    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) }
      }
    );
  }

  if (resolveDeploymentMode(env) === "hosted") {
    const actor = await resolveHostedWorkspaceActor({
      env,
      requestHeaders: request.headers
    });

    if (!actor) {
      return NextResponse.json(
        { error: "Authentication required for provider requests in hosted mode." },
        { status: 401 }
      );
    }
  }

  const parsed = await safeParseJsonBody(request);

  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }

  if (!isProviderExportDraftRequest(parsed.data)) {
    return NextResponse.json(
      { error: "Invalid provider export draft request." },
      { status: 400 }
    );
  }

  if (containsUnsafeDirectIdentifier(parsed.data)) {
    return NextResponse.json(
      { error: "Provider export draft request contains unredacted direct identifiers." },
      { status: 400 }
    );
  }

  return NextResponse.json(buildSummary(parsed.data));
}
