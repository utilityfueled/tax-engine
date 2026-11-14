// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { PRIVATE_TELEMETRY_OPTIONS } from "../../../apps/web/src/lib/telemetry-privacy";
import * as sentryConfiguration from "../../../apps/web/src/lib/sentry";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { expect, it, vi } from "vitest";

const envelopeTypes: string[] = [];
const envelopes: unknown[] = [];
const requireWeb = createRequire(resolve("apps/web/package.json"));
// Load the installed browser export explicitly. The test process otherwise
// resolves Sentry's server export even when it provides a document.
const sentryPackage = dirname(dirname(dirname(requireWeb.resolve("@sentry/nextjs"))));
const browserSdk = requireWeb(join(sentryPackage, "build/cjs/index.client.js")) as typeof import("@sentry/nextjs");
it("keeps only sanitized errors through the installed browser SDK", async () => {
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.invalid/1");
  try {
    const source = readFileSync(resolve("apps/web/src/instrumentation-client.ts"), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    new Script(compiled).runInNewContext({
      exports: {},
      require: (name: string) => {
        if (name === "@/lib/telemetry-privacy") return { PRIVATE_TELEMETRY_OPTIONS };
        if (name === "@/lib/sentry") return sentryConfiguration;
        if (name === "@sentry/nextjs") return {
          ...browserSdk,
          init: (options: Parameters<typeof browserSdk.init>[0]) => browserSdk.init({
            ...options, release: "synthetic-test-release",
            transport: () => ({
              send: async envelope => {
                envelopes.push(envelope);
                envelopeTypes.push(...envelope[1].map(([header]) => header.type));
                return { statusCode: 200 };
              },
              flush: async () => true,
            }),
          }),
        };
        throw new Error("Unexpected instrumentation import");
      },
    });
    // Neither of these should emit session or outcome reporting.
    document.dispatchEvent(new Event("visibilitychange"));
    window.history.pushState({}, "", "/returns/test");
    browserSdk.getClient()?.recordDroppedEvent("before_send", "error");
    const privateText = "Synthetic wages 900-73-0013";
    browserSdk.captureException(new TypeError(privateText));
    await browserSdk.flush(1000);
    document.dispatchEvent(new Event("visibilitychange"));
    await browserSdk.flush(1000);
    expect(envelopeTypes).toEqual(["event"]);
    expect(JSON.stringify(envelopes)).not.toContain(privateText);
    expect(JSON.stringify(envelopes)).toContain("minimal-error-v1");
  } finally {
    await browserSdk.close(1000);
    visibility.mockRestore();
    vi.unstubAllEnvs();
  }
});
