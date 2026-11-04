import { isCanonicalHostedDocumentId, toHostedDocumentId } from "./hosted-document-identity";

interface CachedWorkspaceDocumentFileRecord {
  key: string;
  workspaceId: string;
  documentId: string;
  fileName: string;
  mediaType: string;
  uploadedAt: string;
  lastModified?: number;
  file: Blob;
}

export interface WorkspaceDocumentFileUpload {
  documentId: string;
  uploadedAt?: string;
  file: File;
}

const DB_NAME = "tax-engine-workspace-document-cache";
const STORE_NAME = "workspace-document-files";
const memoryCache = new Map<string, CachedWorkspaceDocumentFileRecord>();

function buildCacheKey(workspaceId: string, documentId: string) {
  return JSON.stringify([workspaceId, documentId]);
}

function getIndexedDbFactory() {
  if (typeof indexedDB === "undefined") {
    return null;
  }

  return indexedDB;
}

function openCacheDatabase(): Promise<IDBDatabase | null> {
  const factory = getIndexedDbFactory();
  if (!factory) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = factory.open(DB_NAME, 1);

    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function putRecord(record: CachedWorkspaceDocumentFileRecord) {
  memoryCache.set(record.key, record);

  const database = await openCacheDatabase();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); resolve(); };
    transaction.onabort = () => { database.close(); resolve(); };
    transaction.objectStore(STORE_NAME).put(record);
  });
}

async function getRecord(key: string): Promise<CachedWorkspaceDocumentFileRecord | null> {
  const memoryRecord = memoryCache.get(key);
  if (memoryRecord) {
    return memoryRecord;
  }

  const database = await openCacheDatabase();
  if (!database) {
    return null;
  }

  return new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve((request.result as CachedWorkspaceDocumentFileRecord | undefined) ?? null);
    transaction.oncomplete = () => database.close();
    transaction.onabort = () => { database.close(); resolve(null); };
  });
}

function isOwnedRecord(value: unknown, workspaceId: string, storedKey: unknown): value is CachedWorkspaceDocumentFileRecord {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof storedKey !== "string") return false;
  const record = value as Partial<CachedWorkspaceDocumentFileRecord>;
  return record.workspaceId === workspaceId && typeof record.documentId === "string"
    && record.documentId.length > 0 && record.key === storedKey
    && (storedKey === buildCacheKey(workspaceId, record.documentId) || storedKey === `${workspaceId}:${record.documentId}`)
    && typeof record.fileName === "string" && typeof record.mediaType === "string" && typeof record.uploadedAt === "string"
    && (record.lastModified === undefined || (Number.isSafeInteger(record.lastModified) && record.lastModified >= 0))
    && record.file instanceof Blob;
}

function ownedMemoryRecords(workspaceId: string) {
  const records = new Map<string, CachedWorkspaceDocumentFileRecord>();
  for (const [key, value] of memoryCache) if (isOwnedRecord(value, workspaceId, key)) records.set(key, value);
  return records;
}

async function readOwnedPrefix(workspaceId: string, prefix: string) {
  if (typeof IDBKeyRange === "undefined") return null;
  const database = await openCacheDatabase();
  if (!database) return null;
  return new Promise<CachedWorkspaceDocumentFileRecord[] | null>((resolve) => {
    const records: CachedWorkspaceDocumentFileRecord[] = [];
    const transaction = database.transaction(STORE_NAME, "readonly");
    const cursor = transaction.objectStore(STORE_NAME).openCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
    let failed = false;
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (!item) return;
      if (isOwnedRecord(item.value, workspaceId, item.primaryKey)) records.push(item.value);
      item.continue();
    };
    cursor.onerror = () => { failed = true; };
    transaction.oncomplete = () => { database.close(); resolve(failed ? null : records); };
    transaction.onerror = () => { database.close(); resolve(null); };
    transaction.onabort = () => { database.close(); resolve(null); };
  });
}

function aliasMatches(records: Map<string, CachedWorkspaceDocumentFileRecord>, workspaceId: string, documentId: string) {
  return [...records.values()].filter(record => toHostedDocumentId(workspaceId, record.documentId) === documentId);
}

async function getAliasedRecord(workspaceId: string, documentId: string) {
  const records = ownedMemoryRecords(workspaceId);
  const tuplePrefix = `${JSON.stringify([workspaceId]).slice(0, -1)},`;
  // Retain both historical key formats. Bounds limit reads to this workspace's
  // key prefixes, and exact stored ownership/key checks still apply to each row.
  if (getIndexedDbFactory()) {
    for (const prefix of [tuplePrefix, `${workspaceId}:`]) {
      const durableRecords = await readOwnedPrefix(workspaceId, prefix);
      // An unavailable/aborted inventory cannot prove the memory match unique.
      if (durableRecords === null) return null;
      for (const record of durableRecords) if (!records.has(record.key)) records.set(record.key, record);
    }
  }
  const matches = aliasMatches(records, workspaceId, documentId);
  return matches.length === 1 ? matches[0] ?? null : null;
}

export async function cacheWorkspaceDocumentFiles(
  workspaceId: string,
  uploads: WorkspaceDocumentFileUpload[],
) {
  await Promise.all(uploads.map(async (upload) => {
    const key = buildCacheKey(workspaceId, upload.documentId);
    await putRecord({
      key,
      workspaceId,
      documentId: upload.documentId,
      fileName: upload.file.name,
      mediaType: upload.file.type?.trim() || "application/pdf",
      uploadedAt: upload.uploadedAt ?? new Date().toISOString(),
      lastModified: upload.file.lastModified,
      file: upload.file,
    });
  }));
}

export async function getCachedWorkspaceDocumentFile(
  workspaceId: string,
  documentId: string,
): Promise<File | null> {
  // Canonical shell aliases must resolve uniquely, including any existing
  // current/legacy cache rows; a direct alias key is not an ambiguity bypass.
  let record: CachedWorkspaceDocumentFileRecord | null;
  if (isCanonicalHostedDocumentId(documentId)) {
    record = await getAliasedRecord(workspaceId, documentId);
  } else {
    let key = buildCacheKey(workspaceId, documentId);
    let direct = await getRecord(key);
    if (!direct) { key = `${workspaceId}:${documentId}`; direct = await getRecord(key); }
    record = isOwnedRecord(direct, workspaceId, key) && direct.documentId === documentId ? direct : null;
  }
  if (!record) return null;

  return new File([record.file], record.fileName, {
    type: record.mediaType,
    lastModified: record.lastModified ?? (Date.parse(record.uploadedAt) || 0),
  });
}

export async function hasCachedWorkspaceDocumentFile(
  workspaceId: string,
  documentId: string,
): Promise<boolean> {
  return (await getCachedWorkspaceDocumentFile(workspaceId, documentId)) !== null;
}

/** Recovery must not report success after falling back to an in-memory cache. */
export async function restoreWorkspaceDocumentFiles(
  workspaceId: string,
  uploads: WorkspaceDocumentFileUpload[],
) {
  if (uploads.length === 0) return;
  const database = await openCacheDatabase();
  if (!database) throw new Error("Durable document storage is unavailable. Recovery was not saved.");
  const records = uploads.map((upload): CachedWorkspaceDocumentFileRecord => ({
    key: buildCacheKey(workspaceId, upload.documentId), workspaceId,
    documentId: upload.documentId, fileName: upload.file.name,
    mediaType: upload.file.type, uploadedAt: upload.uploadedAt ?? new Date().toISOString(),
    lastModified: upload.file.lastModified, file: upload.file,
  }));
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(new Error("Document recovery failed. Your existing returns were not changed.")); };
    transaction.onabort = () => { database.close(); reject(new Error("Document recovery was interrupted.")); };
    for (const record of records) transaction.objectStore(STORE_NAME).put(record);
  });
  for (const record of records) memoryCache.set(record.key, record);
}

function selectedCacheKeys(
  records: Map<string, CachedWorkspaceDocumentFileRecord>, workspaceId: string, documentIds?: string[],
) {
  if (documentIds === undefined) return [...records.keys()];
  const selected = new Set<string>();
  for (const documentId of documentIds) {
    if (isCanonicalHostedDocumentId(documentId)) {
      const matches = aliasMatches(records, workspaceId, documentId);
      if (matches.length > 1) throw new Error("Could not uniquely identify stored documents. No documents were deleted.");
      const match = matches[0];
      if (match) selected.add(match.key);
    } else {
      for (const record of records.values()) if (record.documentId === documentId) selected.add(record.key);
    }
  }
  return [...selected];
}

/** Delete original documents as well as metadata, scoped by stored ownership.
 * Resolve every selected alias before the first delete, within the same IDB
 * write transaction. Ambiguous identities leave both durable and memory data intact.
 */
export async function deleteCachedWorkspaceDocumentFiles(workspaceId: string, documentIds?: string[]) {
  const records = ownedMemoryRecords(workspaceId);
  const database = await openCacheDatabase();
  let selected: string[];
  if (database) {
    selected = await new Promise<string[]>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const cursor = store.openCursor();
      let keys: string[] = [];
      let ambiguity: Error | null = null;
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (item) {
          if (isOwnedRecord(item.value, workspaceId, item.primaryKey) && !records.has(item.value.key)) {
            records.set(item.value.key, item.value);
          }
          item.continue();
          return;
        }
        try { keys = selectedCacheKeys(records, workspaceId, documentIds); }
        catch (error) {
          ambiguity = error instanceof Error ? error : new Error("Could not uniquely identify stored documents. No documents were deleted.");
          transaction.abort();
          return;
        }
        for (const key of keys) store.delete(key);
      };
      transaction.oncomplete = () => { database.close(); resolve(keys); };
      transaction.onerror = () => { database.close(); reject(new Error("Could not delete stored documents. Please retry deletion.")); };
      transaction.onabort = () => { database.close(); reject(ambiguity ?? new Error("Document deletion was interrupted. Please retry.")); };
    });
  } else {
    if (getIndexedDbFactory()) throw new Error("Document storage could not be opened. Please retry deletion.");
    selected = selectedCacheKeys(records, workspaceId, documentIds);
  }
  // A failed/ambiguous durable transaction must not partially remove memory data.
  for (const key of selected) memoryCache.delete(key);
}
