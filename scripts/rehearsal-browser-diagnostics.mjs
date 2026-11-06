import { createHash } from "node:crypto";
import { URL } from "node:url";

// Rehearsals use synthetic records, but diagnostics still omit URL contents,
// request bodies, browser storage, page text and exception messages.
const knownPhases = new Set([
  "image-inspection", "start-previous", "previous", "start-upgrade", "upgrade",
  "restart-database", "database-restart", "restore-database", "database-dump-restore",
  "start-rollback", "rollback", "start-re-upgrade", "re-upgrade", "browser-backup-restore-delete",
]);

export function createRehearsalBrowserDiagnostics(origin, options = {}) {
  const events = [];
  let dropped = 0;
  let phase = "unavailable";
  let navigationSequence = 0;
  let documentSequence = 0;
  let requestsTracked = 0;
  let requestTrackingDropped = 0;
  let navigationResponsesDropped = 0;
  const requests = new WeakMap();
  const navigationResponses = [];
  const increment = value => Math.min(value + 1, Number.MAX_SAFE_INTEGER);
  const mainFrame = frame => {
    try { return typeof options.isMainFrame === "function" ? options.isMainFrame(frame) === true : null; }
    catch { return null; }
  };
  const requestObservation = request => {
    const prior = requests.get(request);
    return { requestObserved: Boolean(prior), phaseAtStart: prior?.phase ?? "unavailable", phaseAtEvent: phase,
      navigationAtStart: prior?.navigationSequence ?? null, documentAtStart: prior?.documentSequence ?? null,
      navigationAtEvent: navigationSequence, documentAtEvent: documentSequence,
      mainFrame: prior?.mainFrame ?? null, navigationRequest: prior?.navigationRequest ?? null };
  };
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
    setPhase(value) { phase = knownPhases.has(value) ? value : "unavailable"; },
    requestStarted(request) {
      // Observation failures cannot interrupt the original request or rehearsal.
      try {
        if (requests.has(request)) return;
        let isMain = null, navigation = null;
        try { isMain = mainFrame(request.frame()); } catch { /* No frame available. */ }
        try { const value = request.isNavigationRequest(); navigation = typeof value === "boolean" ? value : null; } catch { /* Unknown. */ }
        if (isMain && navigation) navigationSequence = increment(navigationSequence);
        if (requestsTracked >= 1000) { requestTrackingDropped = increment(requestTrackingDropped); return; }
        requests.set(request, { phase, navigationSequence, documentSequence, mainFrame: isMain, navigationRequest: navigation });
        requestsTracked++;
      } catch { /* Invalid observation only; never an original failure. */ }
    },
    frameCommitted(frame) {
      if (mainFrame(frame)) documentSequence = increment(documentSequence);
    },
    navigationResponse(response) {
      if (navigationResponses.length >= 20) { navigationResponsesDropped = increment(navigationResponsesDropped); return; }
      try {
        const status = response?.status();
        if (!Number.isInteger(status) || status < 100 || status > 599) throw new Error("Unavailable response");
        const raw = response.headers()["cache-control"];
        const available = typeof raw === "string" && raw.length <= 2048;
        const directives = available ? raw.toLowerCase().split(",").map(value => value.trim()) : [];
        const flag = pattern => available ? directives.some(value => pattern.test(value)) : null;
        const fromServiceWorker = response.fromServiceWorker();
        const prior = requests.get(response.request());
        navigationResponses.push({ available: true, status, phase, navigationSequence: prior?.navigationSequence ?? null,
          fromServiceWorker: typeof fromServiceWorker === "boolean" ? fromServiceWorker : null,
          cachePolicy: { available, noStore: flag(/^no-store$/), noCache: flag(/^no-cache(?:=|$)/),
            private: flag(/^private(?:=|$)/), mustRevalidate: flag(/^must-revalidate$/), maxAgeZero: flag(/^max-age\s*=\s*0$/) } });
      } catch { navigationResponses.push({ available: false, phase, reason: "unavailable" }); }
    },
    pageError(error) {
      const category = /ChunkLoadError|Loading chunk|dynamically imported module/i.test(String(error?.message ?? ""))
        ? "chunk-load" : /hydration|hydrating/i.test(String(error?.message ?? "")) ? "hydration" : "javascript";
      append({ kind: "page-error", category, phaseAtEvent: phase, navigationAtEvent: navigationSequence, documentAtEvent: documentSequence,
        name: ["Error", "TypeError", "ReferenceError", "SyntaxError", "RangeError", "ChunkLoadError"].includes(error?.name) ? error.name : "other" });
    },
    requestFailed(request) {
      const failure = request.failure()?.errorText ?? "";
      append({ kind: "request-failed", ...requestFacts(request), ...requestObservation(request),
        networkCode: ["net::ERR_ABORTED", "net::ERR_CONNECTION_RESET", "net::ERR_CONNECTION_REFUSED",
          "net::ERR_FAILED", "net::ERR_TIMED_OUT", "net::ERR_INTERNET_DISCONNECTED", "net::ERR_NAME_NOT_RESOLVED",
          "net::ERR_EMPTY_RESPONSE", "net::ERR_HTTP_RESPONSE_CODE_FAILURE", "net::ERR_CONTENT_LENGTH_MISMATCH",
          "net::ERR_NETWORK_CHANGED"].includes(failure) ? failure : "unclassified" });
    },
    response(response) {
      if (response.status() >= 400) append({ kind: "http-error", ...requestFacts(response.request()), ...requestObservation(response.request()), status: response.status() });
    },
    snapshot() { return { events: events.map(event => ({ ...event })), dropped, navigationSequence, documentSequence,
      requestsTracked, requestTrackingDropped, navigationResponsesDropped,
      navigationResponses: navigationResponses.map(value => ({ ...value, ...(value.cachePolicy ? { cachePolicy: { ...value.cachePolicy } } : {}) })) }; },
  };
}

/** Serialized by Playwright and run only inside the existing failed-page eval.
 * No captured module bindings: all input is the current document's observations.
 * No fetch, storage, script content, stack, raw URL or header is returned.
 * The original two-second outer race remains the only snapshot deadline. */
export async function collectRehearsalPageState() {
  const state = { available: true, readyState: globalThis.document.readyState,
    hasHeading: Boolean(globalThis.document.querySelector("h1")),
    loadingReturn: globalThis.document.body?.textContent?.includes("Loading your return...") ?? false };
  try {
    const cap = 100;
    const assets = new Map();
    let assetOverflow = false;
    const fixedInitiators = new Set(["script", "link", "fetch", "xmlhttprequest", "css", "other"]);
    const source = (raw, kind, initiator) => {
      if (typeof raw !== "string" || raw.length > 4096) return;
      let url;
      try { url = new URL(raw, globalThis.location.origin); } catch { return; }
      if (url.origin !== globalThis.location.origin || !url.pathname.startsWith("/_next/static/") || url.pathname.length > 2048) return;
      let record = assets.get(url.pathname);
      if (!record) {
        if (assets.size >= cap) { assetOverflow = true; return; }
        record = { scriptElement: false, preloadLink: false, initiators: new Set() };
        assets.set(url.pathname, record);
      }
      if (kind === "script") record.scriptElement = true;
      if (kind === "preload") record.preloadLink = true;
      if (kind === "resource") record.initiators.add(fixedInitiators.has(initiator) ? initiator : "other");
    };
    const scripts = globalThis.document.scripts;
    const links = globalThis.document.getElementsByTagName("link");
    // Native ResourceTiming materializes its list first; the following scan/output
    // limits are not a hard bound on that native allocation.
    const resources = globalThis.performance.getEntriesByType("resource");
    for (let i = 0; i < Math.min(scripts.length, cap); i++) source(scripts[i].src, "script");
    for (let i = 0; i < Math.min(links.length, cap); i++) {
      const rel = links[i].rel;
      if (typeof rel === "string" && rel.length <= 256 && rel.split(/\s+/).some(value => value === "preload" || value === "modulepreload")) source(links[i].href, "preload");
    }
    for (let i = 0; i < Math.min(resources.length, cap); i++) source(resources[i].name, "resource", resources[i].initiatorType);
    const records = [];
    for (const [pathname, record] of assets) {
      const bytes = new globalThis.TextEncoder().encode(pathname);
      const hashed = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      const pathSha256 = Array.from(new Uint8Array(hashed), value => value.toString(16).padStart(2, "0")).join("");
      records.push({ pathSha256, scriptElement: record.scriptElement, preloadLink: record.preloadLink,
        initiatorTypes: [...record.initiators].sort() });
    }
    return { ...state, staticAssets: { available: true, records, assetOverflow,
      scriptScanTruncated: scripts.length > cap, linkScanTruncated: links.length > cap, resourceScanTruncated: resources.length > cap } };
  } catch { return { ...state, staticAssets: { available: false, reason: "unavailable" } }; }
}
