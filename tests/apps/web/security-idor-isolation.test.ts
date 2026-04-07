import { describe, expect, it } from "vitest";
import { createHostedWorkspaceRouteHandlers } from "../../../apps/web/src/lib/hosted-workspace-route";
import {
  createInMemoryHostedDocumentBlobStore,
  createInMemoryHostedWorkspaceStore,
  type HostedDocumentBlobStore,
  type HostedWorkspaceStore
} from "../../../apps/web/src/lib/workspace-persistence";
import { createWorkspaceRecord } from "../../../apps/web/src/lib/workspace-storage";

const NOW = "2026-03-27T00:00:00.000Z";

function createHandlersForActor(
  actorId: string,
  sharedStore: HostedWorkspaceStore,
  sharedBlobStore: HostedDocumentBlobStore
) {
  return createHostedWorkspaceRouteHandlers({
    env: {
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: actorId,
      TAX_ENGINE_HOSTED_PREVIEW_ACTOR_LABEL: `Actor ${actorId}`
    },
    hostedStore: sharedStore,
    hostedDocumentBlobStore: sharedBlobStore,
    now: () => NOW
  });
}

function fakeRequest(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("security: IDOR isolation — workspace data scoped by owner", () => {
  it("user A cannot read user B workspaces via list", async () => {
    const store = createInMemoryHostedWorkspaceStore();
    const blobStore = createInMemoryHostedDocumentBlobStore();

    const handlersA = createHandlersForActor("owner-alice", store, blobStore);
    const handlersB = createHandlersForActor("owner-bob", store, blobStore);

    // Alice creates a workspace
    const workspace = createWorkspaceRecord("ws-alice-private", {
      now: NOW,
      storageMode: "hosted-postgres",
      createdMessage: "Alice workspace"
    });

    await handlersA.save(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-alice-private", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace })
      }),
      { workspaceId: "ws-alice-private" }
    );

    // Alice can see her workspace
    const aliceList = await handlersA.list(
      fakeRequest("https://tax.example/api/hosted/workspaces")
    );
    const aliceListBody = await aliceList.json();
    expect(aliceListBody.workspaces).toHaveLength(1);
    expect(aliceListBody.workspaces[0].id).toBe("ws-alice-private");

    // Bob sees an empty list — no access to Alice's workspace
    const bobList = await handlersB.list(
      fakeRequest("https://tax.example/api/hosted/workspaces")
    );
    const bobListBody = await bobList.json();
    expect(bobListBody.workspaces).toHaveLength(0);
  });

  it("user A cannot read user B workspace by id", async () => {
    const store = createInMemoryHostedWorkspaceStore();
    const blobStore = createInMemoryHostedDocumentBlobStore();

    const handlersA = createHandlersForActor("owner-alice", store, blobStore);
    const handlersB = createHandlersForActor("owner-bob", store, blobStore);

    // Alice creates a workspace
    const workspace = createWorkspaceRecord("ws-alice-secret", {
      now: NOW,
      storageMode: "hosted-postgres",
      createdMessage: "Secret data"
    });

    await handlersA.save(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-alice-secret", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace })
      }),
      { workspaceId: "ws-alice-secret" }
    );

    // Bob tries to access Alice's workspace by ID
    const bobGet = await handlersB.get(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-alice-secret"),
      { workspaceId: "ws-alice-secret" }
    );
    const bobBody = await bobGet.json();
    expect(bobBody.workspace).toBeNull();
  });

  it("user A cannot delete user B workspace", async () => {
    const store = createInMemoryHostedWorkspaceStore();
    const blobStore = createInMemoryHostedDocumentBlobStore();

    const handlersA = createHandlersForActor("owner-alice", store, blobStore);
    const handlersB = createHandlersForActor("owner-bob", store, blobStore);

    // Alice creates a workspace
    const workspace = createWorkspaceRecord("ws-alice-keep", {
      now: NOW,
      storageMode: "hosted-postgres",
      createdMessage: "Keep me"
    });

    await handlersA.save(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-alice-keep", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace })
      }),
      { workspaceId: "ws-alice-keep" }
    );

    // Bob tries to delete Alice's workspace
    await handlersB.delete(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-alice-keep", {
        method: "DELETE"
      }),
      { workspaceId: "ws-alice-keep" }
    );

    // Alice's workspace still exists
    const aliceGet = await handlersA.get(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-alice-keep"),
      { workspaceId: "ws-alice-keep" }
    );
    const aliceBody = await aliceGet.json();
    expect(aliceBody.workspace).not.toBeNull();
    expect(aliceBody.workspace.id).toBe("ws-alice-keep");
  });

  it("user A cannot overwrite user B workspace via save", async () => {
    const store = createInMemoryHostedWorkspaceStore();
    const blobStore = createInMemoryHostedDocumentBlobStore();

    const handlersA = createHandlersForActor("owner-alice", store, blobStore);
    const handlersB = createHandlersForActor("owner-bob", store, blobStore);

    // Alice creates a workspace with a distinct timestamp
    const aliceTime = "2026-01-01T00:00:00.000Z";
    const aliceWorkspace = createWorkspaceRecord("ws-shared-id", {
      now: aliceTime,
      storageMode: "hosted-postgres"
    });

    await handlersA.save(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-shared-id", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace: aliceWorkspace })
      }),
      { workspaceId: "ws-shared-id" }
    );

    // Bob saves a workspace with the same ID and a different timestamp
    const bobTime = "2026-06-15T00:00:00.000Z";
    const bobWorkspace = createWorkspaceRecord("ws-shared-id", {
      now: bobTime,
      storageMode: "hosted-postgres"
    });

    await handlersB.save(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-shared-id", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace: bobWorkspace })
      }),
      { workspaceId: "ws-shared-id" }
    );

    // Alice's workspace retains her original timestamp — Bob's save did not overwrite it
    const aliceGet = await handlersA.get(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-shared-id"),
      { workspaceId: "ws-shared-id" }
    );
    const aliceBody = await aliceGet.json();
    expect(aliceBody.workspace).not.toBeNull();
    expect(aliceBody.workspace.createdAt).toBe(aliceTime);

    // Bob has his own copy with his own timestamp
    const bobGet = await handlersB.get(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-shared-id"),
      { workspaceId: "ws-shared-id" }
    );
    const bobBody = await bobGet.json();
    expect(bobBody.workspace).not.toBeNull();
    expect(bobBody.workspace.createdAt).toBe(bobTime);
  });

  it("user A cannot upload documents to user B workspace", async () => {
    const store = createInMemoryHostedWorkspaceStore();
    const blobStore = createInMemoryHostedDocumentBlobStore();

    const handlersA = createHandlersForActor("owner-alice", store, blobStore);
    const handlersB = createHandlersForActor("owner-bob", store, blobStore);

    // Alice creates a workspace
    const workspace = createWorkspaceRecord("ws-alice-docs", {
      now: NOW,
      storageMode: "hosted-postgres",
      createdMessage: "Alice docs workspace"
    });

    await handlersA.save(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-alice-docs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace })
      }),
      { workspaceId: "ws-alice-docs" }
    );

    // Bob uploads a document targeting Alice's workspace ID
    const formData = new FormData();
    formData.set("documentId", "doc-injected");
    formData.set("file", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "evil.pdf", {
      type: "application/pdf"
    }));

    const bobUpload = await handlersB.uploadDocument(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-alice-docs/documents", {
        method: "POST",
        body: formData
      }),
      { workspaceId: "ws-alice-docs" }
    );

    // The upload succeeds — but it's stored under Bob's owner scope, not Alice's
    expect(bobUpload.status).toBe(200);

    // Verify: the blob is stored under Bob's owner ID, not Alice's.
    // Alice's blob store for this workspace should be empty.
    const aliceBlobs = blobStore.listByWorkspace("owner-alice", "ws-alice-docs");
    expect(aliceBlobs).toHaveLength(0);

    // Bob's blob store has the document
    const bobBlobs = blobStore.listByWorkspace("owner-bob", "ws-alice-docs");
    expect(bobBlobs).toHaveLength(1);
    expect(bobBlobs[0].documentId).toBe("doc-injected");
  });

  it("unauthenticated requests cannot access any workspace data", async () => {
    const store = createInMemoryHostedWorkspaceStore();
    const blobStore = createInMemoryHostedDocumentBlobStore();

    // Create handlers without a preview actor (simulates unauthenticated request)
    const unauthHandlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted"
      },
      hostedStore: store,
      hostedDocumentBlobStore: blobStore,
      now: () => NOW
    });

    // Seed a workspace via the store directly
    store.save("owner-alice", createWorkspaceRecord("ws-alice-data", {
      now: NOW,
      storageMode: "hosted-postgres",
      createdMessage: "Sensitive tax data"
    }));

    // Unauthenticated list returns 401
    const listResponse = await unauthHandlers.list(
      fakeRequest("https://tax.example/api/hosted/workspaces")
    );
    expect(listResponse.status).toBe(401);

    // Unauthenticated get returns 401
    const getResponse = await unauthHandlers.get(
      fakeRequest("https://tax.example/api/hosted/workspaces/ws-alice-data"),
      { workspaceId: "ws-alice-data" }
    );
    expect(getResponse.status).toBe(401);
  });
});

describe("security: persistence error sanitization — no internal details leak", () => {
  it("list returns 503 with safe message when persistence store throws", async () => {
    const throwingStore = {
      get() { throw new Error("FATAL: connection to server at 10.0.1.5:5432 failed: SCRAM authentication failed for user 'taxengine'"); },
      listByOwner() { throw new Error("FATAL: connection to server at 10.0.1.5:5432 failed"); },
      save() { throw new Error("relation \"workspaces\" does not exist"); },
      delete() { throw new Error("relation \"workspaces\" does not exist"); }
    };

    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "actor-1"
      },
      hostedStore: throwingStore,
      hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore(),
      now: () => NOW
    });

    const response = await handlers.list(
      new Request("https://tax.example/api/hosted/workspaces")
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("The server is temporarily unavailable. Please try again later.");
    expect(JSON.stringify(body)).not.toContain("10.0.1.5");
    expect(JSON.stringify(body)).not.toContain("5432");
    expect(JSON.stringify(body)).not.toContain("SCRAM");
  });

  it("get returns 503 with safe message when persistence store throws", async () => {
    const throwingStore = {
      get() { throw new Error("SELECT * FROM workspaces WHERE owner_id=$1 — column \"owner_id\" does not exist"); },
      listByOwner() { return []; },
      save() { throw new Error("database error"); },
      delete() { return []; }
    };

    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "actor-1"
      },
      hostedStore: throwingStore,
      hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore(),
      now: () => NOW
    });

    const response = await handlers.get(
      new Request("https://tax.example/api/hosted/workspaces/ws-1"),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("The server is temporarily unavailable. Please try again later.");
    expect(JSON.stringify(body)).not.toContain("SELECT");
    expect(JSON.stringify(body)).not.toContain("owner_id");
  });

  it("save returns 503 with safe message when persistence store throws", async () => {
    const throwingStore = {
      get() { return null; },
      listByOwner() { return []; },
      save() { throw new Error("duplicate key value violates unique constraint \"workspaces_pkey\""); },
      delete() { return []; }
    };

    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "actor-1"
      },
      hostedStore: throwingStore,
      hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore(),
      now: () => NOW
    });

    const workspace = createWorkspaceRecord("ws-1", {
      now: NOW,
      storageMode: "hosted-postgres"
    });

    const response = await handlers.save(
      new Request("https://tax.example/api/hosted/workspaces/ws-1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace })
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("The server is temporarily unavailable. Please try again later.");
    expect(JSON.stringify(body)).not.toContain("duplicate key");
    expect(JSON.stringify(body)).not.toContain("workspaces_pkey");
  });

  it("delete returns 503 with safe message when persistence store throws", async () => {
    const throwingStore = {
      get() { return null; },
      listByOwner() { return []; },
      save() { throw new Error("database error"); },
      delete() { throw new Error("could not serialize access due to concurrent update on table \"workspaces\""); }
    };

    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "actor-1"
      },
      hostedStore: throwingStore,
      hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore(),
      now: () => NOW
    });

    const response = await handlers.delete(
      new Request("https://tax.example/api/hosted/workspaces/ws-1", {
        method: "DELETE"
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("The server is temporarily unavailable. Please try again later.");
    expect(JSON.stringify(body)).not.toContain("concurrent update");
    expect(JSON.stringify(body)).not.toContain("workspaces");
  });
});

describe("security: upload content-length pre-check prevents memory exhaustion", () => {
  it("rejects uploads with content-length exceeding the upload limit before reading body", async () => {
    const store = createInMemoryHostedWorkspaceStore();
    const blobStore = createInMemoryHostedDocumentBlobStore();
    const handlers = createHandlersForActor("owner-precheck", store, blobStore);

    // Create a request with a content-length header that exceeds 26 MB (upload limit + overhead)
    // but a small actual body — the pre-check should reject based on the declared size alone
    const formData = new FormData();
    formData.set("documentId", "doc-huge");
    formData.set("file", new File(["tiny"], "small.pdf", {
      type: "application/pdf"
    }));

    const request = new Request(
      "https://tax.example/api/hosted/workspaces/ws-1/documents",
      {
        method: "POST",
        body: formData,
        headers: {
          "content-length": String(100 * 1024 * 1024) // 100 MB declared
        }
      }
    );

    const response = await handlers.uploadDocument(request, { workspaceId: "ws-1" });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("25 MB");
  });

  it("allows uploads with content-length within limits", async () => {
    const store = createInMemoryHostedWorkspaceStore();
    const blobStore = createInMemoryHostedDocumentBlobStore();
    const handlers = createHandlersForActor("owner-precheck", store, blobStore);

    const formData = new FormData();
    formData.set("documentId", "doc-ok");
    formData.set("file", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "receipt.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      new Request(
        "https://tax.example/api/hosted/workspaces/ws-1/documents",
        { method: "POST", body: formData }
      ),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(200);
  });
});
