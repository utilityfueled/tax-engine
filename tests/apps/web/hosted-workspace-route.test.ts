import { afterEach, describe, expect, it, vi } from "vitest";
import { registerHostedWorkspaceStoreFactory } from "../../../apps/web/src/lib/hosted-persistence-registry";
import { createHostedWorkspaceRouteHandlers } from "../../../apps/web/src/lib/hosted-workspace-route";
import { createInMemoryHostedWorkspaceStore } from "../../../apps/web/src/lib/workspace-persistence";

describe("hosted workspace route", () => {
  afterEach(() => {
    registerHostedWorkspaceStoreFactory(null);
  });

  it("returns owner-required when hosted mode has no authenticated actor", async () => {
    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_APP_URL: "https://tax.example",
        BETTER_AUTH_SECRET: "hosted-auth-secret-for-tests-1234567890"
      }
    });

    const response = await handlers.list(new Request("https://tax.example/api/hosted/workspaces"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      availability: "owner-required",
      ownerScope: null,
      workspace: null,
      workspaces: []
    });
  });

  it("creates, lists, and deletes hosted preview workspaces inside the authenticated owner scope", async () => {
    const hostedStore = createInMemoryHostedWorkspaceStore();
    const adaHandlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "owner-ada",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_LABEL: "Ada Preview"
      },
      hostedStore,
      now: () => "2026-03-12T07:40:00.000Z"
    });
    const graceHandlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "owner-grace",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_LABEL: "Grace Preview"
      },
      hostedStore,
      now: () => "2026-03-12T07:41:00.000Z"
    });

    const createAdaResponse = await adaHandlers.get(
      new Request("https://tax.example/api/hosted/workspaces/preview-1?create=1"),
      {
        workspaceId: "preview-1"
      }
    );
    const createGraceResponse = await graceHandlers.get(
      new Request("https://tax.example/api/hosted/workspaces/preview-1?create=1"),
      {
        workspaceId: "preview-1"
      }
    );
    const adaListResponse = await adaHandlers.list(
      new Request("https://tax.example/api/hosted/workspaces")
    );
    const graceListResponse = await graceHandlers.list(
      new Request("https://tax.example/api/hosted/workspaces")
    );

    await expect(createAdaResponse.json()).resolves.toMatchObject({
      availability: "ready",
      ownerScope: {
        ownerId: "owner-ada",
        ownerLabel: "Ada Preview",
        scopeKey: "hosted-owner:owner-ada"
      },
      workspace: {
        id: "preview-1",
        storageMode: "hosted-postgres"
      }
    });
    await expect(createGraceResponse.json()).resolves.toMatchObject({
      availability: "ready",
      ownerScope: {
        ownerId: "owner-grace",
        ownerLabel: "Grace Preview",
        scopeKey: "hosted-owner:owner-grace"
      },
      workspace: {
        id: "preview-1",
        storageMode: "hosted-postgres"
      }
    });
    await expect(adaListResponse.json()).resolves.toMatchObject({
      availability: "ready",
      ownerScope: {
        ownerId: "owner-ada"
      },
      workspaces: [
        {
          id: "preview-1",
          storageMode: "hosted-postgres"
        }
      ]
    });
    await expect(graceListResponse.json()).resolves.toMatchObject({
      availability: "ready",
      ownerScope: {
        ownerId: "owner-grace"
      },
      workspaces: [
        {
          id: "preview-1",
          storageMode: "hosted-postgres"
        }
      ]
    });

    const deleteAdaResponse = await adaHandlers.delete(
      new Request("https://tax.example/api/hosted/workspaces/preview-1", {
        method: "DELETE"
      }),
      {
        workspaceId: "preview-1"
      }
    );
    const graceListAfterDeleteResponse = await graceHandlers.list(
      new Request("https://tax.example/api/hosted/workspaces")
    );

    await expect(deleteAdaResponse.json()).resolves.toMatchObject({
      availability: "ready",
      ownerScope: {
        ownerId: "owner-ada"
      },
      workspaces: []
    });
    await expect(graceListAfterDeleteResponse.json()).resolves.toMatchObject({
      availability: "ready",
      ownerScope: {
        ownerId: "owner-grace"
      },
      workspaces: [
        {
          id: "preview-1",
          storageMode: "hosted-postgres"
        }
      ]
    });
  });

  it("passes the normalized owner scope into the hosted store factory", async () => {
    const hostedStoreFactory = vi.fn(() => createInMemoryHostedWorkspaceStore());
    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND: "postgres-s3",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: " owner-scope ",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_LABEL: " Scope Preview "
      },
      hostedStoreFactory,
      now: () => "2026-03-12T07:42:00.000Z"
    });

    const response = await handlers.get(
      new Request("https://tax.example/api/hosted/workspaces/scoped-preview?create=1"),
      {
        workspaceId: "scoped-preview"
      }
    );

    expect(response.status).toBe(200);
    expect(hostedStoreFactory).toHaveBeenCalledWith({
      ownerId: "owner-scope",
      ownerLabel: "Scope Preview",
      scopeKey: "hosted-owner:owner-scope"
    }, expect.objectContaining({
      hostedBackend: "postgres-s3"
    }));
  });

  it("saves hosted workspace snapshots inside the authenticated owner scope", async () => {
    const hostedStore = createInMemoryHostedWorkspaceStore();
    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "owner-save",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_LABEL: "Save Preview"
      },
      hostedStore,
      now: () => "2026-03-12T07:44:00.000Z"
    });

    const response = await handlers.save(
      new Request("https://tax.example/api/hosted/workspaces/saved-workspace", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          workspace: {
            id: "saved-workspace",
            createdAt: "2026-03-12T07:40:00.000Z",
            updatedAt: "2026-03-12T07:44:00.000Z",
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
              status: "empty",
              taxYearHints: [],
              facts: [],
              interviewQuestions: [],
              interviewQueue: [],
              nextQuestionId: null,
              reviewNotes: []
            },
            structuredFacts: [],
            returnSummary: {
              status: "empty",
              targetTaxYear: null,
              taxYearState: "missing",
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
        })
      }),
      {
        workspaceId: "saved-workspace"
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      availability: "ready",
      ownerScope: {
        ownerId: "owner-save",
        ownerLabel: "Save Preview",
        scopeKey: "hosted-owner:owner-save"
      },
      workspace: {
        id: "saved-workspace",
        storageMode: "hosted-postgres"
      }
    });
  });

  it("uses the registered hosted store factory when postgres-s3 is selected in the app runtime path", async () => {
    const registeredFactory = vi.fn(() => createInMemoryHostedWorkspaceStore());

    registerHostedWorkspaceStoreFactory(registeredFactory);

    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND: "postgres-s3",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "owner-registered",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_LABEL: "Registered Preview"
      },
      now: () => "2026-03-12T07:43:00.000Z"
    });

    const response = await handlers.get(
      new Request("https://tax.example/api/hosted/workspaces/registered-preview?create=1"),
      {
        workspaceId: "registered-preview"
      }
    );

    expect(response.status).toBe(200);
    expect(registeredFactory).toHaveBeenCalledWith({
      ownerId: "owner-registered",
      ownerLabel: "Registered Preview",
      scopeKey: "hosted-owner:owner-registered"
    }, expect.objectContaining({
      hostedBackend: "postgres-s3",
      externalAdapterConfigured: true
    }));
    await expect(response.json()).resolves.toMatchObject({
      availability: "ready",
      ownerScope: {
        ownerId: "owner-registered",
        ownerLabel: "Registered Preview",
        scopeKey: "hosted-owner:owner-registered"
      },
      workspace: {
        id: "registered-preview",
        storageMode: "hosted-postgres"
      }
    });
  });

  it("returns a structured 503 when postgres-s3 is selected without an injected workspace store adapter", async () => {
    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND: "postgres-s3",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "owner-missing-store",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_LABEL: "Missing Store Preview"
      }
    });

    const response = await handlers.get(
      new Request("https://tax.example/api/hosted/workspaces/missing-store?create=1"),
      {
        workspaceId: "missing-store"
      }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Server configuration error: DATABASE_URL is required for hosted account, billing, and persistence features."
    });
  });

  it("bypasses the registered hosted store factory outside hosted deployment mode", async () => {
    const registeredFactory = vi.fn(() => createInMemoryHostedWorkspaceStore());

    registerHostedWorkspaceStoreFactory(registeredFactory);

    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host"
      }
    });

    const response = await handlers.list(new Request("https://tax.example/api/hosted/workspaces"));

    expect(response.status).toBe(404);
    expect(registeredFactory).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Hosted workspace routes are disabled outside hosted deployment mode."
    });
  });
});
