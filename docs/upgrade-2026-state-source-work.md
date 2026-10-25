# State source integration

## Ohio original issue discount — 2026-10-25

Sources refreshed from the final 2025
[Ohio IT1040 booklet](https://dam.assets.ohio.gov/image/upload/v1767095693/tax.ohio.gov/forms/ohio_individual/individual/2025/it1040-booklet.pdf),
Schedule of Adjustments line26 and IT1040 line14, and the continuous-use
[IRS1099-OID](https://www.irs.gov/pub/irs-pdf/f1099oid.pdf), January2024
boxes12–14. Actual reconciled Treasury OID/coupon interest is deducted once;
market discount remains taxable. Municipal OID requires an explicit non-Ohio
issuer allocation, including actual zero. Unverified legacy classification
cannot establish an Ohio source exemption.

Actual Ohio withholding rows now reach the calculation, adapter and reference
PDF; other-state rows are excluded. Decimal aggregation preserves cents and
amounts above Number's exact integer range. Invalid amounts and duplicate rows
reject. The three initial source regressions failed before implementation.
All 132 focused state/PDF checks pass, followed by 12 PDF checks after adding
the OID source to the existing packet assertion. Root types, all 3,448 current
spec references and scoped lint pass (zero errors, fifteen non-null warnings).
The generated reference summary was rendered and inspected with its actual
10.11 source and total. No filing qualification is implied.

Evidence under `.local/upgrade-evidence/`: `oh-oid-red.log`, `oh-oid-green.log`,
`oh-oid-pdf-final.log`, `oh-oid-types.log`, `oh-oid-spec.log`, `oh-oid-lint.log`,
`oh-oid-pdf/` and `oh-oid-withholding-review.png`.

Remaining: Ohio deductions must use only amounts actually included in federal
AGI, including bond education exclusions and taxable refunds. Care-credit
forwarding must use actual printed line9c. PA OID requires its distinct premium
and exemption reconciliation, and rental records must apply actual ownership
once before owner-separated loss limits. State launch demand, final2026 forms
and independent human review remain external prerequisites.

## Ohio federal inclusion limits — 2026-10-25

The same final booklet's Schedule of Adjustments lines26/28 limit deductions
to income included in federal AGI, and the care worksheet on page45 uses
Form2441 line9c. The adapter now subtracts actual prior-reported bond interest
and the education exclusion before taking the Treasury deduction, uses the
calculated taxable refund, and forwards the unique actual care audit entry.
Missing, duplicate, nonfinite or negative care audit values reject; an explicit
reconciled override, including zero, is preserved.

All three new regression cases failed before implementation. All 128 focused
state/packet/PDF checks now pass, root types pass and lint has zero errors
(113 existing non-null warnings in the large adapter fixture file). Two legacy
fixtures now supply actual synthetic federal worksheet facts: the refund
expectation remains1,000, and the incorrect care expense expectation is corrected
from3,000 to the official line9c credit600. Tests also cover partial/zero taxable
refunds, a fully excluded savings bond, actual prior-year care credit and audit
failure paths. Evidence: `oh-inclusions-{red,green,types,lint,spec}.log` under
`.local/upgrade-evidence/`. This remains local synthetic evidence.

## Pennsylvania rental ownership — 2026-10-25

The final [2025 PA Schedule E instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40e.pdf),
Section II line a and line 25, require actual ownership and separately computed
spouse income/loss. Whole-property rents and expenses now receive their actual
ownership fraction once. The taxpayer's loss no longer offsets a separately
owned spouse property merely because the old adapter grouped all direct rents
as joint. The existing short-rental business path also receives actual owner
and share before Class 4 loss limits.

All three new tests failed first. The initial 290-test package run passed all
289 surrounding assertions and exposed a test setup that exercised the schema
instead of the intended nonfinite calculation guard. The corrected three-case
source run passes; root types and scoped lint pass. Historical unconfirmed
preview assumptions remain explicitly unqualified; confirmed joint records
require separate supported allocations. Exact sub-cent shares and amounts over
Number's exact range are covered without changing monetary assertions.

Evidence: `pa-rental-{red,green,types,lint,spec}.log` and
`pa-rental-source-final.log` under `.local/upgrade-evidence/`.
Remaining software work includes actual PA rental/business classification:
annual rental days cannot establish average customer stay for a year-round
property. That is separate from this ownership correction. Personal-use
allocation, PA depreciation differences, joint allocation records and complete
state-specific source qualification remain bounded gaps.

## Pennsylvania OID source reconciliation — 2026-10-25

Refreshed the official [PA PIT Guide interest chapter](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/interest)
and [final 2025 PA Schedule A](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40a.pdf).
The state adapter now includes verified federal OID and actual PA withholding
once. A source-linked PA worksheet identifies issuer treatment, stripped-bond
allocation and the actual PA premium method. Federal coupon premium reductions
are tracked separately from excess premium deductions; actual premium already
netted on the statement is an explicit additional source fact. Federal premiums
are added back before applying the PA amount. Current market discount stays
taxable, including for direct obligations. Exempt amounts reach Schedule SP.

Missing, duplicate, unmatched or contradictory worksheets reject; zero remains
zero. Same-account forfeited interest cannot consume another source's income.
An excess forfeiture requires a disposition worksheet and remains unsupported
in this bounded path. The guided state worksheet UI, owner-separated Schedule A
filing output, final 2026 forms and independent human review remain unqualified.
No exemption is inferred merely from a federal Treasury label.

The first run reproduced three missing source behaviors and caught one test
accessor error. Initial integration exposed older fixtures with absent OID arrays;
the historical no-document path is preserved. Final verification passes all
314 focused federal/state/PDF tests, root types, all 3,469 spec references and
scoped lint with no warnings/errors. The diff was reviewed. Evidence lives in
`.local/upgrade-evidence/pa-oid-{red,green,types,spec,lint}.log`. These are local
synthetic checks, not final-form or staging qualification.

## Pennsylvania actual rental classification — 2026-10-25

The official PA rental-income guide's commercial-enterprise test uses actual
customer-use periods and activity facts. A year-round seven-day booking activity
now reaches Class 4; annual occupancy no longer substitutes for customer use in
confirmed sources. The 30-day boundary, public offering, continuity, business
hours/services/operating expenses, real-estate sales/dealer facts and related
party restriction are explicit. An activity without profit intent needs its
separate deduction rules. Source-confirmed/current-year unknowns reject. Legacy
unconfirmed previews retain historical amounts with an explicit unverified
audit; they do not establish current support. Ownership is applied once before
the separate spouse loss limits.

The PA interview collects these facts without defaults and preserves the actual
source reference. Edits clear classification and source confirmation. Existing
profit-intent/services facts feed the state classifier; separate unsupported
federal rental worksheets remain gated. No hotel occupancy-tax filing or local
license registration is added.

Both new calculation cases and the new DOM interaction failed first. Final
checks pass 292 focused state/source/DOM/PDF tests and 381 adjacent guided tests;
root and web typechecks pass. Scoped lint has zero errors and six existing
non-null warnings in the shared bridge. The diff was reviewed. Current global
spec validation resolves this package but initially sees the concurrently
unfinished care-benefits DOM test; that is separate from these passing checks.
Evidence: `.local/upgrade-evidence/pa-rental-class-{red,ui-red,green,guided,types,web-types,lint,spec}.log`.

Remaining: PA-specific depreciation, personal-use and joint owner allocations,
OID guided worksheet controls and separate-owner final filing output still need
implementation/qualification. State demand, final 2026 forms and independent
human review remain external requirements.
