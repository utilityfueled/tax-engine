import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const ERROR_TYPES = new Set([
  "Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError", "AggregateError",
]);
function positiveInteger(value: number | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Build a minimal event from an allowlist; never pass arbitrary event properties through. */
export function sanitizeTelemetryError(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  // Attachments are sent separately from the event and need their own boundary.
  hint.attachments = [];
  const values = event.exception?.values;
  if (!values?.length) return null;
  return {
    type: undefined,
    ...(event.event_id && /^[a-f0-9]{32}$/u.test(event.event_id) ? { event_id: event.event_id } : {}),
    ...(typeof event.timestamp === "number" && Number.isFinite(event.timestamp) && event.timestamp > 0
      ? { timestamp: event.timestamp } : {}),
    platform: "javascript", level: "error", tags: { privacyPolicy: "minimal-error-v1" },
    exception: { values: values.slice(0, 5).map((exception) => {
      const frames = exception.stacktrace?.frames?.filter((frame) => frame.in_app === true && positiveInteger(frame.lineno))
        .slice(-50).map((frame) => ({ filename: "application", in_app: true, lineno: frame.lineno,
          ...(positiveInteger(frame.colno) ? { colno: frame.colno } : {}) }));
      return { type: ERROR_TYPES.has(exception.type ?? "") ? exception.type : "Error",
        value: "Application error; details omitted for privacy.",
        ...(frames?.length ? { stacktrace: { frames } } : {}) };
    }) },
  };
}

/** Transactions, spans, breadcrumbs and logs can carry document or return details. */
export const PRIVATE_TELEMETRY_OPTIONS = {
  sendDefaultPii: false,
  enableLogs: false,
  tracesSampleRate: 0,
  tracePropagationTargets: [] as string[],
  beforeSend: sanitizeTelemetryError,
  beforeBreadcrumb: () => null,
  beforeSendTransaction: () => null,
};
