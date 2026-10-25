# Digital capital reporting and review evidence

This package continues the actual Form1099-DA source core in `e7bd6e8`.
It implements capital reporting categories and the existing 2025 review packet.
The 2026 final-form, filing, professional-review and release gates stay closed.

## Sources and scope

Refreshed on 2026-10-25:

- [Final2025 Form8949](https://www.irs.gov/pub/irs-pdf/f8949.pdf), PartI/II checkbox text, columns(d)–(h), Line2 and ScheduleD transfers.
- [Form8949 instructions](https://www.irs.gov/instructions/i8949), original document reconciliation, separate reporting parts and whole-dollar convention.

The physical form distinguishes original1099-B categories A/B/D/E from
original1099-DA categories G/H/J/K. Digital dispositions reported on neither
document use I/L; other dispositions with neither use C/F. A digital-asset flag
alone does not turn an actual1099-B into1099-DA. Original records without the new
discriminator retain their1099-B collection meaning. Unsupported or incomplete
actualDA sources still reject at the shared source boundary.

All twelve categories retain exact Decimal proceeds, basis, adjustments and gain.
The ScheduleD review combines A+G into1b, B+H into2, C+I into3, D+J into8b,
E+K into9 and F+L into10 before the existing whole-dollar display. Every
disposition appears once on8949, with separate category parts and eleven rows
per page. Actual rawDA-only returns now select8949 even when original1099-B is
empty. Prepared reviews bind original digital sources and crypto context; all
source columns reconcile with the canonical return before packet export.

## Verification

The spec entries preceded the failing category and PDF cases. The first five
cases failed before implementation (`form-8949-digital-red.log`). An additional
rawDA-only packet case reproduced the omitted original source before shared
normalization (`form-8949-digital-raw-red.log`). The independent Python parser
test initially assumed one checkbox export state; inspection of the registered
IRS template established its six distinct states and corrected that assertion.

Independent literal category controls total295.40 short-term and2950.40
long-term, or3245.80 combined. TwelveG rows plus the other eleven categories
produce fourteen pages with every transaction exactly once, unique registered
AcroForm widgets, correct checkboxes and source totals. A second PDF parser
reopens every page and verifies review notices and redacted identifiers. Actual
DA proceeds100.49 minus basis90.24 produce10.25 gain and printed100/90/10.
Same-net tampering of proceeds and basis, changed source context and filing
requests reject. No final2026 PDF or filing capability is enabled.

Initial integration passes23 checks in five files, and the independent-parser
cohort passes four cases. Root types pass; scoped lint has zero errors and two
existing non-null warnings in the packet filler. The initial533-case adjacent
run had532passes and one concurrent red regression in the separately owned DA
source core; that core was subsequently corrected and independently reviewed
before `e7bd6e8`. This is not recorded as a passing package run.

The working-tree mixed-category document and ScheduleD were rendered; all seven
digital/continuation pages and ScheduleD were inspected for boxes, amounts,
redaction and placement. The review notice is present on every page in both
parser output and rendered pixels. Final immutable checks, bounded independent
agent review and the commit reference are recorded below when complete.

Evidence files live under `.local/upgrade-evidence/` and use the
`form-8949-digital-*` or `digital-reporting-*` prefixes. These are synthetic local
software controls; they do not establish independent human tax qualification.

Final immutable tree `91a28cb1dbe63589cf8526295a86b92f877daf3b`, based on
`e7bd6e86c5bbc334c89eab649c14e64701299431`, passes1,756 tests in145 files,
including every existing PDF test, actualDA sources and adjacent capital cases.
Root/web types, all4,603 strict spec references, engine build and production
webpack web build pass. Scoped lint has zero errors and the same two existing
warnings. Logs are `digital-reporting-final-{adjacent,checks,build}.log`.

The independent federal agent reopened the official form/instructions and
reviewed the exact source tree. All six new engine/PDF cases and a separate
mixed original QSBS-plus-rawDA normalization/source-immutability probe pass,
with no actionable finding (`federal-review-digital-reporting.log` and
`federal-review-digital-probes.log`). This is bounded agent review only.
The exact tree also generated fresh review PDFs. Rendered boxes, amounts,
identifiers and placement were rechecked; each inspected digital page and
ScheduleD has464 visible red review-notice pixels at85dpi. Independent parser
checks cover all fourteen pages. Rule versions2025.69/2026.65 record the source
provenance while preserving every existing qualification gate. The final ledger
append changes no executable source or test.

## Original-source packet completeness follow-up

The readiness audit reproduced a raw1099-DA-only packet being marked complete
when Form8949 detail was missing. The predicate previously checked only the
original1099-B collection. It now also checks actualDA transactions; a zero-gain
disposition still requires its detail page. Including8949 removes only this
finding and preserves disabled filing and unvalidated business-rule status.

The spec entry preceded the failing regression (`digital-readiness-red.log`).
Exact tree `d7361963c61e824f7f73c79b2a0a0a7d34db7d5a`, based on `9da0bab`,
passes27 readiness, digital-source and PDF tests in three files, root types and
all4,607 spec references. The separate AI agent reviewed the exact predicate and
passed22 readiness cases, including independent absent/empty-source controls,
with no actionable finding. Logs are `digital-readiness-isolated-{tests,types,
spec}.log` and `agent-digital-readiness-{review,probes}.log` under the local
evidence directory. This changes packet completeness only; no tax arithmetic,
filing qualification, final-form status or threshold is changed.
