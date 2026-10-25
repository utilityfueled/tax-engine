import type {
  ReturnWorkspaceRecord,
  WorkspaceDeploymentMode,
  WorkspaceStorageMode
} from "@tax-engine/contracts";
import { resolveDeploymentMode } from "./deployment-mode";
import { isHostedProductionEnvironment } from "./hosted-runtime-safety";
import { deleteCachedWorkspaceDocumentFiles } from "./workspace-document-file-cache";
import { isLocalRecoveryWorkspace } from "./workspace-local-recovery";

type PersistenceEnvironment = Record<string, string | undefined>;
type PersistenceFetch = typeof fetch;

export type WorkspaceDocumentPersistenceMode =
  | "browser-local-metadata"
  | "hosted-s3";

export type WorkspacePersistenceAdapterKind =
  | "local-browser"
  | "hosted-postgres";

export type HostedPersistenceBackend =
  | "preview-memory"
  | "postgres-s3";

export interface WorkspacePersistenceDescriptor {
  deploymentMode: WorkspaceDeploymentMode;
  adapterKind: WorkspacePersistenceAdapterKind;
  workspaceStorageMode: WorkspaceStorageMode;
  documentPersistenceMode: WorkspaceDocumentPersistenceMode;
  requiresOwnerScope: boolean;
  summary: string;
  statusNotes: string[];
}

export interface HostedPersistenceRuntimeConfig extends WorkspacePersistenceDescriptor {
  hostedBackend: HostedPersistenceBackend | null;
  usesPreviewStore: boolean;
  externalAdapterConfigured: boolean;
  blocked: boolean;
}

export interface HostedWorkspaceActor {
  id: string;
  label?: string | null;
  email?: string | null;
}

export interface WorkspaceOwnerScope {
  ownerId: string;
  ownerLabel: string | null;
  scopeKey: string;
}

export interface HostedWorkspaceStoreSeedRecord {
  ownerId: string;
  workspace: ReturnWorkspaceRecord;
}

export interface HostedWorkspaceStore {
  get(ownerId: string, workspaceId: string): Promise<ReturnWorkspaceRecord | null>;
  listByOwner(ownerId: string): Promise<ReturnWorkspaceRecord[]>;
  save(ownerId: string, workspace: ReturnWorkspaceRecord): Promise<ReturnWorkspaceRecord>;
  delete(ownerId: string, workspaceId: string): Promise<ReturnWorkspaceRecord[]>;
}

export type HostedWorkspaceStoreFactory = (
  ownerScope: WorkspaceOwnerScope,
  config: HostedPersistenceRuntimeConfig
) => HostedWorkspaceStore;

export interface HostedDocumentBlobRecord {
  blobKey: string;
  workspaceId: string;
  documentId: string;
  fileName: string;
  mediaType: string;
  size: number;
  uploadedAt: string;
}

interface HostedDocumentBlobData extends HostedDocumentBlobRecord {
  bytes: Uint8Array;
}

export interface HostedDocumentBlobInput {
  workspaceId: string;
  documentId: string;
  fileName: string;
  mediaType: string;
  size: number;
  uploadedAt: string;
  bytes: Uint8Array;
}

export interface HostedDocumentBlobStore {
  get(ownerId: string, blobKey: string): HostedDocumentBlobRecord | null;
  read(ownerId: string, blobKey: string): Uint8Array | null;
  listByWorkspace(ownerId: string, workspaceId: string): HostedDocumentBlobRecord[];
  save(ownerId: string, blob: HostedDocumentBlobInput): HostedDocumentBlobRecord;
  reconcileWorkspace(
    ownerId: string,
    workspaceId: string,
    retainedBlobKeys: string[]
  ): HostedDocumentBlobRecord[];
  deleteWorkspace(ownerId: string, workspaceId: string): HostedDocumentBlobRecord[];
}

export type HostedDocumentBlobStoreFactory = (
  ownerScope: WorkspaceOwnerScope,
  config: HostedPersistenceRuntimeConfig
) => HostedDocumentBlobStore;

export type WorkspacePersistenceAvailability =
  | "ready"
  | "owner-required";

export interface WorkspacePersistenceAdapter {
  descriptor: WorkspacePersistenceDescriptor;
  availability: WorkspacePersistenceAvailability;
  ownerScope: WorkspaceOwnerScope | null;
  getWorkspace(workspaceId: string): Promise<ReturnWorkspaceRecord | null>;
  listWorkspaces(): Promise<ReturnWorkspaceRecord[]>;
  saveWorkspace(workspace: ReturnWorkspaceRecord): Promise<ReturnWorkspaceRecord>;
  deleteWorkspace(workspaceId: string): Promise<ReturnWorkspaceRecord[]>;
}

function sortByUpdatedAtDescending(workspaces: ReturnWorkspaceRecord[]) {
  return [...workspaces].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function listLocalRecoveries(storage?: Storage) {
  if (!storage) return [];
  const { listWorkspaces } = await import("./workspace-storage");
  return listWorkspaces(storage).filter((workspace) => isLocalRecoveryWorkspace(storage, workspace.id));
}

function mergeLocalRecoveries(hosted: ReturnWorkspaceRecord[], local: ReturnWorkspaceRecord[]) {
  return sortByUpdatedAtDescending([...hosted.filter((workspace) => !local.some((entry) => entry.id === workspace.id)), ...local]);
}

function normalizeHostedWorkspace(workspace: ReturnWorkspaceRecord): ReturnWorkspaceRecord {
  return {
    ...workspace,
    storageMode: "hosted-postgres"
  };
}

class InMemoryHostedWorkspaceStore implements HostedWorkspaceStore {
  readonly #workspacesByOwner = new Map<string, Map<string, ReturnWorkspaceRecord>>();

  constructor(initialRecords: HostedWorkspaceStoreSeedRecord[] = []) {
    for (const record of initialRecords) {
      this.save(record.ownerId, record.workspace);
    }
  }

  async get(ownerId: string, workspaceId: string) {
    return this.#workspacesByOwner.get(ownerId)?.get(workspaceId) ?? null;
  }

  async listByOwner(ownerId: string) {
    return sortByUpdatedAtDescending(
      Array.from(this.#workspacesByOwner.get(ownerId)?.values() ?? [])
    );
  }

  async save(ownerId: string, workspace: ReturnWorkspaceRecord) {
    const normalizedWorkspace = normalizeHostedWorkspace(workspace);
    const ownerMap = this.#workspacesByOwner.get(ownerId) ?? new Map<string, ReturnWorkspaceRecord>();

    ownerMap.set(normalizedWorkspace.id, normalizedWorkspace);
    this.#workspacesByOwner.set(ownerId, ownerMap);
    return normalizedWorkspace;
  }

  async delete(ownerId: string, workspaceId: string) {
    const ownerMap = this.#workspacesByOwner.get(ownerId);

    if (!ownerMap) {
      return [];
    }

    ownerMap.delete(workspaceId);

    if (ownerMap.size === 0) {
      this.#workspacesByOwner.delete(ownerId);
      return [];
    }

    this.#workspacesByOwner.set(ownerId, ownerMap);
    return sortByUpdatedAtDescending(Array.from(ownerMap.values()));
  }
}

function sortBlobRecordsByUploadedAtDescending(records: HostedDocumentBlobRecord[]) {
  return [...records].sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
}

function sanitizeBlobKeySegment(value: string) {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || "document";
}

function buildHostedBlobKey(ownerId: string, blob: HostedDocumentBlobInput) {
  return [
    "hosted",
    sanitizeBlobKeySegment(ownerId),
    "workspaces",
    sanitizeBlobKeySegment(blob.workspaceId),
    sanitizeBlobKeySegment(blob.documentId),
    sanitizeBlobKeySegment(blob.fileName)
  ].join("/");
}

function stripBlobBytes(blob: HostedDocumentBlobData): HostedDocumentBlobRecord {
  const { bytes: _bytes, ...record } = blob;
  return record;
}

class InMemoryHostedDocumentBlobStore implements HostedDocumentBlobStore {
  readonly #blobsByOwner = new Map<string, Map<string, HostedDocumentBlobData>>();

  get(ownerId: string, blobKey: string) {
    const blob = this.#blobsByOwner.get(ownerId)?.get(blobKey) ?? null;
    return blob ? stripBlobBytes(blob) : null;
  }

  read(ownerId: string, blobKey: string) {
    const bytes = this.#blobsByOwner.get(ownerId)?.get(blobKey)?.bytes ?? null;
    return bytes ? new Uint8Array(bytes) : null;
  }

  listByWorkspace(ownerId: string, workspaceId: string) {
    return sortBlobRecordsByUploadedAtDescending(
      Array.from(this.#blobsByOwner.get(ownerId)?.values() ?? [])
        .filter((blob) => blob.workspaceId === workspaceId)
        .map((blob) => stripBlobBytes(blob))
    );
  }

  save(ownerId: string, blob: HostedDocumentBlobInput) {
    const blobKey = buildHostedBlobKey(ownerId, blob);
    const ownerMap = this.#blobsByOwner.get(ownerId) ?? new Map<string, HostedDocumentBlobData>();
    const storedBlob: HostedDocumentBlobData = {
      blobKey,
      workspaceId: blob.workspaceId,
      documentId: blob.documentId,
      fileName: blob.fileName,
      mediaType: blob.mediaType,
      size: blob.size,
      uploadedAt: blob.uploadedAt,
      bytes: new Uint8Array(blob.bytes)
    };

    ownerMap.set(blobKey, storedBlob);
    this.#blobsByOwner.set(ownerId, ownerMap);
    return stripBlobBytes(storedBlob);
  }

  reconcileWorkspace(ownerId: string, workspaceId: string, retainedBlobKeys: string[]) {
    const ownerMap = this.#blobsByOwner.get(ownerId);

    if (!ownerMap) {
      return [];
    }

    const retainedBlobKeySet = new Set(retainedBlobKeys);

    for (const [blobKey, blob] of ownerMap.entries()) {
      if (blob.workspaceId === workspaceId && !retainedBlobKeySet.has(blobKey)) {
        ownerMap.delete(blobKey);
      }
    }

    if (ownerMap.size === 0) {
      this.#blobsByOwner.delete(ownerId);
      return [];
    }

    this.#blobsByOwner.set(ownerId, ownerMap);
    return this.listByWorkspace(ownerId, workspaceId);
  }

  deleteWorkspace(ownerId: string, workspaceId: string) {
    return this.reconcileWorkspace(ownerId, workspaceId, []);
  }
}

class DiscardingHostedDocumentBlobStore implements HostedDocumentBlobStore {
  get(_ownerId: string, _blobKey: string) {
    return null;
  }

  read(_ownerId: string, _blobKey: string) {
    return null;
  }

  listByWorkspace(_ownerId: string, _workspaceId: string) {
    return [];
  }

  save(ownerId: string, blob: HostedDocumentBlobInput) {
    return {
      blobKey: `${buildHostedBlobKey(ownerId, blob)}-${Date.now()}`,
      workspaceId: blob.workspaceId,
      documentId: blob.documentId,
      fileName: blob.fileName,
      mediaType: blob.mediaType,
      size: blob.size,
      uploadedAt: blob.uploadedAt
    };
  }

  reconcileWorkspace(_ownerId: string, _workspaceId: string, _retainedBlobKeys: string[]) {
    return [];
  }

  deleteWorkspace(_ownerId: string, _workspaceId: string) {
    return [];
  }
}

function requireBrowserStorage(storage: Storage | undefined) {
  if (!storage) {
    throw new Error("Local browser storage is required for the self-host workspace adapter.");
  }

  return storage;
}

export function getHostedPersistenceRuntimeConfig(
  env: PersistenceEnvironment = process.env
): HostedPersistenceRuntimeConfig {
  const deploymentMode = resolveDeploymentMode(env);
  const configuredHostedBackend = env.TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND?.trim().toLowerCase();
  const hostedProduction = isHostedProductionEnvironment(env);

  if (deploymentMode === "hosted") {
    if (hostedProduction && configuredHostedBackend !== "postgres-s3") {
      console.error(
        "[security] CRITICAL: TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND must be set to postgres-s3 in hosted production mode. " +
        "Preview-memory persistence is not safe for published hosted returns."
      );

      return {
        deploymentMode,
        hostedBackend: null,
        usesPreviewStore: false,
        externalAdapterConfigured: false,
        blocked: true,
        adapterKind: "hosted-postgres",
        workspaceStorageMode: "hosted-postgres",
        documentPersistenceMode: "hosted-s3",
        requiresOwnerScope: true,
        summary: "Cloud mode requires durable hosted workspace storage before returns can be created.",
        statusNotes: [
          "Hosted workspace storage is unavailable until a durable backend is configured.",
          "Set TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND=postgres-s3 before publishing hosted returns.",
          "Raw uploaded forms are still processed transiently and are not stored in durable server storage.",
          "Sign-in alone is not enough until durable workspace storage is enabled."
        ]
      };
    }

    const hostedBackend = configuredHostedBackend === "postgres-s3"
      ? "postgres-s3"
      : "preview-memory";

    return {
      deploymentMode,
      hostedBackend,
      usesPreviewStore: hostedBackend === "preview-memory",
      externalAdapterConfigured: hostedBackend === "postgres-s3",
      blocked: false,
      adapterKind: "hosted-postgres",
      workspaceStorageMode: "hosted-postgres",
      documentPersistenceMode: "hosted-s3",
      requiresOwnerScope: true,
      summary: hostedBackend === "postgres-s3"
        ? "Cloud mode stores billing, account data, and privacy-safe workspace shells while keeping raw uploads out of durable server storage."
        : "Cloud mode stores billing, account data, and preview workspace shells while keeping raw uploads out of durable server storage.",
      statusNotes: hostedBackend === "postgres-s3"
        ? [
            "Workspace shells and progress markers are saved to a cloud database.",
            "Raw uploaded forms are processed transiently and are not stored in durable server storage.",
            "The server must be fully configured before hosted billing and workspace shells can be saved.",
            "Sign-in is required before returns can be loaded or saved."
          ]
        : [
            "Workspace shells and progress markers are saved to a cloud database.",
            "Raw uploaded forms are processed transiently and are not stored in durable server storage.",
            "Preview mode uses temporary in-memory storage until the server is fully configured.",
            "Sign-in is required before returns can be loaded or saved."
          ]
    };
  }

  return {
    deploymentMode,
    hostedBackend: null,
    usesPreviewStore: false,
    externalAdapterConfigured: false,
    blocked: false,
    adapterKind: "local-browser",
    workspaceStorageMode: "local-browser",
    documentPersistenceMode: "browser-local-metadata",
    requiresOwnerScope: false,
    summary: "Local mode saves returns in your browser by default.",
    statusNotes: [
      "Returns are saved in your browser's local storage on this device.",
      "Uploaded document data stays on this device unless you invoke an optional AI feature.",
      "No sign-in or account is needed in local mode."
    ]
  };
}

export function getWorkspacePersistenceDescriptor(
  env: PersistenceEnvironment = process.env
): WorkspacePersistenceDescriptor {
  const {
    hostedBackend: _hostedBackend,
    usesPreviewStore: _usesPreviewStore,
    externalAdapterConfigured: _externalAdapterConfigured,
    blocked: _blocked,
    ...descriptor
  } = getHostedPersistenceRuntimeConfig(env);

  return descriptor;
}

export function resolveWorkspaceOwnerScope(
  deploymentMode: WorkspaceDeploymentMode,
  actor: HostedWorkspaceActor | null | undefined
): WorkspaceOwnerScope | null {
  if (deploymentMode === "self-host") {
    return null;
  }

  const ownerId = actor?.id.trim();

  if (!ownerId) {
    return null;
  }

  const ownerLabel = actor?.label?.trim() || null;

  return {
    ownerId,
    ownerLabel,
    scopeKey: `hosted-owner:${ownerId}`
  };
}

export function createInMemoryHostedWorkspaceStore(
  initialRecords: HostedWorkspaceStoreSeedRecord[] = []
): HostedWorkspaceStore {
  return new InMemoryHostedWorkspaceStore(initialRecords);
}

export function getPreviewHostedWorkspaceStore(): HostedWorkspaceStore {
  const globalStore = globalThis as typeof globalThis & {
    __tax_engine_hosted_preview_store__?: HostedWorkspaceStore;
  };

  if (!globalStore.__tax_engine_hosted_preview_store__) {
    globalStore.__tax_engine_hosted_preview_store__ = createInMemoryHostedWorkspaceStore();
  }

  return globalStore.__tax_engine_hosted_preview_store__;
}

export function createInMemoryHostedDocumentBlobStore(): HostedDocumentBlobStore {
  return new InMemoryHostedDocumentBlobStore();
}

export function getPreviewHostedDocumentBlobStore(): HostedDocumentBlobStore {
  const globalStore = globalThis as typeof globalThis & {
    __tax_engine_hosted_preview_blob_store__?: HostedDocumentBlobStore;
  };

  if (!globalStore.__tax_engine_hosted_preview_blob_store__) {
    globalStore.__tax_engine_hosted_preview_blob_store__ = createInMemoryHostedDocumentBlobStore();
  }

  return globalStore.__tax_engine_hosted_preview_blob_store__;
}

interface CreateWorkspacePersistenceAdapterOptions {
  env?: PersistenceEnvironment;
  browserStorage?: Storage;
  hostedStore?: HostedWorkspaceStore;
  hostedStoreFactory?: HostedWorkspaceStoreFactory;
  hostedDocumentBlobStore?: HostedDocumentBlobStore;
  hostedDocumentBlobStoreFactory?: HostedDocumentBlobStoreFactory;
  actor?: HostedWorkspaceActor | null;
}

interface WorkspacePersistenceSessionOptions extends CreateWorkspacePersistenceAdapterOptions {
  deploymentMode: WorkspaceDeploymentMode;
}

interface WorkspacePersistenceRequestOptions extends WorkspacePersistenceSessionOptions {
  fetchFn?: PersistenceFetch;
  hostedEndpointBase?: string;
  hostedDocumentEndpointBase?: string;
}

interface LoadPersistedWorkspaceOptions extends WorkspacePersistenceRequestOptions {
  workspaceId: string;
  createIfMissing?: boolean;
}

interface DeletePersistedWorkspaceOptions extends WorkspacePersistenceRequestOptions {
  workspaceId: string;
}

interface SavePersistedWorkspaceOptions extends WorkspacePersistenceRequestOptions {
  workspace: ReturnWorkspaceRecord;
}

interface HostedWorkspacePersistenceResponse {
  availability: WorkspacePersistenceAvailability;
  ownerScope: WorkspaceOwnerScope | null;
  workspace: ReturnWorkspaceRecord | null;
  workspaces: ReturnWorkspaceRecord[];
}

interface HostedDocumentBlobPersistenceResponse {
  availability: WorkspacePersistenceAvailability;
  ownerScope: WorkspaceOwnerScope | null;
  document: HostedDocumentBlobRecord | null;
}

interface HostedPersistenceErrorResponse {
  error?: string;
}

function getHostedPersistenceErrorMessage(payload: unknown) {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) {
    return null;
  }

  const { error } = payload as HostedPersistenceErrorResponse;

  return typeof error === "string" && error.trim().length > 0
    ? error
    : null;
}

export interface PersistableWorkspaceFile {
  name: string;
  size: number;
  type?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface HostedWorkspaceDocumentUpload {
  documentId: string;
  uploadedAt?: string;
  file: PersistableWorkspaceFile;
}

function createWorkspacePersistenceSession(
  options: WorkspacePersistenceSessionOptions
): Promise<WorkspacePersistenceAdapter> {
  return createWorkspacePersistenceAdapter({
    env: {
      TAX_ENGINE_DEPLOYMENT_MODE: options.deploymentMode
    },
    browserStorage: options.browserStorage,
    hostedStore: options.hostedStore,
    actor: options.actor
  });
}

function resolveHostedWorkspaceStore(
  options: CreateWorkspacePersistenceAdapterOptions,
  ownerScope: WorkspaceOwnerScope
): HostedWorkspaceStore {
  const config = getHostedPersistenceRuntimeConfig(options.env);

  if (options.hostedStoreFactory) {
    return options.hostedStoreFactory(ownerScope, config);
  }

  if (options.hostedStore) {
    return options.hostedStore;
  }

  if (config.hostedBackend === "preview-memory") {
    return getPreviewHostedWorkspaceStore();
  }

  throw new Error(
    "Server configuration error: hosted postgres persistence requires a registered workspace store factory."
  );
}

export function resolveHostedDocumentBlobStore(
  options: CreateWorkspacePersistenceAdapterOptions,
  ownerScope: WorkspaceOwnerScope
): HostedDocumentBlobStore {
  const config = getHostedPersistenceRuntimeConfig(options.env);

  if (options.hostedDocumentBlobStoreFactory) {
    return options.hostedDocumentBlobStoreFactory(ownerScope, config);
  }

  if (options.hostedDocumentBlobStore) {
    return options.hostedDocumentBlobStore;
  }

  if (config.hostedBackend === "preview-memory") {
    return getPreviewHostedDocumentBlobStore();
  }

  return new DiscardingHostedDocumentBlobStore();
}

export async function createWorkspacePersistenceAdapter(
  options: CreateWorkspacePersistenceAdapterOptions = {}
): Promise<WorkspacePersistenceAdapter> {
  const runtimeConfig = getHostedPersistenceRuntimeConfig(options.env);
  const {
    hostedBackend: _hostedBackend,
    usesPreviewStore: _usesPreviewStore,
    externalAdapterConfigured: _externalAdapterConfigured,
    blocked,
    ...descriptor
  } = runtimeConfig;
  const ownerScope = resolveWorkspaceOwnerScope(descriptor.deploymentMode, options.actor);

  if (descriptor.deploymentMode === "self-host") {
    const {
      deleteWorkspace: deleteLocalWorkspace,
      getWorkspace: getLocalWorkspace,
      listWorkspaces: listLocalWorkspaces,
      saveWorkspaceSnapshot
    } = await import("./workspace-storage");

    return {
      descriptor,
      availability: "ready",
      ownerScope,
      async getWorkspace(workspaceId) {
        return getLocalWorkspace(requireBrowserStorage(options.browserStorage), workspaceId);
      },
      async listWorkspaces() {
        return listLocalWorkspaces(requireBrowserStorage(options.browserStorage));
      },
      async saveWorkspace(workspace) {
        return saveWorkspaceSnapshot(
          requireBrowserStorage(options.browserStorage),
          {
            ...workspace,
            storageMode: "local-browser"
          }
        );
      },
      async deleteWorkspace(workspaceId) {
        return deleteLocalWorkspace(requireBrowserStorage(options.browserStorage), workspaceId);
      }
    };
  }

  if (blocked) {
    throw new Error(
      "Hosted workspace persistence is unavailable. Configure TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND=postgres-s3 before creating hosted returns."
    );
  }

  if (!ownerScope) {
    return {
      descriptor,
      availability: "owner-required",
      ownerScope: null,
      async getWorkspace() {
        return null;
      },
      async listWorkspaces() {
        return [];
      },
      async saveWorkspace() {
        throw new Error("Please sign in to save your return.");
      },
      async deleteWorkspace() {
        return [];
      }
    };
  }

  const hostedStore = resolveHostedWorkspaceStore(options, ownerScope);

  return {
    descriptor,
    availability: "ready",
    ownerScope,
    async getWorkspace(workspaceId) {
      return hostedStore.get(ownerScope.ownerId, workspaceId);
    },
    async listWorkspaces() {
      return hostedStore.listByOwner(ownerScope.ownerId);
    },
    async saveWorkspace(workspace) {
      return hostedStore.save(ownerScope.ownerId, workspace);
    },
    async deleteWorkspace(workspaceId) {
      return hostedStore.delete(ownerScope.ownerId, workspaceId);
    }
  };
}

function createHostedTransportAdapter(
  state: Pick<HostedWorkspacePersistenceResponse, "availability" | "ownerScope">
): WorkspacePersistenceAdapter {
  const descriptor = getWorkspacePersistenceDescriptor({
    TAX_ENGINE_DEPLOYMENT_MODE: "hosted"
  });

  return {
    descriptor,
    availability: state.availability,
    ownerScope: state.ownerScope,
    async getWorkspace() {
      return null;
    },
    async listWorkspaces() {
      return [];
    },
    async saveWorkspace() {
      throw new Error("Could not save changes. Please try again.");
    },
    async deleteWorkspace() {
      return [];
    }
  };
}

function buildHostedWorkspaceEndpoint(
  options: WorkspacePersistenceRequestOptions,
  workspaceId?: string,
  createIfMissing?: boolean
) {
  const endpointBase = options.hostedEndpointBase ?? "/api/hosted/workspaces";
  const endpoint = workspaceId
    ? `${endpointBase}/${encodeURIComponent(workspaceId)}`
    : endpointBase;

  if (!createIfMissing) {
    return endpoint;
  }

  const searchParams = new URLSearchParams({
    create: "1"
  });

  return `${endpoint}?${searchParams.toString()}`;
}

function buildHostedWorkspaceDocumentEndpoint(
  options: WorkspacePersistenceRequestOptions,
  workspaceId: string
) {
  if (options.hostedDocumentEndpointBase) {
    return options.hostedDocumentEndpointBase;
  }

  const endpointBase = options.hostedEndpointBase ?? "/api/hosted/workspaces";
  return `${endpointBase}/${encodeURIComponent(workspaceId)}/documents`;
}

async function requestHostedWorkspacePersistence(
  endpoint: string,
  init: RequestInit,
  fetchFn: PersistenceFetch
) {
  const response = await fetchFn(endpoint, init);
  const payload = await response.json() as HostedWorkspacePersistenceResponse | HostedPersistenceErrorResponse;

  if (!response.ok && !(response.status === 401 && (init.method ?? "GET") === "GET")) {
    throw new Error(
      getHostedPersistenceErrorMessage(payload)
        ?? `Could not connect to the server (error ${response.status}). Please try again later.`
    );
  }

  return payload as HostedWorkspacePersistenceResponse;
}

async function requestHostedDocumentBlobPersistence(
  endpoint: string,
  init: RequestInit,
  fetchFn: PersistenceFetch
) {
  const response = await fetchFn(endpoint, init);
  const payload = await response.json() as HostedDocumentBlobPersistenceResponse | HostedPersistenceErrorResponse;

  if (!response.ok && response.status !== 401) {
    throw new Error(
      getHostedPersistenceErrorMessage(payload)
        ?? `Could not upload your document (error ${response.status}). Please try again later.`
    );
  }

  return payload as HostedDocumentBlobPersistenceResponse;
}

export async function loadPersistedWorkspace(
  options: LoadPersistedWorkspaceOptions
): Promise<{
  adapter: WorkspacePersistenceAdapter;
  workspace: ReturnWorkspaceRecord | null;
}> {
  if (options.deploymentMode === "hosted") {
    const payload = await requestHostedWorkspacePersistence(
      buildHostedWorkspaceEndpoint(options, options.workspaceId, options.createIfMissing),
      {
        method: "GET",
        headers: {
          "content-type": "application/json"
        }
      },
      options.fetchFn ?? fetch
    );

    const browserStorage = options.browserStorage;
    let workspace = payload.workspace;

    if (browserStorage && payload.availability === "ready") {
      const { getWorkspace: getLocalWorkspace } = await import("./workspace-storage");
      const localWorkspace = getLocalWorkspace(browserStorage, options.workspaceId);

      if (
        localWorkspace
        && (!workspace || new Date(localWorkspace.updatedAt).getTime() >= new Date(workspace.updatedAt).getTime())
      ) {
        workspace = localWorkspace;
      }
    }

    return {
      adapter: createHostedTransportAdapter(payload),
      workspace
    };
  }

  const adapter = await createWorkspacePersistenceSession(options);

  if (options.deploymentMode === "self-host" && options.createIfMissing) {
    const { ensureWorkspace } = await import("./workspace-storage");

    return {
      adapter,
      workspace: ensureWorkspace(requireBrowserStorage(options.browserStorage), options.workspaceId)
    };
  }

  return {
    adapter,
    workspace: await adapter.getWorkspace(options.workspaceId)
  };
}

export async function listPersistedWorkspaces(
  options: WorkspacePersistenceRequestOptions
): Promise<{
  adapter: WorkspacePersistenceAdapter;
  workspaces: ReturnWorkspaceRecord[];
  notice?: string;
}> {
  if (options.deploymentMode === "hosted") {
    const localRecoveries = await listLocalRecoveries(options.browserStorage);
    let payload: HostedWorkspacePersistenceResponse;
    try { payload = await requestHostedWorkspacePersistence(
      buildHostedWorkspaceEndpoint(options),
      {
        method: "GET",
        headers: {
          "content-type": "application/json"
        }
      },
      options.fetchFn ?? fetch
    ); } catch (error) {
      if (!localRecoveries.length) throw error;
      return { adapter: await createWorkspacePersistenceSession({ ...options, deploymentMode: "self-host" }),
        workspaces: localRecoveries, notice: "Cloud returns are unavailable. Your restored local returns remain available on this device." };
    }

    return {
      adapter: createHostedTransportAdapter(payload),
      workspaces: mergeLocalRecoveries(payload.workspaces, localRecoveries)
    };
  }

  const adapter = await createWorkspacePersistenceSession(options);

  return {
    adapter,
    workspaces: await adapter.listWorkspaces()
  };
}

export async function deletePersistedWorkspace(
  options: DeletePersistedWorkspaceOptions
): Promise<{
  adapter: WorkspacePersistenceAdapter;
  workspaces: ReturnWorkspaceRecord[];
}> {
  if (options.deploymentMode === "hosted") {
    if (options.browserStorage && isLocalRecoveryWorkspace(options.browserStorage, options.workspaceId)) {
      const deleted = await deletePersistedWorkspace({ ...options, deploymentMode: "self-host" });
      try { return await listPersistedWorkspaces(options); }
      catch { return { adapter: deleted.adapter, workspaces: await listLocalRecoveries(options.browserStorage) }; }
    }
    const payload = await requestHostedWorkspacePersistence(
      buildHostedWorkspaceEndpoint(options, options.workspaceId),
      {
        method: "DELETE",
        headers: {
          "content-type": "application/json"
        }
      },
      options.fetchFn ?? fetch
    );

    if (payload.availability !== "ready") throw new Error("Please sign in before deleting this return. The local copy has been preserved.");

    if (options.browserStorage) {
      await deleteCachedWorkspaceDocumentFiles(options.workspaceId);
      const { deleteWorkspace: deleteLocalWorkspace } = await import("./workspace-storage");
      deleteLocalWorkspace(options.browserStorage, options.workspaceId);
    }

    return {
      adapter: createHostedTransportAdapter(payload),
      workspaces: mergeLocalRecoveries(payload.workspaces, await listLocalRecoveries(options.browserStorage))
    };
  }

  const adapter = await createWorkspacePersistenceSession(options);

  await deleteCachedWorkspaceDocumentFiles(options.workspaceId);
  return {
    adapter,
    workspaces: await adapter.deleteWorkspace(options.workspaceId)
  };
}

export async function savePersistedWorkspace(
  options: SavePersistedWorkspaceOptions
): Promise<{
  adapter: WorkspacePersistenceAdapter;
  workspace: ReturnWorkspaceRecord;
}> {
  if (options.deploymentMode === "hosted") {
    const payload = await requestHostedWorkspacePersistence(
      buildHostedWorkspaceEndpoint(options, options.workspace.id),
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          workspace: options.workspace
        })
      },
      options.fetchFn ?? fetch
    );

    if (payload.availability !== "ready" || !payload.workspace) throw new Error("Could not save your return. Please sign in and try again.");

    if (options.browserStorage) {
      const { saveWorkspaceSnapshot } = await import("./workspace-storage");
      saveWorkspaceSnapshot(options.browserStorage, options.workspace);
    }

    return {
      adapter: createHostedTransportAdapter(payload),
      workspace: options.workspace
    };
  }

  const adapter = await createWorkspacePersistenceSession(options);

  return {
    adapter,
    workspace: await adapter.saveWorkspace(options.workspace)
  };
}

export async function uploadPersistedWorkspaceDocuments(
  options: WorkspacePersistenceRequestOptions & {
    workspaceId: string;
    uploads: HostedWorkspaceDocumentUpload[];
  }
): Promise<{
  adapter: WorkspacePersistenceAdapter;
  documents: HostedDocumentBlobRecord[];
}> {
  if (options.deploymentMode === "hosted") {
    const payloads = [];

    for (const upload of options.uploads) {
      const fileBytes = await upload.file.arrayBuffer();
      const formData = new FormData();
      const mediaType = upload.file.type?.trim() || "application/pdf";
      const uploadedAt = upload.uploadedAt ?? new Date().toISOString();
      const file = new File([fileBytes], upload.file.name, {
        type: mediaType
      });

      formData.set("documentId", upload.documentId);
      formData.set("uploadedAt", uploadedAt);
      formData.set("file", file);

      payloads.push(await requestHostedDocumentBlobPersistence(
        buildHostedWorkspaceDocumentEndpoint(options, options.workspaceId),
        {
          method: "POST",
          body: formData
        },
        options.fetchFn ?? fetch
      ));
    }

    const state = payloads.at(0) ?? {
      availability: "ready" as const,
      ownerScope: null
    };
    const documents = payloads.map((payload) => {
      if (!payload.document) {
        throw new Error("Hosted document upload returned no persisted document blob.");
      }

      return payload.document;
    });

    return {
      adapter: createHostedTransportAdapter(state),
      documents
    };
  }

  return {
    adapter: await createWorkspacePersistenceSession(options),
    documents: []
  };
}
