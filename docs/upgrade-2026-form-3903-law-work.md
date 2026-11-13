# 2026 Form 3903 moving expenses

The 2026 draft calculation accepts confirmed domestic, same-year moves under
the active-duty permanent-change-of-station rule or the new statutory
intelligence-community assignment rule. The latter applies to qualifying
nonmilitary employees and new appointees whose assignment requires relocation.
The source packet carries the actual move date, owner, an opaque reference and
the eligible expense and reimbursement amounts, including explicit zeros.
The original expense confirmation excludes costs covered by separately exempt
allowances and government-furnished services. Line 4 excludes those allowances
and amounts already in W-2 wages. [P.L. 119-21 §70113](https://www.govinfo.gov/content/pkg/PLAW-119publ21/pdf/PLAW-119publ21.pdf) ·
[Final 2026 Form 3903 instructions](https://www.irs.gov/pub/irs-pdf/i3903.pdf).

The standard-mileage method uses 20.5 cents per mile through June 30 and
23.5 cents from July 1, based on when the expense was paid or incurred.
The actual vehicle method uses gas and oil. Either method can include
qualifying parking and tolls. Confirmed nonvehicle transportation and lodging
are added once. The actual Line 4 reimbursement is supplied after its own
substantiation. Under the announcement, a mileage allowance uses the new
rate only if both the expense and payment dates are July 1 or later.
[Notice 2026-10](https://www.irs.gov/irb/2026-04_IRB) ·
[Announcement 2026-11](https://www.irs.gov/irb/2026-29_irb).

The saved-return schema and typed calculator reject mixed annual and
historical records, unsupported dates and amounts, duplicate move
references, more than one move record per owner and date, and more than one
mileage total for a move and date. Mileage entries represent reconciled daily
totals across eligible trips. The draft federal integration preserves actual
W-2 wages and routes the per-move deduction and taxable excess separately.
An actual spouse and joint return are required to combine spouse-owned moves.

The initial spec-first run reproduced six failures. Independent engineering
review then reproduced unsafe historical fallback, source duplication and
out-of-range precision. The successor retained the independent oracles and
added regressions for those source boundaries. The final focused and adjacent
run passed 633 tests across 11 suites. An independent five-suite rerun
passed 43 tests and separate source probes. Three type checks, 8,706
spec references, the 947-entry inventory and strict scoped lint passed.
The 2026 pack remains incomplete, with no filing
qualification.

The 2026 physical candidate remains disabled. Native intake, actual
cross-year reimbursements, earlier-year storage, special separation and
dependent moves, foreign moves and Form 2555 allocation require further
work and qualified human review. [IRS Publication 3](https://www.irs.gov/publications/p3) ·
[IRS Publication 514](https://www.irs.gov/publications/p514).
