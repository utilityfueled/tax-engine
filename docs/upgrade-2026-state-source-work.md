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
