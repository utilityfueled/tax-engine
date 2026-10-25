# Dependent-care source and form work

Status: active implementation; no final 2026 form or filing qualification.

## Printed audit and prior-year credit — 2026-10-25

Official sources refreshed: [Form 2441](https://www.irs.gov/pub/irs-pdf/f2441.pdf)
(final 2025 revision, created 2025-03-18) and
[instructions](https://www.irs.gov/instructions/i2441), printed lines 4–11 and
the prior-year expense Worksheet A. Final 2026 physical mapping remains unavailable.

The audit now preserves actual taxpayer and spouse earned income separately from
the line 6 limit. Line 9a records the current tentative credit before the tax
limit; actual completed prior-year worksheet credit flows through 9b/9c. Missing
historical prior-year credit remains unknown and is absent from those audit lines;
2026 requires an explicit amount, including a confirmed zero. This does not
compute or independently qualify a prior-year worksheet. Historical combined
income adapters remain explicitly unverified for individual printed income.

Spec-first checks: the three new source-audit regressions failed before the
change. All 76 core/integration tests pass, root types pass, all 3,347 current
spec references resolve and scoped lint has zero errors (eight existing warnings).
Evidence: `.local/upgrade-evidence/care-audit-core-integration.log`,
`care-core-types.log`, `care-core-spec.log` and `care-core-lint.log`.
Expected values were manually
derived from the official formula, not independently human reviewed.

Remaining: actual provider and qualifying-person source records, their guided
confirmation and PDF rows; audited PDF amounts and canonical/widget/render
verification; benefits Part III and prior-year worksheet qualification; human
tax review and final forms.
