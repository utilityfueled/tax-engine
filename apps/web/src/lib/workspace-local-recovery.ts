const PREFIX = "tax-engine:local-recovery:v1:";

export function getLocalRecoveryStorageKey(workspaceId: string) {
  return `${PREFIX}${encodeURIComponent(workspaceId)}`;
}

/** Only explicit local restores are listed across hosted account changes. */
export function isLocalRecoveryWorkspace(storage: Pick<Storage, "getItem">, workspaceId: string) {
  return storage.getItem(getLocalRecoveryStorageKey(workspaceId)) === "local-only";
}
