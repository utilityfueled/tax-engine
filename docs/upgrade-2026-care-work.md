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

## Audited review mapping — 2026-10-25

Core commit: `8262f40`. The official 2025 review mapping now copies the separate
income, tentative credit, prior-year credit and liability-limit audit entries.
It rejects missing, duplicate, nonfinite, wrong-form or scalar/source-conflicting
entries. Unknown historical prior-year or separate-income facts remain blank;
explicit zero remains zero. Every page carries a review-only notice.

All three new mapping tests failed before implementation. All 25 focused core/PDF
checks pass; root types, 3,348 spec references and scoped lint pass (zero errors,
eleven existing warnings). The saved interactive synthetic PDF was reopened:
eleven canonical amounts match their widgets, each changed widget has a nonempty
appearance, and both pages render legibly with review notices. Part I source
rows and Part III are not yet completed; this is not filing qualification.
Evidence under `.local/upgrade-evidence/`: `care-pdf-red.log`,
`care-pdf-green.log`, `care-pdf-canonical.log`, `care-pdf-types.log`,
`care-pdf-spec.log`, `care-pdf-lint.log`, and `care-audit-review.pdf`/page PNGs.

## Actual care source records — 2026-10-25

The guided interview now collects provider names, addresses, actual identifier
status, household-employee answers and payments, plus each qualifying person's
name, identifier, disability/qualification answers and allocated expenses.
Actual prior-year worksheet credit, benefits received and deemed-income answers
are required; source confirmation is revoked by edits. Decimal reconciliation
preserves cents, explicit zero and negative earned income. A prior-year claim
is retained when current expenses are zero. Missing legacy records remain
unknown and incomplete; no facts are backfilled. Identification exceptions
retain their actual status and due-diligence explanation.

Five initial source regressions failed. All 205 focused source/adapter/DOM checks
pass, including provider/person add/remove, unknown household status, source
confirmation, large exact amounts and prior-only claims. Root/contract/web types,
3,353 current spec references and scoped lint pass (zero errors, four test-only
non-null warnings). Evidence: `care-sources-red.log`, `care-sources-integration.log`,
`care-sources-types.log`, `care-sources-contracts.log`, `care-sources-web.log`,
`care-sources-spec.log` and `care-sources-lint.log` under `.local/upgrade-evidence/`.
These are local synthetic checks. Provider/person physical rows and continuation
pages are the next package; benefits Part III is a separate active module.

## Provider/person review form and continuation — 2026-10-25

Source UI commit: `5d0ef3e`. The review mapper now preserves actual source rows,
prints the three highest amounts, and retains additional providers/persons and
identification due-diligence explanations on continuation pages. The physical
provider continuation path and qualifying-person box are corrected; the benefits
flow diagram has no checkbox widget. Household-employment, disability and deemed
income checks copy actual answers. The review identifier-redaction copy is
respected, including provider and person tax IDs. Input sorting is immutable.

The initial source-row regression failed. All 81 focused PDF/credit integration
tests pass; root types and scoped mapping lint pass, and 3,360 current spec refs
resolve. The unrelated legacy credit-stacking assertion now checks actual earned
income at printed line4 and retains its original3,000 cap at line6 and600credit.
Three saved synthetic pages were rendered and inspected, including cropped
footer checks. Canonical source amounts/identifiers match widgets with nonempty
appearances; continuation/deemed-income checkbox values and appearance states
match; remaining records survive on the attachment. See `care-pdf-sources-*.log`,
`care-source-canonical.log`, `care-source-review.pdf` and rendered PNGs under
`.local/upgrade-evidence/`. PartIII and complete prior-year worksheet computation,
final2026 mapping qualification and independent human review remain outstanding.
