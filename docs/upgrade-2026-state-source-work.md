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
