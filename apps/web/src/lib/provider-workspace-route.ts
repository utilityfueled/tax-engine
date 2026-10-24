import { NextResponse } from "next/server";
import { resolveHostedWorkspaceActor } from "./hosted-auth";
import { getHostedAiBudgetSnapshot, recordHostedAiUsage } from "./hosted-ai-usage-db";
import {
  resolveHostedAiBudgetCycleKey,
  resolveHostedAiHelperModelId,
  resolveHostedAiIncludedBudgetCents,
  estimateHostedAiReserveCostCents
} from "./hosted-ai-helper-billing";
import { getHostedEntitlementByOwnerId } from "./hosted-billing-db";
import {
  resolveBrowserWorkspaceDeploymentMode,
  shouldAllowLoopbackLocalAiAccess
} from "./hosted-runtime-safety";
import { containsUnsafeDirectIdentifier } from "./provider-request-privacy";
import {
  createProviderWorkspaceResponder,
  hasConfiguredWorkspaceHelpProvider
} from "./provider-workspace-responder";
import type { ProviderWorkspaceRequest } from "./provider-workspace-request";
import {
  checkRateLimitForEnvironment,
  rateLimitUnavailableResponse,
  createRateLimitStore,
  rateLimitTiers,
  registerStoreForCleanup,
  resolveClientIdentifier,
  type RateLimitStore
} from "./rate-limit";
import { safeParseJsonBody } from "./safe-body-parser";

function isProviderWorkspaceRequest(value: unknown): value is ProviderWorkspaceRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ProviderWorkspaceRequest>;

  return (candidate.task === "workspace-summary" || candidate.task === "workspace-help")
    && typeof candidate.requestId === "string"
    && typeof candidate.requestedAt === "string"
    && !!candidate.workspace
    && Array.isArray(candidate.unsupportedRoutes)
    && Array.isArray(candidate.redactions)
    && typeof candidate.replacementCount === "number"
    && (candidate.task !== "workspace-help" || typeof candidate.question === "string");
}

interface ProviderWorkspaceRouteDependencies {
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
  rateLimitStore?: RateLimitStore;
  resolveActor?: typeof resolveHostedWorkspaceActor;
  getEntitlementByOwnerId?: typeof getHostedEntitlementByOwnerId;
  getBudgetSnapshot?: typeof getHostedAiBudgetSnapshot;
  recordUsage?: typeof recordHostedAiUsage;
}

function buildPaidPlanRequiredResponse() {
  return NextResponse.json(
    {
      error: "AI helper access requires an active Starter or Plus plan.",
      code: "paid_plan_required",
      billingUrl: "/billing"
    },
    { status: 403 }
  );
}

function buildAiBudgetExceededResponse(snapshot: Awaited<ReturnType<typeof getHostedAiBudgetSnapshot>>) {
  return NextResponse.json(
    {
      error: "Your included AI helper budget is exhausted. Buy an extra AI credit pack in Billing to continue.",
      code: "ai_budget_exhausted",
      billingUrl: "/billing",
      budget: snapshot
    },
    { status: 402 }
  );
}

function buildAiProviderUnavailableResponse() {
  return NextResponse.json(
    {
      error: "The AI helper is not configured right now. Please email support@vivalatax.com before enabling hosted access.",
      code: "ai_provider_unavailable"
    },
    { status: 503 }
  );
}

function buildAuthRequiredResponse() {
  return NextResponse.json(
    {
      error: "Sign in and choose a paid plan to use the AI assistant.",
      code: "auth_required",
      signInUrl: "/account?mode=sign-in",
      billingUrl: "/billing"
    },
    { status: 401 }
  );
}

export function createProviderWorkspaceRouteHandlers(
  dependencies: ProviderWorkspaceRouteDependencies = {}
) {
  const respond = createProviderWorkspaceResponder(dependencies);
  const store = dependencies.rateLimitStore ?? createRateLimitStore();

  if (!dependencies.rateLimitStore) {
    registerStoreForCleanup(store, rateLimitTiers.provider.windowMs);
  }

  return {
    async POST(request: Request) {
      const env = dependencies.env ?? process.env;
      const browserWorkspaceMode = resolveBrowserWorkspaceDeploymentMode(env);
      const previewBypassActive = Boolean(env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID?.trim());
      let actor: Awaited<ReturnType<typeof resolveHostedWorkspaceActor>> | null = null;
      let usageBudgetSnapshot: Awaited<ReturnType<typeof getHostedAiBudgetSnapshot>> | null = null;
      let usageCycleKey = "self-host";

      const clientId = resolveClientIdentifier(request.headers);
      const rateCheck = await checkRateLimitForEnvironment(
        store,
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

      const parsed = await safeParseJsonBody(request);

      if (!parsed.ok) {
        return NextResponse.json(
          { error: parsed.error },
          { status: parsed.status }
        );
      }

      if (!isProviderWorkspaceRequest(parsed.data)) {
        return NextResponse.json(
          { error: "Invalid provider workspace request." },
          { status: 400 }
        );
      }

      if (containsUnsafeDirectIdentifier(parsed.data)) {
        return NextResponse.json(
          { error: "Provider workspace request contains unredacted direct identifiers." },
          { status: 400 }
        );
      }

      const requestHostname = (() => {
        try {
          return new URL(request.url).hostname;
        } catch {
          return null;
        }
      })();
      const effectiveWorkspaceMode = shouldAllowLoopbackLocalAiAccess(
        env,
        requestHostname,
        parsed.data.workspace.storageMode
      )
        ? "self-host"
        : browserWorkspaceMode;

      if (effectiveWorkspaceMode === "hosted") {
        actor = dependencies.resolveActor
          ? await dependencies.resolveActor({
              env,
              requestHeaders: request.headers
            })
          : await resolveHostedWorkspaceActor({
              env,
              requestHeaders: request.headers
            });

        if (!actor) {
          return buildAuthRequiredResponse();
        }
      }

      try {
        if (effectiveWorkspaceMode === "hosted" && actor && !previewBypassActive) {
          const { subscription, entitlement } = await (dependencies.getEntitlementByOwnerId
            ? dependencies.getEntitlementByOwnerId(env, actor.id)
            : getHostedEntitlementByOwnerId(env, actor.id));

          if (!entitlement.workspaceAccess) {
            return buildPaidPlanRequiredResponse();
          }

          usageCycleKey = resolveHostedAiBudgetCycleKey({
            planId: subscription?.planId ?? null,
            status: subscription?.status ?? undefined,
            currentPeriodEnd: subscription?.currentPeriodEnd ?? null
          });
          usageBudgetSnapshot = await (dependencies.getBudgetSnapshot
            ? dependencies.getBudgetSnapshot(env, {
                ownerId: actor.id,
                cycleKey: usageCycleKey,
                includedBudgetCents: resolveHostedAiIncludedBudgetCents(subscription?.planId, env)
              })
            : getHostedAiBudgetSnapshot(env, {
                ownerId: actor.id,
                cycleKey: usageCycleKey,
                includedBudgetCents: resolveHostedAiIncludedBudgetCents(subscription?.planId, env)
              }));
          const reserveCostCents = estimateHostedAiReserveCostCents({
            requestPayload: parsed.data,
            modelId: resolveHostedAiHelperModelId(env)
          }, env);

          if (usageBudgetSnapshot.totalRemainingCents < reserveCostCents) {
            return buildAiBudgetExceededResponse(usageBudgetSnapshot);
          }
        }

        if (
          parsed.data.task === "workspace-help"
          && !hasConfiguredWorkspaceHelpProvider(env)
        ) {
          return buildAiProviderUnavailableResponse();
        }

        const response = await respond(parsed.data);

        if (effectiveWorkspaceMode === "hosted" && actor && !previewBypassActive && usageBudgetSnapshot && response.usage) {
          const includedChargeCents = Math.min(
            usageBudgetSnapshot.includedRemainingCents,
            response.usage.estimatedCostCents
          );
          const purchasedChargeCents = Math.max(
            0,
            response.usage.estimatedCostCents - includedChargeCents
          );

          if (includedChargeCents + purchasedChargeCents > usageBudgetSnapshot.totalRemainingCents) {
            return buildAiBudgetExceededResponse(usageBudgetSnapshot);
          }

          await (dependencies.recordUsage
            ? dependencies.recordUsage(env, {
                requestId: response.requestId,
                ownerId: actor.id,
                cycleKey: usageCycleKey,
                task: response.task ?? parsed.data.task,
                provider: response.provider,
                modelId: response.modelId ?? null,
                inputTokens: response.usage.inputTokens,
                outputTokens: response.usage.outputTokens,
                estimatedCostCents: response.usage.estimatedCostCents,
                includedChargeCents,
                purchasedChargeCents,
                createdAt: new Date().toISOString()
              })
            : recordHostedAiUsage(env, {
            requestId: response.requestId,
            ownerId: actor.id,
            cycleKey: usageCycleKey,
            task: response.task ?? parsed.data.task,
            provider: response.provider,
            modelId: response.modelId ?? null,
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
            estimatedCostCents: response.usage.estimatedCostCents,
            includedChargeCents,
            purchasedChargeCents,
            createdAt: new Date().toISOString()
          }));

          const updatedBudget = await getHostedAiBudgetSnapshot(env, {
            ownerId: actor.id,
            cycleKey: usageCycleKey,
            includedBudgetCents: usageBudgetSnapshot.includedBudgetCents
          });

          return NextResponse.json({
            ...response,
            budget: updatedBudget
          });
        }

        return NextResponse.json(response);
      } catch {
        return NextResponse.json(
          { error: "Configured provider workspace request failed." },
          { status: 502 }
        );
      }
    }
  };
}
