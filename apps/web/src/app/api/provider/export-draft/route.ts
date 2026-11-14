import { isSupportedEngineTaxYear } from "@tax-engine/contracts";
import { z } from "zod";
import { resolveDeploymentMode } from "../../../../lib/deployment-mode";
import { resolveHostedWorkspaceActor } from "../../../../lib/hosted-auth";
import { containsUnsafeDirectIdentifier } from "../../../../lib/provider-request-privacy";
import { privateJson, privateResponse } from "../../../../lib/protected-document-request";
import {
  checkRateLimitForEnvironment,
  rateLimitUnavailableResponse,
  rateLimitTiers,
  resolveClientIdentifier
} from "../../../../lib/rate-limit";
import { safeParseJsonBody } from "../../../../lib/safe-body-parser";
import type { ProviderExportDraftResponse } from "../../../../lib/provider-export-draft-request";
import { providerRateLimitStore } from "../shared-rate-limit";

const stringList = z.array(z.string());
const enginePreview = z.object({
  mode: z.enum(["seeded-fixture", "engine-recompute"]),
  title: z.string(),
  taxYear: z.number().refine(isSupportedEngineTaxYear),
  filingStatus: z.string(),
  filingState: z.string().optional(),
  sourceDocumentIds: stringList,
  sourceFixtureIds: stringList,
  assumptions: stringList,
  metrics: z.object({
    totalIncome: z.string(),
    agi: z.string(),
    taxableIncome: z.string(),
    totalTax: z.string(),
    totalPayments: z.string(),
    refund: z.string(),
    amountOwed: z.string()
  }),
  stateMetrics: z.object({
    stateCode: z.string(),
    stateTax: z.string(),
    totalPayments: z.string(),
    refund: z.string(),
    amountOwed: z.string()
  }).optional(),
  highlightedLines: z.array(z.object({
    id: z.string(),
    form: z.string(),
    line: z.string(),
    label: z.string(),
    value: z.string(),
    formula: z.string(),
    sourceFactIds: stringList
  }))
});
const requestShape = z.object({
  task: z.literal("export-draft"),
  requestId: z.string().min(1),
  requestedAt: z.string(),
  exportDraft: z.object({
    checklist: z.array(z.object({
      id: z.string(),
      label: z.string(),
      status: z.enum(["ready", "needs-input", "blocked"])
    })),
    enginePreview: enginePreview.nullable()
  }),
  redactions: z.array(z.object({
    token: z.string(),
    kind: z.enum(["person-name", "ssn", "date-of-birth", "email", "phone", "street-address", "postal-code", "other"])
  })),
  replacementCount: z.number().int().nonnegative()
});

function buildSummary(request: z.infer<typeof requestShape>): ProviderExportDraftResponse {
  const remainingChecklistCount = request.exportDraft.checklist.filter((item) => item.status !== "ready").length;
  const previewIncluded = request.exportDraft.enginePreview !== null;

  return {
    requestId: request.requestId,
    provider: "mock-local",
    summary: previewIncluded
      ? `The supplied draft includes a preview and ${remainingChecklistCount} checklist item(s) still need attention.`
      : `The supplied draft has no preview and ${remainingChecklistCount} checklist item(s) still need attention.`,
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

  if (rateCheck.unavailable) return privateResponse(rateLimitUnavailableResponse());

  if (!rateCheck.allowed) {
    const retryAfterSeconds = Math.ceil(
      (rateCheck.retryAfterMs ?? rateLimitTiers.provider.windowMs) / 1000
    );

    return privateResponse(Response.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) }
      }
    ));
  }

  if (resolveDeploymentMode(env) === "hosted") {
    try {
      const actor = await resolveHostedWorkspaceActor({ env, requestHeaders: request.headers });
      if (!actor) return privateJson({ error: "Authentication required for provider requests in hosted mode." }, 401);
    } catch {
      return privateJson({ error: "Authentication is temporarily unavailable. Please try again later." }, 503);
    }
  }

  const parsed = await safeParseJsonBody(request);

  if (!parsed.ok) {
    return privateJson({ error: parsed.error }, parsed.status);
  }

  try {
    if (containsUnsafeDirectIdentifier(parsed.data)) {
      return privateJson({ error: "Provider export draft request contains unredacted direct identifiers." }, 400);
    }
  } catch {
    return privateJson({ error: "Invalid provider export draft request." }, 400);
  }

  const verified = requestShape.safeParse(parsed.data);
  if (!verified.success) {
    return privateJson({ error: "Invalid provider export draft request." }, 400);
  }

  return privateJson(buildSummary(verified.data));
}
