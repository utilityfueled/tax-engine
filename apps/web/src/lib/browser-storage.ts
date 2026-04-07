const STORAGE_PROBE_KEY = "__tax-engine-browser-storage-probe__";

export function getBrowserStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storage = window.localStorage;
    storage.getItem(STORAGE_PROBE_KEY);
    return storage;
  } catch {
    return null;
  }
}

export function requireBrowserStorage() {
  const storage = getBrowserStorage();

  if (!storage) {
    throw new Error("Browser storage is unavailable in this environment.");
  }

  return storage;
}
