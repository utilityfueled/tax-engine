import {
  checkRateLimitForEnvironment,
  createRateLimitStore,
  rateLimitTiers,
  rateLimitUnavailableResponse,
  registerStoreForCleanup,
  resolveClientIdentifier,
} from "./rate-limit";

/** Taxpayer-bearing responses must not enter a browser or intermediary cache. */
export function privateResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, private");
  return new Response(response.body, { status: response.status, headers });
}

export function privateJson(body: unknown, status = 200): Response {
  return privateResponse(Response.json(body, { status }));
}

export function cancelledDocumentRequest(): Response {
  return privateJson({ error: "Request cancelled." }, 499);
}

/** Shared protection in hosted production; bounded local limits for self-hosting. */
export function createDocumentRequestProtection(scope: string) {
  const store = createRateLimitStore();
  registerStoreForCleanup(store, rateLimitTiers.provider.windowMs);
  return async (request: Request): Promise<Response | null> => {
    if (request.signal.aborted) return cancelledDocumentRequest();
    try {
      const limit = await checkRateLimitForEnvironment(
        store, `${scope}:${resolveClientIdentifier(request.headers)}`, rateLimitTiers.provider,
      );
      if (request.signal.aborted) return cancelledDocumentRequest();
      if (limit.unavailable) return privateResponse(rateLimitUnavailableResponse());
      if (!limit.allowed) {
        return privateResponse(Response.json({ error: "Too many requests. Please try again later." }, {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((limit.retryAfterMs ?? 1_000) / 1_000)) },
        }));
      }
      return null;
    } catch {
      return privateResponse(rateLimitUnavailableResponse());
    }
  };
}
