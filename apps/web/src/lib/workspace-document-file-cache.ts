interface CachedWorkspaceDocumentFileRecord {
  key: string;
  workspaceId: string;
  documentId: string;
  fileName: string;
  mediaType: string;
  uploadedAt: string;
  file: Blob;
}

interface WorkspaceDocumentFileUpload {
  documentId: string;
  uploadedAt?: string;
  file: File;
}

const DB_NAME = "tax-engine-workspace-document-cache";
const STORE_NAME = "workspace-document-files";
const memoryCache = new Map<string, CachedWorkspaceDocumentFileRecord>();

function buildCacheKey(workspaceId: string, documentId: string) {
  return `${workspaceId}:${documentId}`;
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
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
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
      file: upload.file,
    });
  }));
}

export async function getCachedWorkspaceDocumentFile(
  workspaceId: string,
  documentId: string,
): Promise<File | null> {
  const record = await getRecord(buildCacheKey(workspaceId, documentId));
  if (!record) {
    return null;
  }

  return new File([record.file], record.fileName, {
    type: record.mediaType,
    lastModified: Date.parse(record.uploadedAt) || Date.now(),
  });
}

export async function hasCachedWorkspaceDocumentFile(
  workspaceId: string,
  documentId: string,
): Promise<boolean> {
  return (await getRecord(buildCacheKey(workspaceId, documentId))) !== null;
}
