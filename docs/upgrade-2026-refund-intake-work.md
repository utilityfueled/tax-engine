# Historical income-tax refund source intake

This guided collector retains actual Form 1099-G refund, Box 3 tax year and
paid/deducted year separately. It binds captured original statements to the
actual recipient, receipt year and unchanged historical return members. Exact
source cents, known zero and missing answers remain distinct.

The ordinary historical worksheet collects actual itemization, the income-tax
or sales-tax election, available standard deduction, SALT amounts and required
2025 historical MAGI. Income-tax itemizers additionally establish the ordinary
tax-benefit conditions. Known nonitemization and sales-tax elections reach the
canonical zero-benefit branches without changing the original refund facts.
There is no user-entered taxable refund or calculated tax override.

Sources refreshed October 25, 2026:
[Form 1040 instructions, Schedule 1 line 1 and refund worksheet](https://www.irs.gov/instructions/i1040gi)
and [Publication 525, recoveries](https://www.irs.gov/publications/p525).
Historical AMT, unused credits, capital-rate calculations, dependency, other
recoveries, changed joint-return members and mixed expense years retain their
separate method boundaries. Actual 2026 source collection does not open the
full-year calculation or filing gates.

Independent review identified two omitted historical facts: amounts already
recovered before the receipt year (Publication525 Worksheet2 line5), and NOL
carryovers affecting historical taxable income (footnote4). The ordinary
income-tax itemizer route now requires actual known zero for each. Positive
records remain saved and need their separate historical adjustment; the original
itemized deduction is never reduced or replaced to imitate that calculation.

Spec-first tests reproduce the missing historical UI and the fresh-capture
recipient gap before the fixes. Focused source controls verify exact cents,
original-record conservation, no duplicate transfer, real zero-benefit elections,
unknowns and invalidation after original-source or household changes. Production
browser and independent review evidence is recorded below. Agent review does
not establish human tax qualification.

## Verification

The corrected isolated tree `4c65d5f3` passed 903 tests across 90 files, root and
web type checks, all 4,732 specification references, scoped lint with zero errors
and two existing bridge warnings, and the production build. The parent reviewer
independently passed 11 cases, including the previously failing missing-history
case, exact alternative-sales-tax cap and recaptured recipient/payment-year
contradictions (`parent-refund-guide-rereview.log`).

Production browser checks passed both 1280px and 390px viewports without retries.
They verified actual AGI changes, saved election/history, unknown versus zero,
confirmation invalidation, original cents and identifiers remaining local. Both
screenshots were inspected. The first browser attempt exposed a test expectation
for comma formatting; the existing source field displays `1000.25`, so only that
assertion was corrected. No product or monetary expectation was changed.
