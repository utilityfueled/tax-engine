# Public privacy descriptions match the implemented storage boundary

The October 26 source audit on `0d046799` found three outdated statements:
ordinary stored data was described as encrypted at rest, review downloads were
described as omitting all identifiers, and local deletion instructions mentioned
only localStorage. The app also retains original documents in IndexedDB.

The README, Help and Privacy pages now describe the existing behavior. Drafts
and cached originals are not encrypted by the application; the separately
downloaded password-protected recovery archive is encrypted. Review PDFs remove
personal tax identifiers but retain names, financial data and explicit business
EINs. The return deletion path removes local facts and originals. Clearing only
localStorage is insufficient to remove IndexedDB files, and deleting a return
does not remove copies already downloaded to a device.

The cookie description no longer assumes one cookie across a configurable
authentication library. Technical request metadata is not described as
inherently non-identifying. HTTPS and storage encryption are accurately scoped
to the operator's infrastructure. This changes technical disclosures only; it
does not change storage, redaction, telemetry, permissions, legal rights or any
readiness gate, and does not establish an independent security or legal review.

Source traces: `apps/web/src/lib/workspace-storage.ts`,
`workspace-document-file-cache.ts`, `workspace-persistence.ts`,
`workspace-recovery.ts`, `hosted-auth.ts`, and
`src/pdf/redact-review-identifiers.ts`. Existing privacy, recovery and redaction
regressions remain unchanged. Bounded checks and separate review are recorded
below before delivery.

The unchanged recovery, identifier-redaction and support-disclosure suites pass
20 tests in three files. Web TypeScript and scoped lint pass, with zero lint
errors or warnings. No new assertion or test was added for these copy changes.
The exact logs and hashes are retained in
`.local/upgrade-evidence/public-privacy-copy-validation.json`. Separate source
review then verified all four frozen file hashes and traced the storage,
recovery, deletion, PDF, cookie and request-metadata claims to the implementation.
It found no actionable technical-copy discrepancy. Its report is
`ai-public-privacy-copy-review.json`, SHA-256
`ecdc727634999f1442ddcdaac8b82845cf5ebf0914fa57ac10b71e8bb96b6843`.
This is agent source review, not human legal or deployed-security approval.

Integration onto `c08a005b` preserves the three reviewed public-page blobs
exactly; only this evidence paragraph changes. The same 20 existing tests in
three files, web TypeScript and scoped lint pass again on the integrated source.
Tax calculations, rule versions, dependencies and readiness gates are unchanged.
The delivery receipt records the final commit, tree and exact pushed branch.
