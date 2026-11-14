import { resolveDeploymentMode } from "./deployment-mode";
import { resolveHostedWorkspaceActor } from "./hosted-auth";
import { getHostedEntitlementByOwnerId } from "./hosted-billing-db";
import {
  hostedDocumentAnalysisOwnerHeader, hostedDocumentAnalysisOwnerRequired, hostedWorkspaceOwnerScopeKey,
} from "./hosted-document-analysis-owner";
// Provider work must use hostedAiTaskAccounting, which reserves atomically before dispatch.
interface HostedAiRouteReservation { readonly legacy: never }

export interface HostedAiBudgetGuardResult {
  response: Response | null;
  reservation: HostedAiRouteReservation | null;
}

function buildAuthRequiredResponse() {
  return Response.json(
    {
      error: "Sign in and choose a paid plan to use AI document analysis.",
      code: "auth_required",
      signInUrl: "/account?mode=sign-in",
      billingUrl: "/billing",
    },
    { status: 401 },
  );
}

function buildPaidPlanRequiredResponse() {
  return Response.json(
    {
      error: "AI document analysis requires an active Starter or Plus plan.",
      code: "paid_plan_required",
      billingUrl: "/billing",
    },
    { status: 403 },
  );
}

async function authorizeHostedAiRoute(
  request: Request, env: Record<string, string | undefined>, requireExpectedOwner: boolean,
): Promise<Response | null> {
  const previewBypassActive = Boolean(env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID?.trim());
  const actor = await resolveHostedWorkspaceActor({
    env,
    requestHeaders: request.headers,
  });

  if (!actor) return buildAuthRequiredResponse();

  if (requireExpectedOwner && request.headers.get(hostedDocumentAnalysisOwnerHeader) !== hostedWorkspaceOwnerScopeKey(actor.id)) {
    return Response.json({ error: hostedDocumentAnalysisOwnerRequired, code: "workspace_owner_changed" }, { status: 409 });
  }

  if (previewBypassActive) return null;
  const { entitlement } = await getHostedEntitlementByOwnerId(env, actor.id);
  return entitlement.workspaceAccess ? null : buildPaidPlanRequiredResponse();
}

export function authorizeHostedDocumentAnalysis(request: Request): Promise<Response | null> {
  return authorizeHostedAiRoute(request, process.env, true);
}

export async function reserveHostedAiBudget(
  request: Request,
  _requestPayload: unknown,
  modelId: string | null,
  env: Record<string, string | undefined> = process.env,
): Promise<HostedAiBudgetGuardResult> {
  if (resolveDeploymentMode(env) !== "hosted") return { response: null, reservation: null };
  const response = await authorizeHostedAiRoute(request, env, false);

  // A deterministic task has no provider spend. Preserve hosted access checks,
  // but do not reserve credits or apply the minimum retail AI charge.
  if (response || modelId === null || env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID?.trim()) {
    return { response, reservation: null };
  }

  throw new Error("Provider calls require atomic task accounting; legacy estimated reservation is disabled.");
}

export async function recordHostedAiRouteUsage(
  reservation: HostedAiRouteReservation | null,
  _usage: {
    requestId: string;
    task: string;
    provider: string;
    modelId: string;
    requestPayload: unknown;
    responsePayload: unknown;
  },
  _env: Record<string, string | undefined> = process.env,
) {
  if (!reservation) {
    return null;
  }

  throw new Error("Estimated usage cannot settle AI credits. Provider-reported usage or authoritative reconciliation is required.");
}
