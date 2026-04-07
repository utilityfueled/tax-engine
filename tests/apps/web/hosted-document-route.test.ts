import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerHostedDocumentBlobStoreFactory,
  registerHostedWorkspaceStoreFactory
} from "../../../apps/web/src/lib/hosted-persistence-registry";
import { createHostedWorkspaceRouteHandlers } from "../../../apps/web/src/lib/hosted-workspace-route";
import {
  createInMemoryHostedDocumentBlobStore,
  createInMemoryHostedWorkspaceStore
} from "../../../apps/web/src/lib/workspace-persistence";
import { createWorkspaceRecord } from "../../../apps/web/src/lib/workspace-storage";

/** Minimal valid PDF magic bytes (%PDF-1.4). */
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);

describe("hosted document route", () => {
  afterEach(() => {
    registerHostedWorkspaceStoreFactory(null);
    registerHostedDocumentBlobStoreFactory(null);
  });

  it("returns owner-required when hosted document uploads have no authenticated actor", async () => {
    const formData = new FormData();

    formData.set("documentId", "doc-1");
    formData.set("file", new File([PDF_MAGIC], "fw2.pdf", {
      type: "application/pdf"
    }));

    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_APP_URL: "https://tax.example",
        BETTER_AUTH_SECRET: "hosted-auth-secret-for-tests-1234567890"
      }
    });
    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/no-owner/documents", {
        method: "POST",
        body: formData
      }),
      {
        workspaceId: "no-owner"
      }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      availability: "owner-required",
      ownerScope: null,
      workspace: null,
      workspaces: []
    });
  });

  it("stores hosted document blobs in the owner scope and prunes them when the workspace snapshot drops the blob key", async () => {
    const hostedStore = createInMemoryHostedWorkspaceStore();
    const hostedBlobStore = createInMemoryHostedDocumentBlobStore();
    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "owner-docs",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_LABEL: "Document Preview"
      },
      hostedStore,
      hostedDocumentBlobStore: hostedBlobStore,
      now: () => "2026-03-12T07:48:00.000Z"
    });
    const uploadFormData = new FormData();

    uploadFormData.set("documentId", "doc-blob");
    uploadFormData.set("uploadedAt", "2026-03-12T07:48:00.000Z");
    uploadFormData.set("file", new File([PDF_MAGIC], "fw2.pdf", {
      type: "application/pdf"
    }));

    const uploadResponse = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/blobbed/documents", {
        method: "POST",
        body: uploadFormData
      }),
      {
        workspaceId: "blobbed"
      }
    );
    const uploadPayload = await uploadResponse.json();

    expect(uploadResponse.status).toBe(200);
    expect(uploadPayload).toMatchObject({
      availability: "ready",
      ownerScope: {
        ownerId: "owner-docs",
        ownerLabel: "Document Preview",
        scopeKey: "hosted-owner:owner-docs"
      },
      document: {
        workspaceId: "blobbed",
        documentId: "doc-blob",
        fileName: "fw2.pdf"
      }
    });
    const storedBytes = hostedBlobStore.read("owner-docs", uploadPayload.document.blobKey);
    expect(storedBytes).not.toBeNull();
    expect(storedBytes!.length).toBe(PDF_MAGIC.length);
    expect(Array.from(storedBytes!)).toEqual(Array.from(PDF_MAGIC));

    const emptyWorkspaceSnapshot = createWorkspaceRecord("blobbed", {
      now: "2026-03-12T07:49:00.000Z",
      storageMode: "hosted-postgres",
      createdMessage: "Return created."
    });
    const saveResponse = await handlers.save(
      new Request("https://tax.example/api/hosted/workspaces/blobbed", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          workspace: emptyWorkspaceSnapshot
        })
      }),
      {
        workspaceId: "blobbed"
      }
    );

    expect(saveResponse.status).toBe(200);
    await expect(hostedStore.get("owner-docs", "blobbed")).resolves.toMatchObject({
      id: "blobbed"
    });
    expect(hostedBlobStore.listByWorkspace("owner-docs", "blobbed")).toEqual([]);
  });

  it("uses the registered hosted document blob store factory when postgres-s3 is selected", async () => {
    const hostedStore = createInMemoryHostedWorkspaceStore();
    const registeredBlobFactory = vi.fn(() => createInMemoryHostedDocumentBlobStore());

    registerHostedDocumentBlobStoreFactory(registeredBlobFactory);

    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND: "postgres-s3",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: " owner-doc-factory ",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_LABEL: " Blob Factory Preview "
      },
      hostedStore,
      hostedStoreFactory: () => hostedStore
    });
    const uploadFormData = new FormData();

    uploadFormData.set("documentId", "doc-factory");
    uploadFormData.set("file", new File([PDF_MAGIC], "fw2.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/factory-docs/documents", {
        method: "POST",
        body: uploadFormData
      }),
      {
        workspaceId: "factory-docs"
      }
    );

    expect(response.status).toBe(200);
    expect(registeredBlobFactory).toHaveBeenCalledWith({
      ownerId: "owner-doc-factory",
      ownerLabel: "Blob Factory Preview",
      scopeKey: "hosted-owner:owner-doc-factory"
    }, expect.objectContaining({
      hostedBackend: "postgres-s3",
      documentPersistenceMode: "hosted-s3"
    }));
    await expect(response.json()).resolves.toMatchObject({
      availability: "ready",
      ownerScope: {
        ownerId: "owner-doc-factory",
        ownerLabel: "Blob Factory Preview",
        scopeKey: "hosted-owner:owner-doc-factory"
      },
      document: {
        workspaceId: "factory-docs",
        documentId: "doc-factory",
        fileName: "fw2.pdf"
      }
    });
  });

  it("falls back to the discarding blob store when postgres-s3 is selected without an injected blob adapter", async () => {
    const hostedStore = createInMemoryHostedWorkspaceStore();
    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND: "postgres-s3",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "owner-doc-error",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_LABEL: "Blob Error Preview"
      },
      hostedStore,
      hostedStoreFactory: () => hostedStore
    });
    const uploadFormData = new FormData();

    uploadFormData.set("documentId", "doc-error");
    uploadFormData.set("file", new File([PDF_MAGIC], "fw2.pdf", {
      type: "application/pdf"
    }));

    const response = await handlers.uploadDocument(
      new Request("https://tax.example/api/hosted/workspaces/error-docs/documents", {
        method: "POST",
        body: uploadFormData
      }),
      {
        workspaceId: "error-docs"
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      availability: "ready",
      ownerScope: {
        ownerId: "owner-doc-error",
        ownerLabel: "Blob Error Preview",
        scopeKey: "hosted-owner:owner-doc-error"
      },
      document: {
        workspaceId: "error-docs",
        documentId: "doc-error",
        fileName: "fw2.pdf"
      }
    });
  });
});
