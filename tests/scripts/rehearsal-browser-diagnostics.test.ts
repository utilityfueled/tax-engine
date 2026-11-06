import { describe, expect, it } from "vitest";
import { createRehearsalBrowserDiagnostics } from "../../scripts/rehearsal-browser-diagnostics.mjs";

const origin = "http://127.0.0.1:3000";
const request = (url: string, type = "script", errorText = "net::ERR_CONNECTION_RESET") => ({
  url: () => url, resourceType: () => type, failure: () => ({ errorText }),
});

describe("synthetic recovery failure diagnostics", () => {
  it("distinguishes missing static chunks without retaining private URL material", () => {
    const report = createRehearsalBrowserDiagnostics(origin);
    const url = `${origin}/_next/static/private-900-70-0033.js?token=synthetic-secret`;
    report.response({ status: () => 404, request: () => request(url) });
    report.requestFailed(request(`${origin}/returns/private-return-id?document=private.pdf`));
    const result = report.snapshot();
    expect(result.events[0]).toMatchObject({ kind: "http-error", route: "static-asset", resourceType: "script", status: 404, sameOrigin: true });
    expect(result.events[0].pathSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.events[1]).toMatchObject({ kind: "request-failed", route: "return", networkCode: "net::ERR_CONNECTION_RESET" });
    for (const value of ["900-70-0033", "private-return-id", "synthetic-secret", "private.pdf", origin]) expect(JSON.stringify(result)).not.toContain(value);
  });

  it("classifies exceptions and rejects arbitrary error or resource text", () => {
    const report = createRehearsalBrowserDiagnostics(origin);
    report.pageError({ name: "ChunkLoadError", message: "Loading chunk private-900-70-0033 failed" });
    report.pageError({ name: "private-identifier", message: "hydration failed for private taxpayer" });
    report.requestFailed(request("https://external.test/private-value?secret=password", "private-type", "private-failure"));
    report.requestFailed(request("invalid-private-value", "fetch"));
    expect(report.snapshot().events).toMatchObject([
      { kind: "page-error", category: "chunk-load", name: "ChunkLoadError" },
      { kind: "page-error", category: "hydration", name: "other" },
      { route: "external", sameOrigin: false, resourceType: "other", networkCode: "unclassified" },
      { route: "invalid", pathSha256: null },
    ]);
    expect(JSON.stringify(report.snapshot())).not.toContain("private");
  });

  it("bounds failure events and returns independent snapshots", () => {
    const report = createRehearsalBrowserDiagnostics(origin);
    report.response({ status: () => 200, request: () => { throw new Error("Successful responses need no inspection"); } });
    for (let n = 0; n < 125; n++) report.pageError(new TypeError("Synthetic failure"));
    const result = report.snapshot();
    expect(result.events).toHaveLength(100); expect(result.dropped).toBe(25);
    result.events[0].category = "changed";
    expect(report.snapshot().events[0].category).toBe("javascript");
  });
});
