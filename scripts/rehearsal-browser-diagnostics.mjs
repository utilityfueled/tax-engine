import { createHash } from "node:crypto";
import { URL } from "node:url";

// Rehearsals use synthetic records, but diagnostics still omit URL contents,
// request bodies, browser storage, page text and exception messages.
export function createRehearsalBrowserDiagnostics(origin) {
  const events = [];
  let dropped = 0;
  const append = event => {
    if (events.length < 100) events.push(event);
    else dropped++;
  };
  const requestFacts = request => {
    let url;
    try { url = new URL(request.url()); } catch { /* Invalid URLs carry no source text. */ }
    const type = request.resourceType();
    return {
      sameOrigin: url?.origin === origin,
      route: !url ? "invalid" : url.origin !== origin ? "external"
        : url.pathname.startsWith("/_next/static/") ? "static-asset"
        : url.pathname.startsWith("/api/") ? "api"
        : url.pathname.startsWith("/returns/") ? "return" : "other",
      pathSha256: url ? createHash("sha256").update(url.pathname).digest("hex") : null,
      resourceType: ["document", "script", "stylesheet", "image", "font", "xhr", "fetch"].includes(type) ? type : "other",
    };
  };
  return {
    pageError(error) {
      const category = /ChunkLoadError|Loading chunk|dynamically imported module/i.test(String(error?.message ?? ""))
        ? "chunk-load" : /hydration|hydrating/i.test(String(error?.message ?? "")) ? "hydration" : "javascript";
      append({ kind: "page-error", category,
        name: ["Error", "TypeError", "ReferenceError", "SyntaxError", "RangeError", "ChunkLoadError"].includes(error?.name) ? error.name : "other" });
    },
    requestFailed(request) {
      const failure = request.failure()?.errorText ?? "";
      append({ kind: "request-failed", ...requestFacts(request),
        networkCode: ["net::ERR_ABORTED", "net::ERR_CONNECTION_RESET", "net::ERR_CONNECTION_REFUSED",
          "net::ERR_FAILED", "net::ERR_TIMED_OUT", "net::ERR_INTERNET_DISCONNECTED", "net::ERR_NAME_NOT_RESOLVED",
          "net::ERR_EMPTY_RESPONSE", "net::ERR_HTTP_RESPONSE_CODE_FAILURE", "net::ERR_CONTENT_LENGTH_MISMATCH",
          "net::ERR_NETWORK_CHANGED"].includes(failure) ? failure : "unclassified" });
    },
    response(response) {
      if (response.status() >= 400) append({ kind: "http-error", ...requestFacts(response.request()), status: response.status() });
    },
    snapshot() { return { events: events.map(event => ({ ...event })), dropped }; },
  };
}
