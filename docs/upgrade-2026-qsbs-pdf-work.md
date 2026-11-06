# QSBS review packet and Form 8949 continuation pages

## Scope and sources

2026-10-25: reviewed the current official [Form 8949 instructions](https://www.irs.gov/instructions/i8949), [Schedule D instructions](https://www.irs.gov/instructions/i1040sd), and [Form 6251 instructions](https://www.irs.gov/instructions/i6251). The registered final 2025 templates remain review-only. This work does not qualify 2026 forms or filing exports.

Each Form 8949 part contains one reporting category and at most eleven rows. Additional copies retain every transaction, editable fields, widget appearances and page-specific Decimal totals. A fund-only issuer exclusion uses Box F and transfers to Schedule D line 10 while preserving the full distribution on line 13. The source-verified pre-2010 preference transfers to Form 6251 line 2h.

Original complete identities are validated before identifier redaction. An opaque, in-memory render context accepts only its complete original input or the exact fully redacted copy. Changed amounts, changed retained identifiers and fabricated contexts fail; no identity is reconstructed. Source calculations and canonical audit entries must agree before export.

## Verification and review

- Spec preceded the failing tests. Initial missing-module and behavior failures are retained in local evidence logs. Four regression cases cover 27 transactions over eight pages, page totals, complete field/widget persistence through independent pypdf reopen, fund-only packets, unique audit matching, source changes and closed year/filing gates.
- Initial immutable source tree `5eb6d8a427171e2565e2c04d05d895ba18c0d737`, based on `3aed6e8`: 623 tests in 90 files passed; root/web types, 4,416 spec references, scoped lint (zero errors, two existing warnings) and production build passed.
- Independent agent review found that the initial context accepted a changed nonblank SSN. A regression first reproduced the failure. The original-or-fully-redacted digest fix passes all four cases; the independent probe now rejects the contradictory identifier with and without a prepared context. Tokens serialize to an empty object.
- The production browser fixture initially omitted the required `other-taxes` visit. Completing that synthetic fixture, without altering readiness checks, passed both 1280px and 390px download tests with zero retries. The downloaded packet retains issuer, exclusion and proceeds, omits full identifiers and the private source-packet reference, and carries the review notice.
- Generated eight-page Form 8949, two-page Schedule D and three-page Form 6251 QA PDFs reopened with pypdf and rendered with Poppler. Inspected transaction, fund, Schedule D transfer and AMT preference pages have the expected amounts and blank identifiers. Fresh footer crops confirm visible review notices on the initially clipped full-image previews.
- Independent agent re-review found no remaining actionable issue in the eight implementation/test paths after the identity fix. This is software review, not independent human tax or form qualification.

Local evidence is under `.local/upgrade-evidence/section1202-pdf-*`, `agent-qsbs-pdf-identity-rereview.log`, `agent-qsbs-context-identity-fixed.log` and `agent-qsbs-*-footer.png`.

Final production and test tree `b7b564b7d9bdf0ee337363583b9104ba965f373f`, based on
`3629ce005187934a9c4f26ceafb6a17c258f03cc`, passes all 1,174 tests in 133 files
(`tests/pdf`, workspace filled-return checks and strict spec-reference checks).
Root/web types, all 4,437 spec references, scoped lint (zero errors, two existing
warnings), production build and both desktop/mobile download cases pass. Browser
retries are zero. Exact final logs use the `section1202-pdf-b7b-` prefix.

The earlier broad run stalled on the existing packet test's unbounded Python
stdin read. Its stack trace was captured, and the test was separately repaired
in `3629ce0` to reopen the already-written file with a bounded process timeout.
Both original flattening assertions remain intact and pass in the final suite.
The interrupted run is not counted as passing evidence. This package still
provides local synthetic review-output evidence only; final 2026 forms,
independent human qualification and complete-data filing exports remain gated.
