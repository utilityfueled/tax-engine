import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import type { ErrorEvent, EventHint } from "@sentry/nextjs";
import { sanitizeTelemetryError, PRIVATE_TELEMETRY_OPTIONS } from "../../../apps/web/src/lib/telemetry-privacy";

const requireWeb = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
const { NodeClient, Scope } = requireWeb("@sentry/nextjs") as typeof import("@sentry/nextjs");

describe("telemetry privacy boundary", () => {
  it("discards taxpayer text from every event surface and attachments", () => {
    const secret = "Synthetic Person 900-70-0011 account=123456789 wages=12345.67";
    const event: ErrorEvent = { type: undefined, event_id: "a".repeat(32),
      timestamp: 1_700_000_000, message: secret, logentry: { message: secret, params: [secret] },
      user: { id: secret, email: secret, ip_address: secret }, request: { url: secret, data: secret, headers: { authorization: secret } },
      extra: { sourceDocument: secret }, contexts: { return: { raw: secret } },
      breadcrumbs: [{ message: secret, data: { value: secret } }], tags: { returnId: secret },
      server_name: secret, transaction: secret, fingerprint: [secret], release: secret, environment: secret,
      exception: { values: [{ type: "TypeError", value: secret, stacktrace: { frames: [{
        in_app: true, filename: secret, function: secret, context_line: secret,
        vars: { tax: secret }, lineno: 12, colno: 7,
      }] } }] },
    };
    const hint: EventHint = { attachments: [{ filename: secret, data: secret }], originalException: new Error(secret) };
    const result = sanitizeTelemetryError(event, hint);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result).toEqual({ type: undefined, event_id: "a".repeat(32), timestamp: 1_700_000_000,
      platform: "javascript", level: "error", tags: { privacyPolicy: "minimal-error-v1" },
      exception: { values: [{ type: "TypeError", value: "Application error; details omitted for privacy.",
        stacktrace: { frames: [{ filename: "application", in_app: true, lineno: 12, colno: 7 }] } }] } });
    expect(hint.attachments).toEqual([]);
    expect(event.message).toBe(secret);
  });

  it("drops free-form messages and custom exception types", () => {
    expect(sanitizeTelemetryError({ type: undefined, message: "sensitive" }, {})).toBeNull();
    expect(sanitizeTelemetryError({ type: undefined, exception: { values: [] } }, {})).toBeNull();
    const result = sanitizeTelemetryError({ type: undefined, exception: { values: [{ type: "CustomerSSN900700011", value: "secret" }] } }, {});
    expect(result?.exception?.values?.[0]).toEqual({ type: "Error", value: "Application error; details omitted for privacy." });
  });

  it("omits untrusted stack frames, invalid identifiers and timing", () => {
    const result = sanitizeTelemetryError({ type: undefined, event_id: "private-id", timestamp: Infinity,
      exception: { values: [{ stacktrace: { frames: [
        { in_app: false, lineno: 1 }, { in_app: true, lineno: -1 },
        { in_app: true, lineno: 1.5 }, { in_app: true, lineno: 0 },
        { in_app: true, lineno: 8, colno: NaN },
      ] } }] } }, {});
    expect(result?.event_id).toBeUndefined();
    expect(result?.timestamp).toBeUndefined();
    expect(result?.exception?.values?.[0]?.stacktrace?.frames).toEqual([
      { filename: "application", in_app: true, lineno: 8 },
    ]);
  });

  it("bounds event size and disables free-form telemetry channels", () => {
    const values = Array.from({ length: 100 }, () => ({ type: "Error", stacktrace: {
      frames: Array.from({ length: 100 }, (_, i) => ({ in_app: true, lineno: i + 1 })),
    } }));
    const result = sanitizeTelemetryError({ type: undefined, exception: { values } }, {});
    expect(result?.exception?.values).toHaveLength(5);
    expect(result?.exception?.values?.[0]?.stacktrace?.frames).toHaveLength(50);
    expect(PRIVATE_TELEMETRY_OPTIONS.tracesSampleRate).toBe(0);
    expect(PRIVATE_TELEMETRY_OPTIONS.enableLogs).toBe(false);
    expect(PRIVATE_TELEMETRY_OPTIONS.tracePropagationTargets).toEqual([]);
    expect(PRIVATE_TELEMETRY_OPTIONS.beforeBreadcrumb()).toBeNull();
    expect(PRIVATE_TELEMETRY_OPTIONS.beforeSendTransaction()).toBeNull();
  });

  it("sends only sanitized data through the installed SDK transport", async () => {
    const sent: unknown[] = [];
    const client = new NodeClient({ dsn: "https://public@example.invalid/1", integrations: [],
      ...PRIVATE_TELEMETRY_OPTIONS,
      transport: () => ({ send: async (envelope) => { sent.push(envelope); return { statusCode: 200 }; }, flush: async () => true }),
    });
    const secret = "Synthetic tax document 900-70-0011";
    const scope = new Scope();
    scope.setUser({ email: secret }); scope.setExtra("document", secret);
    scope.addAttachment({ filename: "tax-document.pdf", data: secret });
    client.captureEvent({ exception: { values: [{ type: "TypeError", value: secret }] },
      request: { url: `https://example.invalid/returns/${secret}`, data: secret } },
    { attachments: [{ filename: secret, data: secret }] }, scope);
    await client.flush(1000);
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent)).not.toContain(secret);
    expect(JSON.stringify(sent)).not.toContain("tax-document.pdf");
    expect(JSON.stringify(sent)).toContain("minimal-error-v1");
    await client.close();
  });
});
