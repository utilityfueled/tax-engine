import { NextResponse } from "next/server";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import { resolveDeploymentMode } from "./deployment-mode";
import { resolveHostedWorkspaceActor } from "./hosted-auth";
import { getHostedEntitlementByOwnerId } from "./hosted-billing-db";
import {
  getRegisteredHostedDocumentBlobStoreFactory,
  getRegisteredHostedWorkspaceStoreFactory
} from "./hosted-persistence-registry";
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
import {
  createWorkspacePersistenceAdapter,
  resolveHostedDocumentBlobStore,
  type HostedDocumentBlobStore,
  type HostedDocumentBlobStoreFactory,
  type WorkspaceOwnerScope,
  type HostedWorkspaceStore,
  type HostedWorkspaceStoreFactory
} from "./workspace-persistence";
import { createHostedPostgresWorkspaceStoreFactory } from "./hosted-postgres-workspace-store";
import { createWorkspaceRecord } from "./workspace-storage";

type HostedWorkspaceRouteEnvironment = Record<string, string | undefined>;

const WORKSPACE_ID_MAX_LENGTH = 128;
const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Maximum number of documents allowed in a single workspace save payload.
 * Prevents resource exhaustion from payloads containing thousands of
 * document references that would bloat database rows and slow queries.
 */
const MAX_DOCUMENTS_PER_WORKSPACE = 500;

/**
 * Maximum number of workspaces a single user can own.
 * Prevents resource exhaustion from an attacker creating unbounded
 * workspaces to fill storage and degrade list performance.
 */
const MAX_WORKSPACES_PER_USER = 200;

function isValidWorkspaceId(workspaceId: string): boolean {
  return workspaceId.length > 0
    && workspaceId.length <= WORKSPACE_ID_MAX_LENGTH
    && WORKSPACE_ID_PATTERN.test(workspaceId);
}

interface HostedWorkspaceRouteDependencies {
  env?: HostedWorkspaceRouteEnvironment;
  hostedStore?: HostedWorkspaceStore;
  hostedStoreFactory?: HostedWorkspaceStoreFactory;
  hostedDocumentBlobStore?: HostedDocumentBlobStore;
  hostedDocumentBlobStoreFactory?: HostedDocumentBlobStoreFactory;
  now?: () => string;
  rateLimitStore?: RateLimitStore;
}

export interface HostedWorkspaceRouteContext {
  workspaceId: string;
}

function buildOwnerRequiredResponse() {
  return NextResponse.json({
    availability: "owner-required" as const,
    ownerScope: null,
    workspace: null,
    workspaces: []
  }, {
    status: 401
  });
}

function buildPlanRequiredResponse() {
  return NextResponse.json({
    error: "A hosted Starter or Plus plan is required before you can create or resume cloud returns."
  }, {
    status: 403
  });
}

function buildUnsupportedModeResponse() {
  return NextResponse.json({
    error: "Hosted workspace routes are disabled outside hosted deployment mode."
  }, {
    status: 404
  });
}

function buildRateLimitResponse(retryAfterMs: number | null) {
  const retryAfterSeconds = Math.ceil((retryAfterMs ?? rateLimitTiers.api.windowMs) / 1000);

  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) }
    }
  );
}

function buildBadRequestResponse(message: string) {
  return NextResponse.json({
    error: message
  }, {
    status: 400
  });
}

const SAFE_PERSISTENCE_ERROR_PREFIXES = [
  "Server configuration error:",
  "Please sign in",
  "Hosted workspace operations require"
] as const;

function isSafePersistenceErrorMessage(message: string): boolean {
  return SAFE_PERSISTENCE_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix));
}

function buildPersistenceUnavailableResponse(error: unknown) {
  const fallbackMessage = "The server is temporarily unavailable. Please try again later.";

  let clientMessage = fallbackMessage;

  if (error instanceof Error && isSafePersistenceErrorMessage(error.message)) {
    clientMessage = error.message;
  }

  return NextResponse.json({
    error: clientMessage
  }, {
    status: 503
  });
}

function requireOwnerScope(ownerScope: WorkspaceOwnerScope | null) {
  if (!ownerScope) {
    throw new Error("Hosted workspace operations require an authenticated owner scope.");
  }

  return ownerScope;
}

async function createHostedAdapter(
  request: Request,
  dependencies: HostedWorkspaceRouteDependencies
) {
  const env = dependencies.env ?? process.env;

  if (resolveDeploymentMode(env) !== "hosted") {
    return {
      response: buildUnsupportedModeResponse()
    } as const;
  }

  const actor = await resolveHostedWorkspaceActor({
    env,
    requestHeaders: request.headers
  });

  if (!actor) {
    return {
      response: buildOwnerRequiredResponse()
    } as const;
  }

  if (!env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID?.trim()) {
    const { entitlement } = await getHostedEntitlementByOwnerId(env, actor.id);

    if (!entitlement.workspaceAccess) {
      return {
        response: buildPlanRequiredResponse()
      } as const;
    }
  }

  const hostedStoreFactory = dependencies.hostedStoreFactory
    ?? getRegisteredHostedWorkspaceStoreFactory()
    ?? (env.TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND?.trim().toLowerCase() === "postgres-s3"
      ? createHostedPostgresWorkspaceStoreFactory(env)
      : undefined)
    ?? undefined;
  const hostedDocumentBlobStoreFactory = dependencies.hostedDocumentBlobStoreFactory
    ?? getRegisteredHostedDocumentBlobStoreFactory()
    ?? undefined;
  let adapter;

  try {
    adapter = await createWorkspacePersistenceAdapter({
      env,
      hostedStore: dependencies.hostedStore,
      hostedStoreFactory,
      actor
    });
  } catch (error) {
    return {
      response: buildPersistenceUnavailableResponse(error)
    } as const;
  }

  if (!adapter.ownerScope) {
    return {
      response: buildOwnerRequiredResponse()
    } as const;
  }

  const ownerScope = adapter.ownerScope;

  return {
    adapter,
    resolveHostedDocumentBlobStore() {
      return resolveHostedDocumentBlobStore({
        env,
        hostedDocumentBlobStore: dependencies.hostedDocumentBlobStore,
        hostedDocumentBlobStoreFactory,
        actor
      }, ownerScope);
    }
  } as const;
}

const WORKSPACE_SAVE_MAX_BODY_SIZE = 5 * 1024 * 1024; // 5 MB

async function readWorkspaceSnapshotFromRequest(
  request: Request,
  workspaceId: string
) {
  const parsed = await safeParseJsonBody(request, WORKSPACE_SAVE_MAX_BODY_SIZE);

  if (!parsed.ok) {
    return {
      response: NextResponse.json(
        { error: parsed.error },
        { status: parsed.status }
      )
    } as const;
  }

  const payload = parsed.data;

  const workspace = typeof payload === "object" && payload !== null && "workspace" in payload
    ? (payload as { workspace?: unknown }).workspace
    : null;

  if (!workspace || typeof workspace !== "object") {
    return {
      response: buildBadRequestResponse(
        "Hosted workspace saves require a workspace snapshot."
      )
    } as const;
  }

  const candidate = workspace as Record<string, unknown>;

  if (candidate.id !== workspaceId) {
    return {
      response: buildBadRequestResponse(
        "Hosted workspace save payload id must match the route workspace id."
      )
    } as const;
  }

  if (!Array.isArray(candidate.documents)) {
    return {
      response: buildBadRequestResponse(
        "Hosted workspace save payload must include a documents array."
      )
    } as const;
  }

  if (candidate.documents.length > MAX_DOCUMENTS_PER_WORKSPACE) {
    return {
      response: buildBadRequestResponse(
        `Workspace exceeds the maximum document limit (${MAX_DOCUMENTS_PER_WORKSPACE}).`
      )
    } as const;
  }

  if (typeof candidate.createdAt !== "string" || typeof candidate.updatedAt !== "string") {
    return {
      response: buildBadRequestResponse(
        "Hosted workspace save payload must include createdAt and updatedAt timestamps."
      )
    } as const;
  }

  if (typeof candidate.storageMode !== "string") {
    return {
      response: buildBadRequestResponse(
        "Hosted workspace save payload must include a storageMode."
      )
    } as const;
  }

  return {
    workspace: workspace as ReturnWorkspaceRecord
  } as const;
}

const DOCUMENT_UPLOAD_MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/** Maximum time to wait for multipart form data to arrive before aborting (30 seconds). */
const FORM_DATA_READ_TIMEOUT_MS = 30_000;

function withFormDataTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Form data read timed out.")), ms);

    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

const DOCUMENT_UPLOAD_ALLOWED_MEDIA_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/tiff",
  "image/webp"
]);

function isAllowedDocumentMediaType(mediaType: string): boolean {
  return DOCUMENT_UPLOAD_ALLOWED_MEDIA_TYPES.has(mediaType.toLowerCase().trim());
}

const DOCUMENT_ID_MAX_LENGTH = 256;

function hasDisallowedDocumentIdCharacter(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0);

    if (code <= 0x1f || code === 0x7f) {
      return true;
    }

    if (character === "<" || character === ">" || character === "/" || character === "\\") {
      return true;
    }
  }

  return false;
}

export function isValidHostedDocumentId(documentId: string): boolean {
  const trimmed = documentId.trim();
  return trimmed.length > 0
    && trimmed.length <= DOCUMENT_ID_MAX_LENGTH
    && !hasDisallowedDocumentIdCharacter(trimmed);
}

/**
 * Magic byte signatures for allowed file types.
 * Used to verify the file content matches the declared MIME type,
 * preventing MIME type spoofing attacks (e.g., uploading an executable
 * disguised as a PDF).
 */
const FILE_MAGIC_SIGNATURES: ReadonlyArray<{
  mediaType: string;
  prefix: readonly number[];
}> = [
  { mediaType: "application/pdf", prefix: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mediaType: "image/png", prefix: [0x89, 0x50, 0x4E, 0x47] }, // .PNG
  { mediaType: "image/jpeg", prefix: [0xFF, 0xD8, 0xFF] },
  // TIFF: little-endian (II) or big-endian (MM)
  { mediaType: "image/tiff", prefix: [0x49, 0x49, 0x2A, 0x00] },
  { mediaType: "image/tiff", prefix: [0x4D, 0x4D, 0x00, 0x2A] },
  // WebP: starts with RIFF....WEBP
  { mediaType: "image/webp", prefix: [0x52, 0x49, 0x46, 0x46] }
];

function matchesMagicBytes(
  bytes: Uint8Array,
  declaredMediaType: string
): boolean {
  const normalizedType = declaredMediaType.toLowerCase().trim();
  const applicableSignatures = FILE_MAGIC_SIGNATURES.filter(
    (sig) => sig.mediaType === normalizedType
  );

  if (applicableSignatures.length === 0) {
    // No known signature for this type — reject by default
    return false;
  }

  return applicableSignatures.some((sig) => {
    if (bytes.length < sig.prefix.length) {
      return false;
    }

    for (let i = 0; i < sig.prefix.length; i++) {
      if (bytes[i] !== sig.prefix[i]) {
        return false;
      }
    }

    // WebP requires additional check: bytes 8-11 must be "WEBP"
    if (normalizedType === "image/webp") {
      if (bytes.length < 12) {
        return false;
      }

      return bytes[8] === 0x57 // W
        && bytes[9] === 0x45  // E
        && bytes[10] === 0x42 // B
        && bytes[11] === 0x50; // P
    }

    return true;
  });
}

function sanitizeFileName(name: string): string {
  // Remove path traversal sequences and null bytes
  return name
    .replace(/\0/g, "")
    .replace(/\.\./g, "")
    .replace(/[/\\]/g, "_")
    .trim() || "document";
}

/**
 * Maximum total request body size for document uploads.
 * Slightly larger than DOCUMENT_UPLOAD_MAX_SIZE_BYTES to allow for
 * multipart form overhead (boundary markers, field headers, etc.).
 */
const DOCUMENT_UPLOAD_MAX_REQUEST_SIZE = DOCUMENT_UPLOAD_MAX_SIZE_BYTES + 1024 * 1024; // 26 MB

async function readHostedDocumentBlobFromRequest(
  request: Request,
  workspaceId: string,
  now: () => string
) {
  const contentLength = request.headers.get("content-length");

  if (contentLength) {
    const declaredSize = parseInt(contentLength, 10);

    if (!Number.isNaN(declaredSize) && declaredSize > DOCUMENT_UPLOAD_MAX_REQUEST_SIZE) {
      return {
        response: buildBadRequestResponse(
          "Uploaded file exceeds the 25 MB size limit."
        )
      } as const;
    }
  }

  let formData: FormData;

  try {
    formData = await withFormDataTimeout(request.formData(), FORM_DATA_READ_TIMEOUT_MS);
  } catch {
    return {
      response: buildBadRequestResponse(
        "Hosted document uploads require multipart form data with a file."
      )
    } as const;
  }

  const file = formData.get("file");
  const documentId = formData.get("documentId");
  const uploadedAt = formData.get("uploadedAt");

  if (!(file instanceof File)) {
    return {
      response: buildBadRequestResponse(
        "Hosted document uploads require a file payload."
      )
    } as const;
  }

  if (file.size > DOCUMENT_UPLOAD_MAX_SIZE_BYTES) {
    return {
      response: buildBadRequestResponse(
        "Uploaded file exceeds the 25 MB size limit."
      )
    } as const;
  }

  const mediaType = file.type?.toLowerCase().trim();

  if (!mediaType || mediaType.length === 0) {
    return {
      response: buildBadRequestResponse(
        "Uploaded file must declare a media type. Accepted types: PDF, PNG, JPEG, TIFF, WebP."
      )
    } as const;
  }

  if (!isAllowedDocumentMediaType(mediaType)) {
    return {
      response: buildBadRequestResponse(
        "Uploaded file type is not supported. Accepted types: PDF, PNG, JPEG, TIFF, WebP."
      )
    } as const;
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer());

  if (!matchesMagicBytes(fileBytes, mediaType)) {
    return {
      response: buildBadRequestResponse(
        "Uploaded file content does not match the declared media type."
      )
    } as const;
  }

  if (typeof documentId !== "string" || !isValidHostedDocumentId(documentId)) {
    return {
      response: buildBadRequestResponse(
        "Invalid document identifier. Use normal filename characters, but not slashes, angle brackets, or control characters."
      )
    } as const;
  }

  return {
    blob: {
      workspaceId,
      documentId: documentId.trim(),
      fileName: sanitizeFileName(file.name),
      mediaType,
      size: file.size,
      uploadedAt: typeof uploadedAt === "string" && uploadedAt.trim().length > 0
        ? uploadedAt
        : now(),
      bytes: fileBytes
    }
  } as const;
}

export function createHostedWorkspaceRouteHandlers(
  dependencies: HostedWorkspaceRouteDependencies = {}
) {
  const apiStore = dependencies.rateLimitStore ?? createRateLimitStore();
  const uploadStore = dependencies.rateLimitStore ?? createRateLimitStore();

  if (!dependencies.rateLimitStore) {
    registerStoreForCleanup(apiStore, rateLimitTiers.api.windowMs);
    registerStoreForCleanup(uploadStore, rateLimitTiers.upload.windowMs);
  }

  async function applyApiRateLimit(request: Request) {
    const env = dependencies.env ?? process.env;
    const clientId = resolveClientIdentifier(request.headers);
    return checkRateLimitForEnvironment(apiStore, `workspace:${clientId}`, rateLimitTiers.api, env);
  }

  async function applyUploadRateLimit(request: Request) {
    const env = dependencies.env ?? process.env;
    const clientId = resolveClientIdentifier(request.headers);
    return checkRateLimitForEnvironment(uploadStore, `upload:${clientId}`, rateLimitTiers.upload, env);
  }

  return {
    async list(request: Request) {
      const rateCheck = await applyApiRateLimit(request);

      if (rateCheck.unavailable) return rateLimitUnavailableResponse();

      if (!rateCheck.allowed) {
        return buildRateLimitResponse(rateCheck.retryAfterMs);
      }

      const result = await createHostedAdapter(request, dependencies);

      if ("response" in result) {
        return result.response;
      }

      try {
        return NextResponse.json({
          availability: result.adapter.availability,
          ownerScope: result.adapter.ownerScope,
          workspace: null,
          workspaces: await result.adapter.listWorkspaces()
        });
      } catch (error) {
        return buildPersistenceUnavailableResponse(error);
      }
    },

    async get(request: Request, context: HostedWorkspaceRouteContext) {
      if (!isValidWorkspaceId(context.workspaceId)) {
        return buildBadRequestResponse("Invalid workspace identifier.");
      }

      const rateCheck = await applyApiRateLimit(request);

      if (rateCheck.unavailable) return rateLimitUnavailableResponse();

      if (!rateCheck.allowed) {
        return buildRateLimitResponse(rateCheck.retryAfterMs);
      }

      const result = await createHostedAdapter(request, dependencies);

      if ("response" in result) {
        return result.response;
      }

      try {
        const requestUrl = new URL(request.url);
        let workspace = await result.adapter.getWorkspace(context.workspaceId);

        if (!workspace && requestUrl.searchParams.get("create") === "1") {
          const existingWorkspaces = await result.adapter.listWorkspaces();

          if (existingWorkspaces.length >= MAX_WORKSPACES_PER_USER) {
            return buildBadRequestResponse(
              `You have reached the maximum number of returns (${MAX_WORKSPACES_PER_USER}). Please delete an existing return before creating a new one.`
            );
          }

          workspace = await result.adapter.saveWorkspace(
            createWorkspaceRecord(context.workspaceId, {
              now: dependencies.now?.() ?? new Date().toISOString(),
              storageMode: "hosted-postgres",
              createdMessage: "Return created."
            })
          );
        }

        return NextResponse.json({
          availability: result.adapter.availability,
          ownerScope: result.adapter.ownerScope,
          workspace,
          workspaces: []
        });
      } catch (error) {
        return buildPersistenceUnavailableResponse(error);
      }
    },

    async save(request: Request, context: HostedWorkspaceRouteContext) {
      if (!isValidWorkspaceId(context.workspaceId)) {
        return buildBadRequestResponse("Invalid workspace identifier.");
      }

      const rateCheck = await applyApiRateLimit(request);

      if (rateCheck.unavailable) return rateLimitUnavailableResponse();

      if (!rateCheck.allowed) {
        return buildRateLimitResponse(rateCheck.retryAfterMs);
      }

      const result = await createHostedAdapter(request, dependencies);

      if ("response" in result) {
        return result.response;
      }

      const payload = await readWorkspaceSnapshotFromRequest(request, context.workspaceId);

      if ("response" in payload) {
        return payload.response;
      }

      try {
        const ownerScope = requireOwnerScope(result.adapter.ownerScope);

        // Enforce workspace count limit for new workspaces (not updates)
        const existingWorkspace = await result.adapter.getWorkspace(context.workspaceId);

        if (!existingWorkspace) {
          const existingWorkspaces = await result.adapter.listWorkspaces();

          if (existingWorkspaces.length >= MAX_WORKSPACES_PER_USER) {
            return buildBadRequestResponse(
              `You have reached the maximum number of returns (${MAX_WORKSPACES_PER_USER}). Please delete an existing return before creating a new one.`
            );
          }
        }

        result.resolveHostedDocumentBlobStore().reconcileWorkspace(
          ownerScope.ownerId,
          context.workspaceId,
          payload.workspace.documents.flatMap((document) =>
            typeof document.blobStorageKey === "string" && document.blobStorageKey.length > 0
              ? [document.blobStorageKey]
              : []
          )
        );

        return NextResponse.json({
          availability: result.adapter.availability,
          ownerScope: result.adapter.ownerScope,
          workspace: await result.adapter.saveWorkspace(payload.workspace),
          workspaces: []
        });
      } catch (error) {
        return buildPersistenceUnavailableResponse(error);
      }
    },

    async delete(request: Request, context: HostedWorkspaceRouteContext) {
      if (!isValidWorkspaceId(context.workspaceId)) {
        return buildBadRequestResponse("Invalid workspace identifier.");
      }

      const rateCheck = await applyApiRateLimit(request);

      if (rateCheck.unavailable) return rateLimitUnavailableResponse();

      if (!rateCheck.allowed) {
        return buildRateLimitResponse(rateCheck.retryAfterMs);
      }

      const result = await createHostedAdapter(request, dependencies);

      if ("response" in result) {
        return result.response;
      }

      try {
        const ownerScope = requireOwnerScope(result.adapter.ownerScope);
        result.resolveHostedDocumentBlobStore().deleteWorkspace(
          ownerScope.ownerId,
          context.workspaceId
        );

        return NextResponse.json({
          availability: result.adapter.availability,
          ownerScope: result.adapter.ownerScope,
          workspace: null,
          workspaces: await result.adapter.deleteWorkspace(context.workspaceId)
        });
      } catch (error) {
        return buildPersistenceUnavailableResponse(error);
      }
    },

    async uploadDocument(request: Request, context: HostedWorkspaceRouteContext) {
      if (!isValidWorkspaceId(context.workspaceId)) {
        return buildBadRequestResponse("Invalid workspace identifier.");
      }

      const rateCheck = await applyUploadRateLimit(request);

      if (rateCheck.unavailable) return rateLimitUnavailableResponse();

      if (!rateCheck.allowed) {
        return buildRateLimitResponse(rateCheck.retryAfterMs);
      }

      const result = await createHostedAdapter(request, dependencies);

      if ("response" in result) {
        return result.response;
      }

      const payload = await readHostedDocumentBlobFromRequest(
        request,
        context.workspaceId,
        () => dependencies.now?.() ?? new Date().toISOString()
      );

      if ("response" in payload) {
        return payload.response;
      }

      try {
        const ownerScope = requireOwnerScope(result.adapter.ownerScope);
        return NextResponse.json({
          availability: result.adapter.availability,
          ownerScope: result.adapter.ownerScope,
          document: result.resolveHostedDocumentBlobStore().save(
            ownerScope.ownerId,
            payload.blob
          )
        });
      } catch (error) {
        return buildPersistenceUnavailableResponse(error);
      }
    }
  };
}
