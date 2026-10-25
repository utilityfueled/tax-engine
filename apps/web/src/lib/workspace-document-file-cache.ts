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
  // Read the former key format only when its stored ownership matches exactly.
  const record = await getRecord(buildCacheKey(workspaceId, documentId))
    ?? await getRecord(`${workspaceId}:${documentId}`);
  if (!record || record.workspaceId !== workspaceId || record.documentId !== documentId) {
    return null;
  }

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

/** Delete original documents as well as metadata, scoped by stored ownership. */
export async function deleteCachedWorkspaceDocumentFiles(workspaceId: string, documentIds?: string[]) {
  const belongs = (record: CachedWorkspaceDocumentFileRecord) => record.workspaceId === workspaceId
    && (documentIds === undefined || documentIds.includes(record.documentId));
  const database = await openCacheDatabase();
  if (database) {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const cursor = transaction.objectStore(STORE_NAME).openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (!item) return;
        if (belongs(item.value as CachedWorkspaceDocumentFileRecord)) item.delete();
        item.continue();
      };
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(new Error("Could not delete stored documents. Please retry deletion.")); };
      transaction.onabort = () => { database.close(); reject(new Error("Document deletion was interrupted. Please retry.")); };
    });
  } else if (getIndexedDbFactory()) {
    throw new Error("Document storage could not be opened. Please retry deletion.");
  }
  for (const [key, record] of memoryCache) if (belongs(record)) memoryCache.delete(key);
}
