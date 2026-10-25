import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createHostedWorkspaceRouteHandlers } from "../../../apps/web/src/lib/hosted-workspace-route";
import {
  createHostedBillingCheckoutRouteHandlers
} from "../../../apps/web/src/lib/hosted-billing";
import {
  createInMemoryHostedDocumentBlobStore,
  createInMemoryHostedWorkspaceStore
} from "../../../apps/web/src/lib/workspace-persistence";
import { createWorkspaceRecord } from "../../../apps/web/src/lib/workspace-storage";

const NOW = "2026-03-28T00:00:00.000Z";

function fakeRequest(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("security: self-host mode disables hosted workspace routes", () => {
  function createSelfHostHandlers() {
    return createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host"
      },
      hostedStore: createInMemoryHostedWorkspaceStore(),
      hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore(),
      now: () => NOW
    });
  }

  it("list returns 404 in self-host mode", async () => {
    const handlers = createSelfHostHandlers();

    const response = await handlers.list(
      fakeRequest("http://localhost:3000/api/hosted/workspaces")
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain("disabled");
  });

  it("get returns 404 in self-host mode", async () => {
    const handlers = createSelfHostHandlers();

    const response = await handlers.get(
      fakeRequest("http://localhost:3000/api/hosted/workspaces/ws-1"),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain("disabled");
  });

  it("save returns 404 in self-host mode even with valid payload", async () => {
    const handlers = createSelfHostHandlers();
    const workspace = createWorkspaceRecord("ws-1", {
      now: NOW,
      storageMode: "hosted-postgres"
    });

    const response = await handlers.save(
      fakeRequest("http://localhost:3000/api/hosted/workspaces/ws-1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace })
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(404);
  });

  it("delete returns 404 in self-host mode", async () => {
    const handlers = createSelfHostHandlers();

    const response = await handlers.delete(
      fakeRequest("http://localhost:3000/api/hosted/workspaces/ws-1", {
        method: "DELETE"
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(404);
  });

  it("uploadDocument returns 404 in self-host mode", async () => {
    const handlers = createSelfHostHandlers();
    const formData = new FormData();
    formData.set("documentId", "doc-1");
    formData.set("file", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "test.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      fakeRequest("http://localhost:3000/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(404);
  });

  it("self-host mode does not expose workspace data seeded in the hosted store", async () => {
    const sharedStore = createInMemoryHostedWorkspaceStore();

    // Seed a workspace directly in the store (simulating hosted data existing)
    sharedStore.save("owner-1", createWorkspaceRecord("ws-sensitive", {
      now: NOW,
      storageMode: "hosted-postgres",
      createdMessage: "Sensitive tax data"
    }));

    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host"
      },
      hostedStore: sharedStore,
      hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore(),
      now: () => NOW
    });

    // Even though data exists in the store, self-host mode returns 404
    const listResponse = await handlers.list(
      fakeRequest("http://localhost:3000/api/hosted/workspaces")
    );
    expect(listResponse.status).toBe(404);

    const getResponse = await handlers.get(
      fakeRequest("http://localhost:3000/api/hosted/workspaces/ws-sensitive"),
      { workspaceId: "ws-sensitive" }
    );
    expect(getResponse.status).toBe(404);
  });
});

describe("security: self-host mode disables billing checkout", () => {
  it("checkout returns bypass response in self-host mode", async () => {
    const { POST } = createHostedBillingCheckoutRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host"
      }
    });

    const response = await POST(fakeRequest("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planId: "starter",
        successUrl: "http://localhost:3000/success",
        cancelUrl: "http://localhost:3000/cancel"
      })
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.bypassed).toBe(true);
    expect(body.sessionId).toBeNull();
    expect(body.checkoutUrl).toBeNull();
  });
});

describe("security: hosted mode rejects all workspace methods without auth", () => {
  function createHostedUnauthHandlers() {
    return createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        BETTER_AUTH_SECRET: "test-secret-12345"
      },
      hostedStore: createInMemoryHostedWorkspaceStore(),
      hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore(),
      now: () => NOW
    });
  }

  it("unauthenticated list returns 401", async () => {
    const handlers = createHostedUnauthHandlers();
    const response = await handlers.list(
      fakeRequest("https://tax.example/api/hosted/workspaces")
    );
    expect(response.status).toBe(401);
  });

  it("unauthenticated get returns 401", async () => {
    const handlers = createHostedUnauthHandlers();
    const response = await handlers.get(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-1"),
      { workspaceId: "ws-1" }
    );
    expect(response.status).toBe(401);
  });

  it("unauthenticated save returns 401", async () => {
    const handlers = createHostedUnauthHandlers();
    const workspace = createWorkspaceRecord("ws-1", {
      now: NOW,
      storageMode: "hosted-postgres"
    });

    const response = await handlers.save(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace })
      }),
      { workspaceId: "ws-1" }
    );
    expect(response.status).toBe(401);
  });

  it("unauthenticated delete returns 401", async () => {
    const handlers = createHostedUnauthHandlers();
    const response = await handlers.delete(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-1", {
        method: "DELETE"
      }),
      { workspaceId: "ws-1" }
    );
    expect(response.status).toBe(401);
  });

  it("unauthenticated upload returns 401", async () => {
    const handlers = createHostedUnauthHandlers();
    const formData = new FormData();
    formData.set("documentId", "doc-1");
    formData.set("file", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "test.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-1/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-1" }
    );
    expect(response.status).toBe(401);
  });

  it("401 response body does not leak internal auth state", async () => {
    const handlers = createHostedUnauthHandlers();
    const response = await handlers.list(
      fakeRequest("https://tax.example/api/hosted/workspaces")
    );
    const body = await response.json();
    const text = JSON.stringify(body);

    // Should not reveal auth configuration details
    expect(text).not.toContain("BETTER_AUTH");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("preview");
    expect(text).not.toContain("better-auth");
    expect(text).not.toContain("cookie");
    expect(text).not.toContain("session");
  });
});

describe("security: provider interview route requires auth in hosted mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects unauthenticated interview request in hosted mode with 401", async () => {
    vi.stubEnv("TAX_ENGINE_DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-interview-auth-secret-1234567890");
    // Ensure preview actor bypass is NOT active
    delete process.env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID;

    const { POST } = await import("../../../apps/web/src/app/api/provider/interview/route");

    const response = await POST(new Request("https://tax.example/api/provider/interview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task: "interview-assist",
        requestId: "req-1",
        requestedAt: "2026-03-28T00:00:00.000Z",
        interview: { workspaceId: "ws-1", questions: [] },
        redactions: [],
        replacementCount: 0
      })
    }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("Authentication required");
    // Should not leak auth internals
    expect(body.error).not.toContain("BETTER_AUTH");
    expect(body.error).not.toContain("secret");
  });
});

describe("security: provider export-draft route requires auth in hosted mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects unauthenticated export-draft request in hosted mode with 401", async () => {
    vi.stubEnv("TAX_ENGINE_DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-export-auth-secret-1234567890");
    delete process.env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID;

    const { POST } = await import("../../../apps/web/src/app/api/provider/export-draft/route");

    const response = await POST(new Request("https://tax.example/api/provider/export-draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task: "export-draft",
        requestId: "req-1",
        requestedAt: "2026-03-28T00:00:00.000Z",
        exportDraft: { workspaceId: "ws-1", checklist: [], enginePreview: null },
        redactions: [],
        replacementCount: 0
      })
    }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("Authentication required");
    expect(body.error).not.toContain("BETTER_AUTH");
    expect(body.error).not.toContain("secret");
  });
});
