import {
  createRateLimitStore,
  rateLimitTiers,
  registerStoreForCleanup
} from "../../../lib/rate-limit";

/**
 * Single shared rate limit store for all provider routes.
 *
 * All provider route files (workspace, interview, export-draft) import
 * from here so they share the same rate limit store. Without this, each
 * route module would create its own store and a client could multiply
 * their effective rate limit by hitting different endpoints.
 */
export const providerRateLimitStore = createRateLimitStore();
registerStoreForCleanup(providerRateLimitStore, rateLimitTiers.provider.windowMs);
