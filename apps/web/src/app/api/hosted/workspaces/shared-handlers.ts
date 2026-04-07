import { createHostedWorkspaceRouteHandlers } from "@/lib/hosted-workspace-route";

/**
 * Single shared instance of workspace route handlers.
 *
 * All workspace route files (list, get/save/delete, upload) import from
 * here so they share the same rate limit stores. Without this, each
 * route module would create its own stores and a client could multiply
 * their effective rate limit by hitting different endpoints.
 */
export const sharedHandlers = createHostedWorkspaceRouteHandlers();
