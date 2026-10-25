# Form 2210 dated installments

Sources refreshed 2026-10-25. Scope: calendar-year resident individuals using the
regular method, with exact Decimal payments and statutory withholding treatment.
This is calculation implementation evidence, not independent tax approval or final
2026 form qualification.

- [x] Write the spec before the 17 new failing source/timing tests; the initial
  run recorded 17 failures in `.local/upgrade-evidence/form-2210-red.log`.
- [x] Replace the annual-total shortcut with dated oldest-installment allocation.
  A January catch-up no longer erases April, June and September penalties.
- [x] Preserve actual estimated-payment, extension-payment, applied-credit and
  return-payment dates. Validate totals and reject missing effective credit dates.
- [x] Support statutory equal withholding and a reconciled actual-date election.
- [x] Audit physical Part I lines and all Part III columns from calculations.
  Historical aggregate tax inputs do not manufacture line 1, 2 or 8 evidence.
- [x] Implement published 2025/2026 rate periods and early-return exception.
  A nonzero unknown-rate period throws an explicit error. Fully timely payments
  can establish zero without needing a future interest rate.
- [x] Preserve optional source fields as unknown, including prior-year tax
  eligibility/computation and the effective dates of applied prior credits.
- [x] Relevant regression suite: 66 tests pass, including all 49 existing penalty
  tests. Existing equal-payment fixtures now explicitly contain their dates;
  no production adapter manufactures equal installment payments.
- [x] Core package committed as `44793ac`; final PDF-package root typecheck,
  scoped ESLint, diff review and all 3,353 spec references pass.
- [x] Federal orchestration committed by the federal agent as `a269a9f`: pass actual
  source dates and 1040 line 22, include only the instructions' eligible taxes,
  and preserve Form 1040 line 38 outside total tax. Its 767 core/federal/guided/edge
  tests pass; positive-estimate assertions were preserved.
- [x] Replace the historical review PDF recomputation with audited line values,
  inspect physical fields and reopen/render the result. The final relevant suite
  passes 102 tests (`form-2210-final-focused.log`). Missing/duplicate/nonfinite
  audit evidence, mismatched dates/totals/year and wrong/missing PDF fields fail.
  Form 2210 stays suppressed
  by default; there is no 2026 filing export qualification.
- [x] Verify printed line 9 No/Yes and Part II A-E field positions. Box D uses the
  actual withholding election; box E requires actual prior joint-return status
  (optional schema fact in `8ca3655`). Unknown status stays disclosed.
- [x] Rendered `.local/upgrade-evidence/form2210/review.pdf` and inspected pages
  1, 2 and the dated evidence appendix. The real federal fixture has line 11
  columns $2,000/$2,000/$2,000/$22,000 and penalty $634. Reopened fields match.
  Shaded cells 12a/13a/14a/16a/16d/18d stay blank; their source audit is retained.
  The shading regression failed before correction (`form-2210-shaded-red.log`).
  All pages retain the visible review notice and extracted notice text.

## Source decisions and independently derived expectations

Official [2025 instructions](https://www.irs.gov/instructions/i2210) and
[physical form](https://www.irs.gov/pub/irs-pdf/f2210.pdf) supply the regular
method and lines. [2026 Form 1040-ES](https://www.irs.gov/pub/irs-pdf/f1040es.pdf)
supplies the 2026 payment deadlines and February 1, 2027 early-return deadline.
[IRS interest rates](https://www.irs.gov/payments/quarterly-interest-rates) link
2025 rate rulings and the 2026 second-quarter 6%, third-quarter 7% and
fourth-quarter 7% publications.

[IRC 6654](https://www.govinfo.gov/content/pkg/USCODE-2024-title26/html/USCODE-2024-title26-subtitleF-chap68-subchapA-partI-sec6654.htm)
requires oldest-installment payment allocation and establishes the withholding
and early-return rules.
[IRC 6621(b)(2)(B)](https://www.govinfo.gov/content/pkg/USCODE-2024-title26/html/USCODE-2024-title26-subtitleF-chap67-subchapC-sec6621.htm)
keeps the following March rate through April 15 for this individual penalty.
Consequently the 2025 penalty still uses 7% through April 15, 2026 even though
the general 2026 second-quarter rate is 6%. The statute was checked before
implementation; an initial hypothesis to split that April tail was discarded.

[IRM 20.1.3.2.10](https://www.irs.gov/irm/part20/irm_20-001-003r)
explains that weekend timely treatment does not move the statutory accrual date.
June 16, 2025 payment is treated as June 15; June 17 payment has two late days.
The 2025 no-payment day total therefore remains 971 across four installments.
No unsupported leap-year denominator claim is retained.

Independent examples in the tests:

- $9,000 paid January 15, 2026 against four $2,250 installments: prior
  installments remain late for 275, 214 and 122 days; penalty $264.
- IRS line 11 Example 1 produces payment columns $2,000/$1,000/$1,500/$1,500.
- IRS Example 2's $500 first-quarter shortfall is paid June 10 after 56 days;
  $700 remains from the $1,200 payment for the June installment.
- $36,000 paid December 31, 2026 against four $9,000 installments: 91 principal
  days at 6% plus 475 at 7%, $954 after final rounding; fourth installment prepaid.
- Full return filed/paid February 2, 2026 removes only fourth-installment penalty.
- A one-cent fourth-installment shortfall retains exact penalty
  $0.000172602740 before rounding; rounding to zero does not invent timely payment.

## Remaining facts, software and external evidence

Actual facts still need collection/forwarding where applicable: full-year resident
status, farming/fishing threshold status, selected method, relief/waiver request,
actual prior-year tax under the line 8 instructions (including changed filing
status allocations), prior AGI and return-year eligibility, full-year residence
for the no-tax exception, applied-credit origin dates, actual withholding records
when that election is selected, and early filing/full-payment evidence. A prior
Form 1040 total-tax scalar is not a verified Form 2210 prior-tax computation.

Software still outside this bounded regular-method package: Schedule AI with
actual cumulative period income/deductions/credits/SE/wages, Form 2210-F,
nonresident and fiscal-year computations, disaster postponements and supporting
waiver workflow. Those combinations fail explicitly rather than silently using
the ordinary schedule. Guided source collection is separate remaining
implementation work, not an external blocker. The physical 2025 PDF remains a
review artifact even though its supported regular-method mapping is corrected.

External evidence still unavailable: published 2027 first-quarter rate for
positive 2026 exposure after December 31; qualified final 2026 instructions/form;
independent tax review. No staging/provider evidence or human review is claimed.
