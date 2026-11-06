import { createTaxExplanationRouteHandlers } from "../../../../lib/transient-tax-explanation-route";
import { providerRateLimitStore } from "../../provider/shared-rate-limit";

export const { POST } = createTaxExplanationRouteHandlers({ rateLimitStore: providerRateLimitStore });
