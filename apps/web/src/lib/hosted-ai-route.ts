import { resolveDeploymentMode } from "./deployment-mode";
import { resolveHostedWorkspaceActor } from "./hosted-auth";
import { getHostedEntitlementByOwnerId } from "./hosted-billing-db";
import {
  estimateHostedAiReserveCostCents,
  estimateHostedAiUsageCost,
  resolveHostedAiBudgetCycleKey,
  resolveHostedAiIncludedBudgetCents,
} from "./hosted-ai-helper-billing";
import { getHostedAiBudgetSnapshot, recordHostedAiUsage, type HostedAiBudgetSnapshot } from "./hosted-ai-usage-db";

interface HostedAiRouteReservation {
  ownerId: string;
  usageCycleKey: string;
  budgetSnapshot: HostedAiBudgetSnapshot;
}

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

function buildAiBudgetExceededResponse(snapshot: HostedAiBudgetSnapshot) {
  return Response.json(
    {
      error: "Your included AI helper budget is exhausted. Buy an extra AI credit pack in Billing to continue.",
      code: "ai_budget_exhausted",
      billingUrl: "/billing",
      budget: snapshot,
    },
    { status: 402 },
  );
}

export async function reserveHostedAiBudget(
  request: Request,
  requestPayload: unknown,
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

  const { subscription, entitlement } = await getHostedEntitlementByOwnerId(env, actor.id);

  if (!entitlement.workspaceAccess) {
    return {
      response: buildPaidPlanRequiredResponse(),
      reservation: null,
    };
  }

  // A deterministic task has no provider spend. Preserve hosted access checks,
  // but do not reserve credits or apply the minimum retail AI charge.
  if (modelId === null) return { response: null, reservation: null };

  const usageCycleKey = resolveHostedAiBudgetCycleKey({
    planId: subscription?.planId ?? null,
    status: subscription?.status ?? undefined,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
  });
  const budgetSnapshot = await getHostedAiBudgetSnapshot(env, {
    ownerId: actor.id,
    cycleKey: usageCycleKey,
    includedBudgetCents: resolveHostedAiIncludedBudgetCents(subscription?.planId, env),
  });
  const reserveCostCents = estimateHostedAiReserveCostCents({
    requestPayload,
    modelId,
  }, env);

  if (budgetSnapshot.totalRemainingCents < reserveCostCents) {
    return {
      response: buildAiBudgetExceededResponse(budgetSnapshot),
      reservation: null,
    };
  }

  return {
    response: null,
    reservation: {
      ownerId: actor.id,
      usageCycleKey,
      budgetSnapshot,
    },
  };
}

export async function recordHostedAiRouteUsage(
  reservation: HostedAiRouteReservation | null,
  {
    requestId,
    task,
    provider,
    modelId,
    requestPayload,
    responsePayload,
  }: {
    requestId: string;
    task: string;
    provider: string;
    modelId: string;
    requestPayload: unknown;
    responsePayload: unknown;
  },
  env: Record<string, string | undefined> = process.env,
) {
  if (!reservation) {
    return null;
  }

  const usage = estimateHostedAiUsageCost({
    requestPayload,
    responseText: JSON.stringify(responsePayload),
    modelId,
  }, env);
  const includedChargeCents = Math.min(
    reservation.budgetSnapshot.includedRemainingCents,
    usage.estimatedCostCents,
  );
  const purchasedChargeCents = Math.max(0, usage.estimatedCostCents - includedChargeCents);

  if (includedChargeCents + purchasedChargeCents > reservation.budgetSnapshot.totalRemainingCents) {
    return buildAiBudgetExceededResponse(reservation.budgetSnapshot);
  }

  await recordHostedAiUsage(env, {
    requestId,
    ownerId: reservation.ownerId,
    cycleKey: reservation.usageCycleKey,
    task,
    provider,
    modelId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCostCents: usage.estimatedCostCents,
    includedChargeCents,
    purchasedChargeCents,
    createdAt: new Date().toISOString(),
  });

  const budget = await getHostedAiBudgetSnapshot(env, {
    ownerId: reservation.ownerId,
    cycleKey: reservation.usageCycleKey,
    includedBudgetCents: reservation.budgetSnapshot.includedBudgetCents,
  });

  return budget;
}
