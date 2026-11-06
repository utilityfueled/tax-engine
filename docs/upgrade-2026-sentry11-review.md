# Separate Sentry11 review

Decision, November3UTC: retain `@sentry/nextjs`10.76.2 for this upgrade. No SDK,
lockfile, telemetry option or runtime behavior changes in this review. Revisit
on a relevant advisory or by November7, whichever comes first; the active
upgrade maintainer owns that follow-up. Human security/privacy review remains
unassigned and required by the execution brief.

The [official release](https://sentry.io/changelog/javascript-sdk-v11/),
[pinned11.0.0 migration guide](https://github.com/getsentry/sentry-javascript/blob/11.0.0/MIGRATION.md)
and [Next.js migration page](https://docs.sentry.io/platforms/javascript/guides/nextjs/migration/v10-to-v11/)
were reviewed separately from the Next maintenance update. Version11 replaces
the existing PII option with category controls, broadens collection defaults,
changes tracing lifecycle/hooks and removes the logging-disable option. An
unchanged options spread or successful compilation would therefore be
insufficient privacy evidence. Its minimum runtime/framework requirements fit
the pinned Node24/TypeScript5.9/Next16 stack; that does not qualify its behavior.

## Current repository evidence

The client, server and edge entry points all spread the same private telemetry
options. Those options disable traces and log capture, discard breadcrumbs and
transactions, and construct error events from an allowlist. The sanitizer clears
attachments, user/request/context/extra fields, free-form messages, paths and
untrusted exception types. The installed-SDK transport control verifies the
sanitized envelope rather than relying only on the helper return value.

These files are unchanged from the complete1286 unit run and remain unchanged
at44e752d0. This review does not rerun or relabel their historical checks as
new SDK11 tests. It also does not establish live Sentry delivery or replace a
human privacy review.

A future major-version candidate must explicitly disable every additional
collection category and verify actual installed-SDK envelopes across client,
server and edge error, attachment, log, span and integration paths. It must
retain the existing allowlist and tests, include SDK-added data after hooks,
verify webpack instrumentation and source-map boundaries, and preserve
self-hosting with telemetry disabled. No broader collection is authorized.

## Fresh advisory and source receipts

At44e752d0, fresh `pnpm audit --json` and `pnpm audit --prod --json` both exit0
with zero reported advisories across522 and426 dependencies. Exact output hashes:

- All: `5a53e55cf00fe12cf2baa62be93e62a01b390225c1294be768cb4472b14a3b2a`.
- Production: `e9cae4590babf78b982f74a1e3636a81d566e5b8ecfa70633c19f69b677dbdb4`.

The [Next security announcement](https://nextjs.org/blog/upcoming-nextjs-security-release-november-2026)
and [maintainer advisories](https://github.com/vercel/next.js/security/advisories)
still showed advance notice and no published November3 fix at this retrieval.
Next16.4.4 remains maintenance, not evidence of fixing those forthcoming issues.
Registry audits do not close that gate or the separate image-advisory review.

Ignored evidence: `.local/upgrade-evidence/nov03-sentry11-review/` and
`nov03-parent-current-advisory-audit/`. The official pinned migration source is
SHA256 `49af7456a1c41c61304e12542c2327db2018bbd5ccaca48c89ffb186dce5cce6`.
The web reader rejected the Next.js page's content type; direct HTTP200 retrieval
is retained separately, SHA256
`f6735cf7d67e0e94025fd2a26e0c66018f548b65240f914b39f98071d392e28f`.
The latter response was HTML; its script/style-free text was inspected locally.
