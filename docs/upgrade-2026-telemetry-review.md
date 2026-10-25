# Telemetry privacy and Sentry 11 review

Reviewed 2026-10-24. Sentry remains pinned to **10.76.2**. There is no silent major
upgrade. The [official migration guide](https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md)
documents the version 11 collection configuration (`dataCollection` replaces
`sendDefaultPii`) and instrumentation changes. The declared minimum Next/React/
webpack versions are below this checkout's versions, but compatibility alone
does not establish privacy or runtime qualification. A version 11 migration
requires a separate change and another SDK-envelope/privacy test.

The previous `sendDefaultPii: false` setting did not cover arbitrary error text,
breadcrumbs, context, request data or attachments. The new shared error hook
builds a fresh allowlisted event: standard exception type, generic message,
bounded line/column numbers, generated event identity and timestamp. It discards
source paths, function/local values, user, URLs, headers, query parameters,
extras, tags, request bodies and attachments. Free-form messages are dropped.
Transactions, logs, breadcrumbs and trace propagation are disabled. This is
intentionally limited diagnostic data; richer telemetry requires privacy review.

Automatic Vercel page analytics has been removed from the application layout.
It previously mounted even for self-hosted returns. No analytics script is
needed for local tax preparation or recovery.

Evidence:

- Five tests cover sensitive fields, attachments, invalid/oversized events and
  an actual installed Sentry SDK pipeline with an in-memory transport. The SDK
  envelope contains no synthetic identifier or document attachment. No network
  telemetry is sent by these tests.
- Web typecheck passes; relevant security tests and browser verification remain
  part of the whole-release checks. Local tests are not a hosted privacy review.
- Sentry's [sensitive-data guidance](https://docs.sentry.io/platforms/javascript/guides/nextjs/data-management/sensitive-data/)
  was retrieved live and explicitly distinguishes SDK filtering before sending
  from server-side filtering after receipt. Vercel's [redaction guidance](https://vercel.com/docs/analytics/redacting-sensitive-data)
  confirms that route/query data needs explicit handling.

Remaining external evidence: independent security/privacy review and a staging
capture with the deployed telemetry configuration. Operator-controlled Sentry
account retention and IP-address controls must also be verified in that review;
code-level payload filtering is not proof of provider-side retention behavior.
