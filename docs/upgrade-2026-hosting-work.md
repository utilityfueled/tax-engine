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
