import { afterEach, describe, expect, it, vi } from "vitest";
import { createProviderWorkspaceRouteHandlers } from "../../../apps/web/src/lib/provider-workspace-route";

function buildMinimalWorkspaceRequestBody() {
  return {
    task: "workspace-summary",
    requestId: "provider-workspace:ws-1:2026-03-27T00:00:00.000Z",
    requestedAt: "2026-03-27T00:00:00.000Z",
    replacementCount: 0,
    redactions: [],
    unsupportedRoutes: [],
    workspace: {
      id: "ws-1",
      createdAt: "2026-03-27T00:00:00.000Z",
      updatedAt: "2026-03-27T00:00:00.000Z",
      storageMode: "local-browser",
      documents: [],
      summary: {
        totalDocuments: 0,
        officialFixtureMatches: 0,
        supportedDocuments: 0,
        pendingReviewDocuments: 0,
        interviewQuestionsRemaining: 0
      },
      seededReturn: {
        status: "ready-for-interview",
        taxYearHints: [2025],
        facts: [],
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: null,
        reviewNotes: []
      },
      structuredFacts: [],
      returnSummary: {
        status: "ready-to-recompute",
        targetTaxYear: 2025,
        taxYearState: "single",
        answeredFactCount: 0,
        totalFactCount: 0,
        readyItemCount: 0,
        itemCount: 0,
        blockers: [],
        items: []
      },
      enginePreview: null,
      checklist: [],
      auditTrail: []
    }
  };
}

function buildMinimalWorkspaceHelpRequestBody() {
  return {
    ...buildMinimalWorkspaceRequestBody(),
    task: "workspace-help",
    question: "What should I do next?",
    assistantContext: {
      mode: "guided",
      currentSectionId: "guided-setup",
      currentSectionLabel: "guided setup",
      conversation: []
    }
  };
}

function buildMinimalInterviewRequestBody() {
  return {
    task: "interview-assist",
    requestId: "interview:ws-1:2026-03-27T00:00:00.000Z",
    requestedAt: "2026-03-27T00:00:00.000Z",
    replacementCount: 0,
    redactions: [],
    interview: {
      questions: []
    }
  };
}

function buildMinimalExportDraftRequestBody() {
  return {
    task: "export-draft",
    requestId: "export-draft:ws-1:2026-03-27T00:00:00.000Z",
    requestedAt: "2026-03-27T00:00:00.000Z",
    replacementCount: 0,
    redactions: [],
    exportDraft: {
      checklist: [],
      enginePreview: null
    }
  };
}

describe("security: provider workspace route requires auth in hosted mode", () => {
  it("rejects unauthenticated provider workspace requests in hosted mode with 401", async () => {
    const { POST } = createProviderWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        BETTER_AUTH_SECRET: "test-secret-for-provider-auth"
      }
    });

    const hostedBody = {
      ...buildMinimalWorkspaceRequestBody(),
      workspace: {
        ...buildMinimalWorkspaceRequestBody().workspace,
        storageMode: "hosted-postgres"
      }
    };

    const response = await POST(new Request("https://tax.example/api/provider/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(hostedBody)
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Sign in and choose a paid plan to use the AI assistant.",
      code: "auth_required",
      signInUrl: "/account?mode=sign-in",
      billingUrl: "/billing"
    });
  });

  it("allows authenticated provider workspace requests in hosted mode", async () => {
    const { POST } = createProviderWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "provider-test-user"
      }
    });

    const response = await POST(new Request("http://localhost/api/provider/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMinimalWorkspaceRequestBody())
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.provider).toBe("mock-local");
    expect(body.requestId).toBe("provider-workspace:ws-1:2026-03-27T00:00:00.000Z");
  });

  it("allows unauthenticated provider workspace requests in self-host mode", async () => {
    const { POST } = createProviderWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host"
      }
    });

    const response = await POST(new Request("http://localhost/api/provider/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMinimalWorkspaceRequestBody())
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.provider).toBe("mock-local");
  });

  it("rejects hosted AI helper requests when no paid hosted plan is active", async () => {
    const fetchFn = vi.fn();
    const { POST } = createProviderWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_APP_URL: "https://tax.example",
        BETTER_AUTH_SECRET: "test-secret-for-provider-auth"
      },
      fetchFn,
      resolveActor: async () => ({
        id: "provider-paid-gate",
        label: "Provider Paid Gate",
        email: "paid-gate@example.com"
      }),
      getEntitlementByOwnerId: async () => ({
        subscription: null,
        entitlement: {
          plan: "self-host",
          workspaceAccess: false,
          reminderAutomationAccess: false,
          reviewAccess: false
        }
      })
    });

    const response = await POST(new Request("https://tax.example/api/provider/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMinimalWorkspaceHelpRequestBody())
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "AI helper access requires an active Starter or Plus plan.",
      code: "paid_plan_required",
      billingUrl: "/billing"
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("allows localhost AI helper requests for local-browser workspaces during hosted development", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  answer: "Use the local workspace context without hosted billing."
                })
              }
            ]
          }
        }
      ]
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })) as typeof fetch;

    try {
      const { POST } = createProviderWorkspaceRouteHandlers({
        env: {
          TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
          TAX_ENGINE_APP_URL: "https://tax.example",
          NODE_ENV: "development",
          GEMINI_API_KEY: "test-gemini-key",
          BETTER_AUTH_SECRET: "test-secret-for-provider-auth"
        }
      });

      const response = await POST(new Request("http://localhost/api/provider/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildMinimalWorkspaceHelpRequestBody())
      }));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        provider: "gemini",
        answer: "Use the local workspace context without hosted billing."
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("rejects hosted AI helper requests once the included budget is exhausted", async () => {
    const { POST } = createProviderWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_APP_URL: "https://tax.example",
        BETTER_AUTH_SECRET: "test-secret-for-provider-auth"
      },
      resolveActor: async () => ({
        id: "provider-budget-cap",
        label: "Provider Budget Cap",
        email: "budget-cap@example.com"
      }),
      getEntitlementByOwnerId: async () => ({
        subscription: {
          subscriptionId: "sub_budget_cap",
          customerId: "cus_budget_cap",
          workspaceOwnerId: "provider-budget-cap",
          planId: "starter",
          status: "active",
          lastEventId: "evt_budget_cap",
          lastEventType: "checkout.session.completed",
          updatedAt: "2026-04-02T00:00:00.000Z",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: "2026-05-02T00:00:00.000Z"
        },
        entitlement: {
          plan: "starter",
          workspaceAccess: true,
          reminderAutomationAccess: false,
          reviewAccess: false
        }
      }),
      getBudgetSnapshot: async () => ({
        ownerId: "provider-budget-cap",
        cycleKey: "starter:2026-05-02T00:00:00.000Z",
        includedBudgetCents: 1000,
        includedUsedCents: 1000,
        includedRemainingCents: 0,
        purchasedBudgetCents: 0,
        purchasedUsedCents: 0,
        purchasedRemainingCents: 0,
        totalRemainingCents: 0
      })
    });

    const response = await POST(new Request("https://tax.example/api/provider/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMinimalWorkspaceHelpRequestBody())
    }));

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.error).toContain("included AI helper budget is exhausted");
    expect(body.billingUrl).toBe("/billing");
  });

  it("rejects hosted AI helper requests when the provider is not configured", async () => {
    const { POST } = createProviderWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_APP_URL: "https://tax.example",
        BETTER_AUTH_SECRET: "test-secret-for-provider-auth"
      },
      resolveActor: async () => ({
        id: "provider-no-model",
        label: "Provider No Model",
        email: "provider-no-model@example.com"
      }),
      getEntitlementByOwnerId: async () => ({
        subscription: {
          subscriptionId: "sub_provider_no_model",
          customerId: "cus_provider_no_model",
          workspaceOwnerId: "provider-no-model",
          planId: "starter",
          status: "active",
          lastEventId: "evt_provider_no_model",
          lastEventType: "checkout.session.completed",
          updatedAt: "2026-04-02T00:00:00.000Z",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: "2026-05-02T00:00:00.000Z"
        },
        entitlement: {
          plan: "starter",
          workspaceAccess: true,
          reminderAutomationAccess: false,
          reviewAccess: false
        }
      }),
      getBudgetSnapshot: async () => ({
        ownerId: "provider-no-model",
        cycleKey: "starter:2026-05-02T00:00:00.000Z",
        includedBudgetCents: 1000,
        includedUsedCents: 0,
        includedRemainingCents: 1000,
        purchasedBudgetCents: 0,
        purchasedUsedCents: 0,
        purchasedRemainingCents: 0,
        totalRemainingCents: 1000
      })
    });

    const response = await POST(new Request("https://tax.example/api/provider/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMinimalWorkspaceHelpRequestBody())
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "The AI helper is not configured right now. Please email support@vivalatax.com before enabling hosted access.",
      code: "ai_provider_unavailable"
    });
  });
});

describe("security: provider interview route requires auth in hosted mode", () => {
  const originalDeploymentMode = process.env.TAX_ENGINE_DEPLOYMENT_MODE;
  const originalPreviewActorId = process.env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID;
  const originalAuthSecret = process.env.BETTER_AUTH_SECRET;

  afterEach(() => {
    if (originalDeploymentMode === undefined) {
      delete process.env.TAX_ENGINE_DEPLOYMENT_MODE;
    } else {
      process.env.TAX_ENGINE_DEPLOYMENT_MODE = originalDeploymentMode;
    }

    if (originalPreviewActorId === undefined) {
      delete process.env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID;
    } else {
      process.env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID = originalPreviewActorId;
    }

    if (originalAuthSecret === undefined) {
      delete process.env.BETTER_AUTH_SECRET;
    } else {
      process.env.BETTER_AUTH_SECRET = originalAuthSecret;
    }
  });

  it("rejects unauthenticated provider interview requests in hosted mode with 401", async () => {
    process.env.TAX_ENGINE_DEPLOYMENT_MODE = "hosted";
    process.env.BETTER_AUTH_SECRET = "test-secret-for-provider-auth";
    delete process.env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID;

    const { POST } = await import("../../../apps/web/src/app/api/provider/interview/route");

    const response = await POST(new Request("http://localhost/api/provider/interview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMinimalInterviewRequestBody())
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required for provider requests in hosted mode."
    });
  });

  it("allows authenticated provider interview requests in hosted mode", async () => {
    process.env.TAX_ENGINE_DEPLOYMENT_MODE = "hosted";
    process.env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID = "interview-test-user";

    const { POST } = await import("../../../apps/web/src/app/api/provider/interview/route");

    const response = await POST(new Request("http://localhost/api/provider/interview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMinimalInterviewRequestBody())
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.provider).toBe("mock-local");
  });
});

describe("security: provider export-draft route requires auth in hosted mode", () => {
  const originalDeploymentMode = process.env.TAX_ENGINE_DEPLOYMENT_MODE;
  const originalPreviewActorId = process.env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID;
  const originalAuthSecret = process.env.BETTER_AUTH_SECRET;

  afterEach(() => {
    if (originalDeploymentMode === undefined) {
      delete process.env.TAX_ENGINE_DEPLOYMENT_MODE;
    } else {
      process.env.TAX_ENGINE_DEPLOYMENT_MODE = originalDeploymentMode;
    }

    if (originalPreviewActorId === undefined) {
      delete process.env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID;
    } else {
      process.env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID = originalPreviewActorId;
    }

    if (originalAuthSecret === undefined) {
      delete process.env.BETTER_AUTH_SECRET;
    } else {
      process.env.BETTER_AUTH_SECRET = originalAuthSecret;
    }
  });

  it("rejects unauthenticated provider export-draft requests in hosted mode with 401", async () => {
    process.env.TAX_ENGINE_DEPLOYMENT_MODE = "hosted";
    process.env.BETTER_AUTH_SECRET = "test-secret-for-provider-auth";
    delete process.env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID;

    const { POST } = await import("../../../apps/web/src/app/api/provider/export-draft/route");

    const response = await POST(new Request("http://localhost/api/provider/export-draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMinimalExportDraftRequestBody())
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required for provider requests in hosted mode."
    });
  });

  it("allows authenticated provider export-draft requests in hosted mode", async () => {
    process.env.TAX_ENGINE_DEPLOYMENT_MODE = "hosted";
    process.env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID = "export-test-user";

    const { POST } = await import("../../../apps/web/src/app/api/provider/export-draft/route");

    const response = await POST(new Request("http://localhost/api/provider/export-draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMinimalExportDraftRequestBody())
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.provider).toBe("mock-local");
  });
});
