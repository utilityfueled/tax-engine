import { createProviderWorkspaceRouteHandlers } from "../../../../lib/provider-workspace-route";
import { providerRateLimitStore } from "../shared-rate-limit";

export const { POST } = createProviderWorkspaceRouteHandlers({
  rateLimitStore: providerRateLimitStore
});
