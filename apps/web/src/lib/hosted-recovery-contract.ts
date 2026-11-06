/** Shared validation only. No server configuration or transport belongs in this module. */
export function isRecoveryToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,256}$/u.test(value);
}
