import { describe, expect, it, vi } from "vitest";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import {
  createInMemoryHostedDocumentBlobStore,
  createInMemoryHostedWorkspaceStore,
  createWorkspacePersistenceAdapter,
  deletePersistedWorkspace,
  getHostedPersistenceRuntimeConfig,
  getWorkspacePersistenceDescriptor,
  listPersistedWorkspaces,
  loadPersistedWorkspace,
  savePersistedWorkspace,
  uploadPersistedWorkspaceDocuments
} from "../../../apps/web/src/lib/workspace-persistence";
import { ensureWorkspace } from "../../../apps/web/src/lib/workspace-storage";

function createMemoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    get length() {
      return values.size;
    }
  };
}

function createWorkspaceFixture(
  workspaceId: string,
  overrides: Partial<ReturnWorkspaceRecord> = {}
): ReturnWorkspaceRecord {
  const storage = createMemoryStorage();
  const baseWorkspace = ensureWorkspace(storage, workspaceId);

  return {
    ...baseWorkspace,
    ...overrides,
    id: workspaceId
  };
}

function createUploadableFile(
  name: string,
  contents: string,
  type = "application/pdf"
) {
  const bytes = new TextEncoder().encode(contents);

  return {
    name,
    size: bytes.length,
    type,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  };
}

describe("workspace persistence", () => {
  it("describes self-host persistence as browser-local and bypassed from hosted ownership", () => {
    const descriptor = getWorkspacePersistenceDescriptor({
      TAX_ENGINE_DEPLOYMENT_MODE: "self-host"
    });

    expect(descriptor).toMatchObject({
      deploymentMode: "self-host",
      adapterKind: "local-browser",
      workspaceStorageMode: "local-browser",
      documentPersistenceMode: "browser-local-metadata",
      requiresOwnerScope: false
    });
    expect(descriptor.summary).toContain("Local mode");
    expect(descriptor.statusNotes).toContain(
      "No sign-in or account is needed in local mode."
    );
  });

  it("describes hosted persistence as a privacy-first hosted storage boundary", () => {
    const descriptor = getWorkspacePersistenceDescriptor({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted"
    });

    expect(descriptor).toMatchObject({
      deploymentMode: "hosted",
      adapterKind: "hosted-postgres",
      workspaceStorageMode: "hosted-postgres",
      documentPersistenceMode: "hosted-s3",
      requiresOwnerScope: true
    });
    expect(descriptor.summary).toContain("workspace shells");
    expect(descriptor.statusNotes).toContain(
      "Sign-in is required before returns can be loaded or saved."
    );
  });

  it("defaults hosted runtime config to the preview-memory adapter boundary", () => {
    const config = getHostedPersistenceRuntimeConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted"
    });

    expect(config.hostedBackend).toBe("preview-memory");
    expect(config.usesPreviewStore).toBe(true);
    expect(config.externalAdapterConfigured).toBe(false);
    expect(config.statusNotes).toContain(
      "Preview mode uses temporary in-memory storage until the server is fully configured."
    );
  });

  it("switches hosted runtime config to the postgres-s3 adapter boundary when configured", () => {
    const config = getHostedPersistenceRuntimeConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND: "postgres-s3"
    });

    expect(config.hostedBackend).toBe("postgres-s3");
    expect(config.usesPreviewStore).toBe(false);
    expect(config.externalAdapterConfigured).toBe(true);
    expect(config.summary).toContain("privacy-safe workspace shells");
  });

  it("blocks hosted production when durable persistence is not configured", () => {
    const config = getHostedPersistenceRuntimeConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      NODE_ENV: "production"
    });

    expect(config.blocked).toBe(true);
    expect(config.hostedBackend).toBeNull();
    expect(config.statusNotes).toContain(
      "Set TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND=postgres-s3 before publishing hosted returns."
    );
  });

  it("keeps self-host adapter operations on browser storage and never touches the hosted store", async () => {
    const browserStorage = createMemoryStorage();
    const hostedStore = createInMemoryHostedWorkspaceStore();
    const hostedSaveSpy = vi.spyOn(hostedStore, "save");
    const hostedListSpy = vi.spyOn(hostedStore, "listByOwner");
    const hostedGetSpy = vi.spyOn(hostedStore, "get");
    const hostedDeleteSpy = vi.spyOn(hostedStore, "delete");
    const adapter = await createWorkspacePersistenceAdapter({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host"
      },
      browserStorage,
      hostedStore,
      actor: {
        id: "owner-1",
        label: "Ada Preview"
      }
    });

    const savedWorkspace = await adapter.saveWorkspace(
      createWorkspaceFixture("self-host-draft", {
        updatedAt: "2026-03-12T07:20:00.000Z"
      })
    );

    expect(savedWorkspace.storageMode).toBe("local-browser");
    expect((await adapter.getWorkspace("self-host-draft"))?.id).toBe("self-host-draft");
    expect((await adapter.listWorkspaces()).map((workspace) => workspace.id)).toEqual(["self-host-draft"]);

    await adapter.deleteWorkspace("self-host-draft");

    expect(await adapter.listWorkspaces()).toEqual([]);
    expect(hostedSaveSpy).not.toHaveBeenCalled();
    expect(hostedListSpy).not.toHaveBeenCalled();
    expect(hostedGetSpy).not.toHaveBeenCalled();
    expect(hostedDeleteSpy).not.toHaveBeenCalled();
  });

  it("requires an authenticated owner before hosted persistence becomes writable", async () => {
    const adapter = await createWorkspacePersistenceAdapter({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted"
      }
    });

    expect(adapter.availability).toBe("owner-required");
    expect(adapter.ownerScope).toBeNull();
    await expect(adapter.listWorkspaces()).resolves.toEqual([]);
    await expect(adapter.getWorkspace("missing")).resolves.toBeNull();
    await expect(adapter.saveWorkspace(createWorkspaceFixture("hosted-draft"))).rejects.toThrow(
      "Please sign in to save your return."
    );
  });

  it("uses the preview-memory store by default for authenticated hosted previews", async () => {
    const workspaceId = "preview-default-store";
    const adapter = await createWorkspacePersistenceAdapter({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted"
      },
      actor: {
        id: "owner-preview",
        label: "Preview Owner"
      }
    });

    const savedWorkspace = await adapter.saveWorkspace(createWorkspaceFixture(workspaceId));
    const secondAdapter = await createWorkspacePersistenceAdapter({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted"
      },
      actor: {
        id: "owner-preview",
        label: "Preview Owner"
      }
    });

    expect(savedWorkspace.storageMode).toBe("hosted-postgres");
    expect((await secondAdapter.getWorkspace(workspaceId))?.id).toBe(workspaceId);
  });

  it("passes normalized owner scope into the hosted store factory", async () => {
    const hostedStore = createInMemoryHostedWorkspaceStore();
    const hostedStoreFactory = vi.fn(() => hostedStore);
    const adapter = await createWorkspacePersistenceAdapter({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND: "postgres-s3"
      },
      hostedStoreFactory,
      actor: {
        id: " owner-factory ",
        label: " Owner Factory "
      }
    });

    await adapter.saveWorkspace(createWorkspaceFixture("factory-workspace"));

    expect(hostedStoreFactory).toHaveBeenCalledTimes(1);
    expect(hostedStoreFactory).toHaveBeenCalledWith({
      ownerId: "owner-factory",
      ownerLabel: "Owner Factory",
      scopeKey: "hosted-owner:owner-factory"
    }, expect.objectContaining({
      hostedBackend: "postgres-s3",
      workspaceStorageMode: "hosted-postgres",
      documentPersistenceMode: "hosted-s3"
    }));
  });

  it("requires the server layer to provide a postgres-backed hosted store when postgres-s3 is selected", async () => {
    await expect(createWorkspacePersistenceAdapter({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND: "postgres-s3"
      },
      actor: {
        id: "owner-missing-adapter"
      }
    })).rejects.toThrow(
      "Server configuration error: hosted postgres persistence requires a registered workspace store factory."
    );
  });

  it("fails closed in hosted production instead of falling back to preview-memory persistence", async () => {
    await expect(createWorkspacePersistenceAdapter({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        NODE_ENV: "production"
      },
      actor: {
        id: "owner-production"
      }
    })).rejects.toThrow(
      "Hosted workspace persistence is unavailable. Configure TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND=postgres-s3 before creating hosted returns."
    );
  });

  it("keeps hosted lookups from reading or creating anonymous browser-local drafts", async () => {
    const browserStorage = createMemoryStorage();

    ensureWorkspace(browserStorage, "hosted-preview-draft");

    const hostedLookup = await loadPersistedWorkspace({
      deploymentMode: "hosted",
      browserStorage,
      workspaceId: "hosted-preview-draft",
      createIfMissing: true,
      fetchFn: async () =>
        new Response(JSON.stringify({
          availability: "owner-required",
          ownerScope: null,
          workspace: null,
          workspaces: []
        }), {
          status: 401,
          headers: {
            "content-type": "application/json"
          }
        })
    });
    const hostedListing = await listPersistedWorkspaces({
      deploymentMode: "hosted",
      browserStorage,
      fetchFn: async () =>
        new Response(JSON.stringify({
          availability: "owner-required",
          ownerScope: null,
          workspace: null,
          workspaces: []
        }), {
          status: 401,
          headers: {
            "content-type": "application/json"
          }
        })
    });

    expect(hostedLookup.adapter.availability).toBe("owner-required");
    expect(hostedLookup.workspace).toBeNull();
    expect(hostedListing.adapter.availability).toBe("owner-required");
    expect(hostedListing.workspaces).toEqual([]);
  });

  it("keeps self-host async persistence on browser storage and bypasses hosted fetch calls", async () => {
    const browserStorage = createMemoryStorage();
    const hostedFetch = vi.fn<typeof fetch>();

    await loadPersistedWorkspace({
      deploymentMode: "self-host",
      browserStorage,
      workspaceId: "self-host-created",
      createIfMissing: true,
      fetchFn: hostedFetch
    });
    await listPersistedWorkspaces({
      deploymentMode: "self-host",
      browserStorage,
      fetchFn: hostedFetch
    });
    await deletePersistedWorkspace({
      deploymentMode: "self-host",
      browserStorage,
      workspaceId: "self-host-created",
      fetchFn: hostedFetch
    });

    expect(hostedFetch).not.toHaveBeenCalled();
  });

  it("surfaces structured hosted workspace route errors instead of collapsing them to a generic status", async () => {
    await expect(savePersistedWorkspace({
      deploymentMode: "hosted",
      workspace: createWorkspaceFixture("hosted-save-error", {
        storageMode: "hosted-postgres",
        updatedAt: "2026-03-12T08:05:00.000Z"
      }),
      fetchFn: async () =>
        new Response(JSON.stringify({
          error: "Server configuration error: the cloud storage backend is not fully set up. Please contact the administrator."
        }), {
          status: 503,
          headers: {
            "content-type": "application/json"
          }
        })
    })).rejects.toThrow(
      "Server configuration error: the cloud storage backend is not fully set up. Please contact the administrator."
    );
  });

  it("keeps self-host document uploads local and bypasses hosted fetch calls", async () => {
    const hostedFetch = vi.fn<typeof fetch>();

    const result = await uploadPersistedWorkspaceDocuments({
      deploymentMode: "self-host",
      workspaceId: "self-host-upload",
      uploads: [
        {
          documentId: "doc-self-host",
          file: createUploadableFile("fw2.pdf", "local-only")
        }
      ],
      fetchFn: hostedFetch
    });

    expect(result.documents).toEqual([]);
    expect(hostedFetch).not.toHaveBeenCalled();
  });

  it("surfaces structured hosted document route errors instead of collapsing them to a generic status", async () => {
    await expect(uploadPersistedWorkspaceDocuments({
      deploymentMode: "hosted",
      workspaceId: "hosted-upload-error",
      uploads: [
        {
          documentId: "doc-error",
          file: createUploadableFile("fw2.pdf", "blob-error")
        }
      ],
      fetchFn: async () =>
        new Response(JSON.stringify({
          error: "Server configuration error: the document storage backend is not fully set up. Please contact the administrator."
        }), {
          status: 503,
          headers: {
            "content-type": "application/json"
          }
        })
    })).rejects.toThrow(
      "Server configuration error: the document storage backend is not fully set up. Please contact the administrator."
    );
  });

  it("saves hosted workspace snapshots through the hosted route boundary", async () => {
    const hostedFetch = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe("/api/hosted/workspaces/hosted-save");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({
        "content-type": "application/json"
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        workspace: {
          ...hostedWorkspace,
          storageMode: "hosted-postgres",
          auditTrail: hostedWorkspace.auditTrail.map((event) => ({ ...event, message: "Workspace created." }))
        }
      });

      return new Response(JSON.stringify({
        availability: "ready",
        ownerScope: {
          ownerId: "owner-hosted",
          ownerLabel: "Hosted Owner",
          scopeKey: "hosted-owner:owner-hosted"
        },
        workspace: {
          ...hostedWorkspace,
          storageMode: "hosted-postgres"
        },
        workspaces: []
      }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    });
    const hostedWorkspace = createWorkspaceFixture("hosted-save", {
      storageMode: "hosted-postgres",
      updatedAt: "2026-03-12T07:44:00.000Z"
    });

    const { adapter, workspace } = await savePersistedWorkspace({
      deploymentMode: "hosted",
      workspace: hostedWorkspace,
      fetchFn: hostedFetch
    });

    expect(adapter.availability).toBe("ready");
    expect(adapter.ownerScope).toEqual({
      ownerId: "owner-hosted",
      ownerLabel: "Hosted Owner",
      scopeKey: "hosted-owner:owner-hosted"
    });
    expect(workspace).toEqual({
      ...hostedWorkspace,
      storageMode: "hosted-postgres"
    });
    expect(hostedFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps self-host workspace snapshot saves on browser storage and bypasses hosted fetch calls", async () => {
    const browserStorage = createMemoryStorage();
    const hostedFetch = vi.fn<typeof fetch>();
    const workspace = createWorkspaceFixture("self-host-save", {
      updatedAt: "2026-03-12T07:45:00.000Z"
    });

    const result = await savePersistedWorkspace({
      deploymentMode: "self-host",
      browserStorage,
      workspace,
      fetchFn: hostedFetch
    });

    expect(result.workspace.storageMode).toBe("local-browser");
    expect(result.workspace.id).toBe("self-host-save");
    expect(hostedFetch).not.toHaveBeenCalled();
  });

  it("uploads hosted document blobs through the hosted route boundary", async () => {
    const hostedFetch = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe("/api/hosted/workspaces/hosted-documents/documents");
      expect(init?.method).toBe("POST");

      const request = new Request("https://tax.example/api/hosted/workspaces/hosted-documents/documents", {
        method: init?.method,
        body: init?.body
      });
      const formData = await request.formData();
      const file = formData.get("file");

      expect(formData.get("documentId")).toBe("doc-1");
      expect(formData.get("uploadedAt")).toBe("2026-03-12T07:46:00.000Z");
      expect(file).toBeInstanceOf(File);
      expect((file as File).name).toBe("fw2.pdf");
      expect(await (file as File).text()).toBe("hosted-bytes");

      return new Response(JSON.stringify({
        availability: "ready",
        ownerScope: {
          ownerId: "owner-hosted",
          ownerLabel: "Hosted Owner",
          scopeKey: "hosted-owner:owner-hosted"
        },
        document: {
          blobKey: "hosted/owner-hosted/workspaces/hosted-documents/doc-1/fw2.pdf",
          workspaceId: "hosted-documents",
          documentId: "doc-1",
          fileName: "fw2.pdf",
          mediaType: "application/pdf",
          size: 12,
          uploadedAt: "2026-03-12T07:46:00.000Z"
        }
      }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    });

    const result = await uploadPersistedWorkspaceDocuments({
      deploymentMode: "hosted",
      workspaceId: "hosted-documents",
      uploads: [
        {
          documentId: "doc-1",
          uploadedAt: "2026-03-12T07:46:00.000Z",
          file: createUploadableFile("fw2.pdf", "hosted-bytes")
        }
      ],
      fetchFn: hostedFetch
    });

    expect(result.adapter.availability).toBe("ready");
    expect(result.adapter.ownerScope).toEqual({
      ownerId: "owner-hosted",
      ownerLabel: "Hosted Owner",
      scopeKey: "hosted-owner:owner-hosted"
    });
    expect(result.documents).toEqual([
      {
        blobKey: "hosted/owner-hosted/workspaces/hosted-documents/doc-1/fw2.pdf",
        workspaceId: "hosted-documents",
        documentId: "doc-1",
        fileName: "fw2.pdf",
        mediaType: "application/pdf",
        size: 12,
        uploadedAt: "2026-03-12T07:46:00.000Z"
      }
    ]);
    expect(hostedFetch).toHaveBeenCalledTimes(1);
  });

  it("scopes hosted workspaces by owner and normalizes records to hosted-postgres storage", async () => {
    const hostedStore = createInMemoryHostedWorkspaceStore();
    const adaAdapter = await createWorkspacePersistenceAdapter({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted"
      },
      hostedStore,
      actor: {
        id: " owner-ada ",
        label: " Ada Lovelace "
      }
    });
    const graceAdapter = await createWorkspacePersistenceAdapter({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted"
      },
      hostedStore,
      actor: {
        id: "owner-grace",
        label: "Grace Hopper"
      }
    });

    const adaWorkspace = await adaAdapter.saveWorkspace(
      createWorkspaceFixture("shared-workspace", {
        updatedAt: "2026-03-12T07:21:00.000Z"
      })
    );
    const graceWorkspace = await graceAdapter.saveWorkspace(
      createWorkspaceFixture("shared-workspace", {
        updatedAt: "2026-03-12T07:22:00.000Z"
      })
    );

    expect(adaAdapter.availability).toBe("ready");
    expect(adaAdapter.ownerScope).toEqual({
      ownerId: "owner-ada",
      ownerLabel: "Ada Lovelace",
      scopeKey: "hosted-owner:owner-ada"
    });
    expect(adaWorkspace.storageMode).toBe("hosted-postgres");
    expect(graceWorkspace.storageMode).toBe("hosted-postgres");
    await expect(adaAdapter.listWorkspaces()).resolves.toEqual([adaWorkspace]);
    await expect(graceAdapter.listWorkspaces()).resolves.toEqual([graceWorkspace]);

    await adaAdapter.deleteWorkspace("shared-workspace");

    await expect(adaAdapter.listWorkspaces()).resolves.toEqual([]);
    await expect(graceAdapter.listWorkspaces()).resolves.toEqual([graceWorkspace]);
  });

  it("scopes hosted document blobs by owner and prunes orphaned records", () => {
    const hostedBlobStore = createInMemoryHostedDocumentBlobStore();
    const adaBlob = hostedBlobStore.save("owner-ada", {
      workspaceId: "shared-workspace",
      documentId: "doc-1",
      fileName: "fw2.pdf",
      mediaType: "application/pdf",
      size: 4,
      uploadedAt: "2026-03-12T07:47:00.000Z",
      bytes: new TextEncoder().encode("ada1")
    });
    const graceBlob = hostedBlobStore.save("owner-grace", {
      workspaceId: "shared-workspace",
      documentId: "doc-1",
      fileName: "fw2.pdf",
      mediaType: "application/pdf",
      size: 6,
      uploadedAt: "2026-03-12T07:47:30.000Z",
      bytes: new TextEncoder().encode("grace1")
    });

    expect(hostedBlobStore.listByWorkspace("owner-ada", "shared-workspace")).toEqual([adaBlob]);
    expect(hostedBlobStore.listByWorkspace("owner-grace", "shared-workspace")).toEqual([graceBlob]);
    expect(
      new TextDecoder().decode(hostedBlobStore.read("owner-ada", adaBlob.blobKey) ?? new Uint8Array())
    ).toBe("ada1");

    hostedBlobStore.reconcileWorkspace("owner-ada", "shared-workspace", []);

    expect(hostedBlobStore.listByWorkspace("owner-ada", "shared-workspace")).toEqual([]);
    expect(hostedBlobStore.listByWorkspace("owner-grace", "shared-workspace")).toEqual([graceBlob]);
  });
});
