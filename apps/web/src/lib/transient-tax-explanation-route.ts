import "server-only";
import { createProviderWorkspaceRouteHandlers, type ProviderWorkspaceRouteDependencies } from "./provider-workspace-route";

/** This server-owned route option cannot be selected through request JSON. */
export function createTaxExplanationRouteHandlers(dependencies: ProviderWorkspaceRouteDependencies = {}) {
  return createProviderWorkspaceRouteHandlers(dependencies, { privateTaxCalculation: true });
}
