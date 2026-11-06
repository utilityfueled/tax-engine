import { z } from "zod";
import { getGuidedFlowStorageKey } from "./guided-interview-flow";
import { WORKSPACE_STORAGE_KEY, invalidateWorkspaceStorageCache } from "./workspace-storage";
import { getLocalRecoveryStorageKey } from "./workspace-local-recovery";
import {
  deleteCachedWorkspaceDocumentFiles, getCachedWorkspaceDocumentFile,
  restoreWorkspaceDocumentFiles, type WorkspaceDocumentFileUpload,
} from "./workspace-document-file-cache";

const FORMAT = "tax-engine-encrypted-recovery";
const ITERATIONS = 600_000;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 96 * 1024 * 1024;
const utf8 = new TextEncoder();
const identifier = z.string().min(1).max(512).refine((v) => !["__proto__", "constructor", "prototype"].includes(v));
const object = z.record(z.string(), z.unknown());
const documentSchema = z.object({
  id: identifier, name: z.string().min(1).max(1024), size: z.number().int().nonnegative(),
  uploadedAt: z.string(), kind: z.string(),
}).passthrough();
const workspaceSchema = z.object({
  id: identifier, documents: z.array(documentSchema).max(500),
  seededReturn: object, returnSummary: object, auditTrail: z.array(object),
  structuredFacts: z.array(object), checklist: z.array(object), summary: object,
}).passthrough();
const payloadSchema = z.object({
  schemaVersion: z.literal(1), createdAt: z.iso.datetime(),
  workspace: workspaceSchema,
  guidedFlowRaw: z.string().max(8 * 1024 * 1024).nullable(),
  guidedMode: z.enum(["true", "false"]).nullable(),
  files: z.array(z.object({
    documentId: identifier, name: z.string().min(1).max(1024), type: z.string().max(200),
    lastModified: z.number().int().nonnegative(), size: z.number().int().nonnegative().max(MAX_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u), base64: z.string().max(MAX_ARCHIVE_BYTES),
  }).strict()).max(500),
}).strict();
const envelopeSchema = z.object({
  format: z.literal(FORMAT), version: z.literal(1),
  cipher: z.literal("AES-256-GCM"), kdf: z.literal("PBKDF2-SHA256"),
  iterations: z.literal(ITERATIONS), salt: z.string().length(24), iv: z.string().length(16),
  ciphertext: z.string().min(24).max(MAX_ARCHIVE_BYTES),
}).strict();

/** Injectable storage I/O for failure tests; production uses the durable browser cache. */
export interface RecoveryDocumentStore {
  read: typeof getCachedWorkspaceDocumentFile;
  write: typeof restoreWorkspaceDocumentFiles;
  remove: typeof deleteCachedWorkspaceDocumentFiles;
}
const browserDocuments: RecoveryDocumentStore = {
  read: getCachedWorkspaceDocumentFile, write: restoreWorkspaceDocumentFiles,
  remove: deleteCachedWorkspaceDocumentFiles,
};
type RecoveryOptions = { signal?: AbortSignal; documents?: RecoveryDocumentStore };

function aborted(signal?: AbortSignal) { signal?.throwIfAborted(); }
function assertPassword(password: string) {
  if (password.length < 12 || password.length > 1024) {
    throw new Error("Use a recovery password between 12 and 1024 characters. Keep it separately from the backup.");
  }
}
function encode(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) {
    throw new Error("Invalid recovery file encoding.");
  }
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
async function hash(bytes: Uint8Array<ArrayBuffer>) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}
async function key(password: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey("raw", utf8.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
function readStorage(storage: Storage) {
  const raw = storage.getItem(WORKSPACE_STORAGE_KEY);
  return raw === null ? { workspaces: {} } : z.object({ workspaces: z.record(z.string(), z.unknown()) })
    .passthrough().parse(JSON.parse(raw));
}
function validateGuided(raw: string | null) {
  if (raw === null) return;
  // Preserve unknown fields and the original year, including a legacy missing year.
  z.object({ phase: z.enum(["segmentation", "interview", "complete"]),
    segmentation: z.object({ filingStatus: z.enum(["single", "mfj", "mfs", "hoh", "qss"]).nullable(),
      incomeTypes: z.array(z.string()), lifeEvents: z.array(z.string()), stateCode: z.string().nullable(),
    }).passthrough(), sectionData: object, completedSections: z.array(z.string()),
    currentSectionIndex: z.number().int().nonnegative(), taxYear: z.number().int().nullable().optional(),
  }).passthrough().parse(JSON.parse(raw));
}
function guidedModeKey(id: string) { return `tax-engine:guided-mode:${id}`; }

export async function exportWorkspaceRecovery(
  storage: Storage, workspaceId: string, password: string, options: RecoveryOptions = {},
): Promise<Blob> {
  assertPassword(password);
  aborted(options.signal);
  const workspace = workspaceSchema.parse(readStorage(storage).workspaces[workspaceId]);
  if (workspace.id !== workspaceId) throw new Error("The stored return identity does not match.");
  const guidedFlowRaw = storage.getItem(getGuidedFlowStorageKey(workspaceId));
  validateGuided(guidedFlowRaw);
  if (guidedFlowRaw === null && storage.getItem("tax-engine.guided-flow-state.v1") !== null) {
    throw new Error("Legacy guided answers are not linked to this return. Resolve them before creating a complete backup.");
  }
  const guidedMode = z.enum(["true", "false"]).nullable().parse(storage.getItem(guidedModeKey(workspaceId)));
  const documents = options.documents ?? browserDocuments;
  const files: z.infer<typeof payloadSchema>["files"] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const document of workspace.documents) {
    if (seen.has(document.id)) throw new Error("Duplicate document identity prevents a complete backup.");
    seen.add(document.id);
    // Guided records describe answers. They are not uploaded original files.
    if (document.id.startsWith("guided:")) continue;
    const file = await documents.read(workspaceId, document.id);
    aborted(options.signal);
    if (!file) throw new Error(`Original file is missing: ${document.name}. Reattach it before making a complete backup.`);
    if (file.size !== document.size) throw new Error(`Original file size does not match: ${document.name}.`);
    total += file.size;
    if (total > MAX_BYTES) throw new Error("This return exceeds the 64 MiB recovery limit.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    files.push({ documentId: document.id, name: file.name, type: file.type,
      lastModified: file.lastModified, size: file.size, sha256: await hash(bytes), base64: encode(bytes) });
  }
  const payload = payloadSchema.parse({ schemaVersion: 1, createdAt: new Date().toISOString(),
    workspace, guidedFlowRaw, guidedMode, files });
  const plaintext = utf8.encode(JSON.stringify(payload));
  if (plaintext.byteLength > MAX_BYTES) throw new Error("This return exceeds the 64 MiB recovery limit.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await key(password, salt);
  aborted(options.signal);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv,
    additionalData: utf8.encode(`${FORMAT}:1`) }, cryptoKey, plaintext);
  aborted(options.signal);
  return new Blob([JSON.stringify({ format: FORMAT, version: 1, cipher: "AES-256-GCM",
    kdf: "PBKDF2-SHA256", iterations: ITERATIONS, salt: encode(salt), iv: encode(iv),
    ciphertext: encode(new Uint8Array(ciphertext)) })], { type: "application/json" });
}

/** Import as a fresh local return. No server call, provider, or overwrite path. */
export async function importWorkspaceRecovery(
  storage: Storage, archive: Blob, password: string, options: RecoveryOptions = {},
): Promise<{ workspaceId: string; documentCount: number }> {
  assertPassword(password);
  aborted(options.signal);
  if (archive.size > MAX_ARCHIVE_BYTES) throw new Error("Recovery file exceeds the 96 MiB import limit.");
  const envelope = envelopeSchema.parse(JSON.parse(await archive.text()));
  const salt = decode(envelope.salt), iv = decode(envelope.iv);
  if (salt.length !== 16 || iv.length !== 12) throw new Error("Invalid recovery encryption parameters.");
  const cryptoKey = await key(password, salt);
  aborted(options.signal);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv,
      additionalData: utf8.encode(`${FORMAT}:1`) }, cryptoKey, decode(envelope.ciphertext));
  } catch {
    throw new Error("The backup password is incorrect or the recovery file has been damaged.");
  }
  if (plaintext.byteLength > MAX_BYTES) throw new Error("Recovery contents exceed the 64 MiB limit.");
  const payload = payloadSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)));
  validateGuided(payload.guidedFlowRaw);
  const expected = new Map(payload.workspace.documents.filter((document) => !document.id.startsWith("guided:"))
    .map((document) => [document.id, document]));
  if (new Set(payload.workspace.documents.map((document) => document.id)).size !== payload.workspace.documents.length) {
    throw new Error("Recovery contains duplicate document identities.");
  }
  const uploads: WorkspaceDocumentFileUpload[] = [];
  for (const saved of payload.files) {
    const document = expected.get(saved.documentId);
    if (!document) throw new Error("Recovery has unexpected or duplicate source files.");
    const bytes = decode(saved.base64);
    if (bytes.byteLength !== saved.size || document.size !== saved.size || await hash(bytes) !== saved.sha256) {
      throw new Error("Recovery source-file integrity check failed.");
    }
    uploads.push({ documentId: saved.documentId, uploadedAt: document.uploadedAt,
      file: new File([bytes], saved.name, { type: saved.type, lastModified: saved.lastModified }) });
    expected.delete(saved.documentId);
    aborted(options.signal);
  }
  if (expected.size > 0) throw new Error("Recovery is missing original source files.");
  const documents = options.documents ?? browserDocuments;
  const workspaceId = crypto.randomUUID();
  const flowKey = getGuidedFlowStorageKey(workspaceId), modeKey = guidedModeKey(workspaceId);
  const recoveryKey = getLocalRecoveryStorageKey(workspaceId);
  if (Object.hasOwn(readStorage(storage).workspaces, workspaceId) || storage.getItem(flowKey) !== null || storage.getItem(modeKey) !== null || storage.getItem(recoveryKey) !== null) {
    throw new Error("Recovery identity already exists. Retry to create a new return.");
  }
  let filesWritten = false;
  let flowWritten = false, modeWritten = false, recoveryWritten = false;
  try {
    aborted(options.signal);
    await documents.write(workspaceId, uploads);
    filesWritten = true;
    aborted(options.signal);
    // Read after asynchronous file work so another saved return is not replaced.
    const data = readStorage(storage);
    if (Object.hasOwn(data.workspaces, workspaceId) || storage.getItem(flowKey) !== null || storage.getItem(modeKey) !== null || storage.getItem(recoveryKey) !== null) {
      throw new Error("Recovery identity already exists. Retry to create a new return.");
    }
    if (payload.guidedFlowRaw !== null) { storage.setItem(flowKey, payload.guidedFlowRaw); flowWritten = true; }
    if (payload.guidedMode !== null) { storage.setItem(modeKey, payload.guidedMode); modeWritten = true; }
    storage.setItem(recoveryKey, "local-only"); recoveryWritten = true;
    // Derived previews are untrusted/stale after recovery; facts and year remain intact.
    const workspace = { ...payload.workspace, id: workspaceId, storageMode: "local-browser",
      enginePreview: null, documents: payload.workspace.documents.map((document) => ({ ...document, blobStorageKey: null })) };
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ ...data,
      workspaces: { ...data.workspaces, [workspaceId]: workspace } }));
    invalidateWorkspaceStorageCache(storage);
  } catch (error) {
    // Attempt every cleanup even if one storage API has become unavailable.
    for (const key of [flowWritten ? flowKey : null, modeWritten ? modeKey : null, recoveryWritten ? recoveryKey : null]) {
      if (key) { try { storage.removeItem(key); } catch { /* Preserve the original failure and continue cleanup. */ } }
    }
    if (filesWritten) await documents.remove(workspaceId);
    throw error;
  }
  return { workspaceId, documentCount: uploads.length };
}
