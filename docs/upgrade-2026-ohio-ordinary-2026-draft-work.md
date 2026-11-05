# Ohio2026 ordinary source draft

An explicit source entry point composes a finite Ohio2026 draft from actual W2,
domicile and service-period originals through an opaque, revalidated context.
The existing historical federal adapter and public full2026 gate remain unchanged.
Full-year, part-year and nonresident allocation uses actual covered wages rather
than a ratio of resident days. Money aggregation, credits and settlement use Decimal.

The source cohort is single or married filing jointly, living adults under65
with distinct actual joint owners, no children, ordinary corporate W2
wages, and explicitly known absence of other income/adjustments/credits. Complete
current originals, domestic domicile/service records and sufficient equal-quarter
withholding are required. Unsupported facts throw; unknown facts are not zero.
Business, reciprocal, resident-credit, taxing-district, broader payment/penalty
and household branches still require separate implementation/integration.

Official enacted authority: [5747.02](https://codes.ohio.gov/ohio-revised-code/section-5747.02),
[5747.022](https://codes.ohio.gov/ohio-revised-code/section-5747.022),
[5747.05](https://codes.ohio.gov/ohio-revised-code/section-5747.05) and
[5747.09](https://codes.ohio.gov/ohio-revised-code/section-5747.09).
The draft applies2026 rates and exemptions, validated known-zero MAGI adjustments,
personal/joint credits, actual zero EITC, residency credit and cash settlement.

The initial missing-export failure is retained as an integration RED, not an
arithmetic regression. Later genuine source-state/duplicate-person RED yields
3FAIL/37PASS before correction. Final281 tests across9 files, product types,
scoped six-file ESLint with zero warnings,764 Ohio spec references and diff checks
pass. Distinct review adds22 actual-source controls and nine independently
calculated Python Decimal oracles. At42000 income tax is712; actual FY/PY/NR
allocation produces residency credits0/525/655 and net712/187/57. Boundary cases
cover34799/34800, spouse499.99/500 and499999/500000, stale/forged contexts and
invalid source/date/allocation/payment records. These are engineering controls,
not qualified human tax review.

Evidence: `.local/upgrade-evidence/nov05-ohio-ordinary-2026-implementation/`,
manifest`0f5fe756b5524c7576e7be6975d6772e7429a6a7ef057a73b5bdccdf651f37fc`;
distinct `nov05-ohio-ordinary-2026-independent/`, manifest
`1d45e01f43372dcd4957ed48f4c195fc622d740b8ffb4d6cd058d5b64d32f267`.
Root reads all seven changed paths and reports, verifies39 manifest members and
all seven current source pins before committing.

No final2026 physical form, filing export, complete federal return, public UI,
human review or release qualification is established. Broader Ohio software and
all execution-brief gates remain active work.
