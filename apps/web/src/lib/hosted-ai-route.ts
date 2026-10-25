import { resolveDeploymentMode } from "./deployment-mode";
import { resolveHostedWorkspaceActor } from "./hosted-auth";
import { getHostedEntitlementByOwnerId } from "./hosted-billing-db";
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

export async function reserveHostedAiBudget(
  request: Request,
  _requestPayload: unknown,
  modelId: string | null,
  env: Record<string, string | undefined> = process.env,
): Promise<HostedAiBudgetGuardResult> {
  if (resolveDeploymentMode(env) !== "hosted") {
    return {
      response: null,
      reservation: null,
    };
  }

  const previewBypassActive = Boolean(env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID?.trim());
  const actor = await resolveHostedWorkspaceActor({
    env,
    requestHeaders: request.headers,
  });

  if (!actor) {
    return {
      response: buildAuthRequiredResponse(),
      reservation: null,
    };
  }

  if (previewBypassActive) {
    return {
      response: null,
      reservation: null,
    };
  }

  const { entitlement } = await getHostedEntitlementByOwnerId(env, actor.id);

  if (!entitlement.workspaceAccess) {
    return {
      response: buildPaidPlanRequiredResponse(),
      reservation: null,
    };
  }

  // A deterministic task has no provider spend. Preserve hosted access checks,
  // but do not reserve credits or apply the minimum retail AI charge.
  if (modelId === null) return { response: null, reservation: null };

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
