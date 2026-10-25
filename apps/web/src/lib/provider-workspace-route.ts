import { NextResponse } from "next/server";
import { z } from "zod";
import { hostedAiTaskAccounting } from "./hosted-ai-task-accounting";
import type { AiTaskExecution } from "./ai-task-adapter";
import { resolveHostedWorkspaceActor } from "./hosted-auth";
import { getHostedAiBudgetSnapshot } from "./hosted-ai-usage-db";
import {
  resolveHostedAiBudgetCycleKey,
  resolveHostedAiIncludedBudgetCents
} from "./hosted-ai-helper-billing";
import { getHostedEntitlementByOwnerId } from "./hosted-billing-db";
import {
  resolveBrowserWorkspaceDeploymentMode,
  shouldAllowLoopbackLocalAiAccess
} from "./hosted-runtime-safety";
import { containsUnsafeDirectIdentifier } from "./provider-request-privacy";
import {
  createProviderWorkspaceResponder,
  type ProviderWorkspaceResponderDependencies
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
import { PRODUCTION_WORKSPACE_AI_EXECUTION } from "./production-ai-config";
import { cancelledDocumentRequest, privateJson, privateResponse } from "./protected-document-request";

const requestShape = z.object({
  task: z.enum(["workspace-summary", "workspace-help"]), requestId: z.string().trim().min(1).max(256),
  requestedAt: z.string(), replacementCount: z.number().int().nonnegative(), optedOut: z.boolean().optional(),
  question: z.string().max(8000).optional(), redactions: z.array(z.object({ token: z.string(), kind: z.string() })),
  unsupportedRoutes: z.array(z.object({ id: z.string(), title: z.string(), description: z.string(), reasons: z.array(z.string()) })),
  workspace: z.object({ storageMode: z.enum(["local-browser", "hosted-postgres"]),
    summary: z.object({ totalDocuments: z.number().int().nonnegative() }),
    seededReturn: z.object({ interviewQuestions: z.array(z.object({ status: z.string(), prompt: z.string() })) }),
    returnSummary: z.object({ status: z.string(), targetTaxYear: z.number().int().nullable() }),
  }),
});
function isProviderWorkspaceRequest(value: unknown): value is ProviderWorkspaceRequest {
  const parsed = requestShape.safeParse(value);
  return parsed.success && (parsed.data.task !== "workspace-help" || typeof parsed.data.question === "string");
}

interface ProviderWorkspaceRouteDependencies extends ProviderWorkspaceResponderDependencies {
  rateLimitStore?: RateLimitStore;
  resolveActor?: typeof resolveHostedWorkspaceActor;
  getEntitlementByOwnerId?: typeof getHostedEntitlementByOwnerId;
  getBudgetSnapshot?: typeof getHostedAiBudgetSnapshot;
  accounting?: typeof hostedAiTaskAccounting;
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
  const execution = dependencies.execution ?? PRODUCTION_WORKSPACE_AI_EXECUTION;
  const respond = createProviderWorkspaceResponder({ ...dependencies, execution });
  const store = dependencies.rateLimitStore ?? createRateLimitStore();

  if (!dependencies.rateLimitStore) {
    registerStoreForCleanup(store, rateLimitTiers.provider.windowMs);
  }

  const handlers = {
    async POST(request: Request) {
      const env = dependencies.env ?? process.env;
      const browserWorkspaceMode = resolveBrowserWorkspaceDeploymentMode(env);
      const previewBypassActive = Boolean(env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID?.trim());
      let actor: Awaited<ReturnType<typeof resolveHostedWorkspaceActor>> | null = null;
      let accounting: Partial<AiTaskExecution> = {};
      let budgetInput: { ownerId: string; cycleKey: string; includedBudgetCents: number } | null = null;

      const clientId = resolveClientIdentifier(request.headers);
      const rateCheck = await checkRateLimitForEnvironment(
        store,
        `provider:${clientId}`,
        rateLimitTiers.provider,
        env
      );
      request.signal.throwIfAborted();

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
      request.signal.throwIfAborted();

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
        request.signal.throwIfAborted();

        if (!actor) {
          return buildAuthRequiredResponse();
        }
      }

      try {
        if (effectiveWorkspaceMode === "hosted" && actor && !previewBypassActive) {
          const { subscription, entitlement } = await (dependencies.getEntitlementByOwnerId
            ? dependencies.getEntitlementByOwnerId(env, actor.id)
            : getHostedEntitlementByOwnerId(env, actor.id));
          request.signal.throwIfAborted();

          if (!entitlement.workspaceAccess) {
            return buildPaidPlanRequiredResponse();
          }

          budgetInput = { ownerId: actor.id, cycleKey: resolveHostedAiBudgetCycleKey({
            planId: subscription?.planId ?? null, currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
          }), includedBudgetCents: resolveHostedAiIncludedBudgetCents(subscription?.planId, env) };
          accounting = (dependencies.accounting ?? hostedAiTaskAccounting)({ ...budgetInput,
            requestId: parsed.data.requestId, requestPayload: parsed.data }, env);
          if (execution.productionRollout) {
            accounting.productionRollout = { ...execution.productionRollout, ownerScope: actor.id };
          }
        }

        const response = await respond(parsed.data, request.signal, accounting);
        request.signal.throwIfAborted();
        if (response.usage && budgetInput) {
          const budget = await (dependencies.getBudgetSnapshot ?? getHostedAiBudgetSnapshot)(env, budgetInput);
          return NextResponse.json({ ...response, budget });
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

  return {
    async POST(request: Request): Promise<Response> {
      if (request.signal.aborted) return cancelledDocumentRequest();
      try {
        const response = await handlers.POST(request);
        return request.signal.aborted ? cancelledDocumentRequest() : privateResponse(response);
      } catch {
        return request.signal.aborted
          ? cancelledDocumentRequest()
          : privateJson({ error: "Workspace helper is temporarily unavailable." }, 503);
      }
    }
  };
}
