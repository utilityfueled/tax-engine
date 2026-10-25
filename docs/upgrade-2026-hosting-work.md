# Hosting and recovery implementation evidence

## Browser recovery — 2026-10-24

The saved-returns screen now provides encrypted backup and restore. The versioned
payload preserves the raw guided answers (including private identifiers, explicit
zero and unknown or absent tax year), workspace facts, and original document
bytes. Restore creates a new local return and clears derived previews. Redacted
review bundles are still separate and cannot be used for recovery.

Encryption uses Web Crypto AES-256-GCM, a random 96-bit IV, and a random 128-bit
salt with PBKDF2-SHA256 at 600,000 iterations. The format/version is authenticated.
Passwords are not saved or sent to a provider. Source files have SHA-256 integrity
checks inside the authenticated payload. Missing originals prevent backup;
unavailable durable IndexedDB prevents import from reporting success. Payloads
are limited to 64 MiB, with a 96 MiB encrypted-input limit. Import verifies before
writing and rolls back partial writes on quota, cancellation or storage failure.

Deleting a return, resetting it, or removing an upload now also deletes the
corresponding original bytes. Cache keys use an unambiguous pair; legacy keys are
accepted only when stored ownership matches. Failed localStorage writes invalidate
the in-memory workspace cache.

Verification:

- 18 recovery and document-cache unit tests exercise encryption randomness,
  tampering/wrong password, source integrity, missing files, legacy year retention,
  zero/large exact strings, scoped deletion, cancellation and storage rollback.
- Final focused integration run: 75/75 across recovery, cache, persistence and
  workspace storage. Concurrent taxpayer-facts work corrected incomplete W-2
  fixtures; their tax expectations were preserved.
- Chromium production-build test passes and exercises upload, encrypted download, deletion,
  reload, wrong-password rejection, restore as a new return, exact guided-answer
  retention, reopening and byte-for-byte original-file recovery.
- Local evidence logs live under `.local/upgrade-evidence/recovery-*`. These are
  synthetic local checks, not hosted staging or independent security approval.

Remaining: independent security/privacy review, cross-browser/target-platform
rehearsal, hosted account recovery/isolation/outage/billing/migration/restore and
final release-image qualification. No hosted staging credentials or authority
have been supplied in this execution.

## Document-request privacy regression — 2026-10-24

Ten new synthetic regressions first failed because labelled names without a
second detectable identifier could pass through redaction. The multiline stop
condition matched every letter without regard to case. Inline colon-separated,
mixed-case and accented names also escaped the original uppercase patterns.

Header redaction now handles these names and complete labelled mailing blocks,
while preserving transaction dates, amounts and financial field boundaries.
The provider guard separately rejects unredacted labelled names before the task
executor runs. Tokens remain scoped to one document. Verification: 213 tests in
seven privacy, document, provider-adapter and detection suites; web typecheck and
scoped lint pass. This is a synthetic regression result, not a claim that regex
redaction proves absence of all possible identifiers or an independent privacy
approval. The independent review and representative PII evaluation remain open.

## Hosted shell allowlist — 2026-10-24

Six new regressions first reproduced full local records being sent by the browser
and private filenames/free text/unknown fields surviving server filtering. Hosted
saves now validate and serialize only the metadata allowlist before any request.
PostgreSQL independently repeats that validation. Labels, prompts and event
messages come from the application catalog; filenames, answers, amounts, extra
properties, source keys, previews and structured facts remain on the device.
Local records are unchanged. Unknown/missing source years are preserved, and
malformed metadata fails without echoing private values.

Legacy PostgreSQL reads also apply the allowlist. This does **not** erase private
values from pre-existing rows or backups: a separately authorized and rehearsed
data migration/backup-retention procedure is still required for an existing host.

Verification: 127 focused privacy/persistence/security/recovery tests; a further
51-test run includes four real disposable-PostgreSQL cases proving stored JSONB
contents, same-ID tenant isolation for read/list/upsert/delete, safe legacy reads,
and retention of the previous row on rejected updates. Web types and scoped lint
pass. The database tests use a uniquely named temporary schema, never a normal
or staging `DATABASE_URL`. These results do not establish hosted staging readiness.

## Browser document-analysis transport

Income and expense analysis now share the same local preparation boundary:
extract/redact text on the device, reject empty or still-identifying text, and
send random upload names instead of original filenames. Responses must identify
one unique upload; original filenames are restored only in the local result.
This prevents a private filename from bypassing text redaction and prevents a
duplicate or unrelated response from becoming another upload's facts. Raw files
remain absent from these requests.

Eight regressions first failed. All 44 focused transport, parser and grounded
document-task tests now pass, including both analysis flows, local parse errors,
invalid formats, server failures, repeated response IDs and unknown response IDs.
Web typecheck and scoped lint pass. No live model/provider request was made.
## Billing failure boundaries — 2026-10-24

Subscription checkout, AI-credit checkout and portal routes now contain auth,
protection, database and provider failures inside a generic 503 response with
`no-store` and a five-second retry hint. They never return upstream exception
messages. Workspace IDs require strings before inspection; null and malformed
values reject before payment work. Preview redirects use URL query parameters
and preserve existing queries/fragments.

Eleven initial regressions failed before implementation. The final focused run
passes 126 tests across billing, authentication/security and the new boundary
suite; web typecheck and scoped ESLint pass. Tests exercise account-bound Stripe
request construction through a mock of the web workspace's exact installed SDK,
entitlements, duplicate subscription prevention, malformed input, dependency
outages and self-host bypass. These are synthetic dependency tests, not live
Stripe, Redis, hosted authentication or staging evidence. Evidence logs:
`.local/upgrade-evidence/billing-boundaries-{red,green,types}.log`.
