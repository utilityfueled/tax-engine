# Actual retirement basis and Form 8606

## Whole-dollar arithmetic prerequisite

Refreshed 2026-10-25: official [Form 8606](https://www.irs.gov/pub/irs-pdf/f8606.pdf),
[its instructions](https://www.irs.gov/instructions/i8606), and the
[Form 1040 rounding instructions](https://www.irs.gov/instructions/i1040gi).
The engine's whole-dollar convention applies to monetary form lines; the
Form 8606 line 10 ratio separately rounds to three decimals. Source cents are
combined before rounding a line, and exact original records remain intact.

The new spec preceded six literal regressions. Five failed on fractional source
lines, allocation amounts, carry and Roth basis; the published repayment example
already passed. After correction all 68 new and existing Form 8606 cases pass.
Example: basis 1,000, year-end value 2,002 and distributions 1,001 yield ratio
0.333, nontaxable amount 333, taxable amount 668 and basis carry 667. The old
calculation returned fractional monetary lines and a 666.667 basis carry.
Two separate 250.50 allocations round to 251 each before their 502 total.

The tests also preserve cents in aggregate source lines and original Roth
vintages, and check disaster/repayment dollar entries without rounding those
fractions to the unrelated line 10 convention. Published line 15c examples retain
7,000/6,000 taxable amounts and 0/1,000 later basis adjustments. Exact red/green
logs: `.local/upgrade-evidence/form8606-rounding-{red,green}.log`.

Immutable tree `3a04cfed08eee795ee15aaac66034f51ae82a4d7` passes 692 cases
across ten Form 8606, IRA deduction, owner, canonical and PDF suites, root types,
all 4,470 spec references and scoped lint (zero errors, seven existing warnings).
Separate agent review refreshed the official sources, inspected aggregation,
ratio/line rounding and repayment controls, and passed all 68 direct cases with
no actionable finding in this change. Logs are under
`.local/upgrade-evidence/form8606-rounding-3a04-*` and
`federal-review-form8606-rounding.log`. The rule-version change follows the
concurrent federal package. These are calculation tests and bounded agent review,
not human tax review or final 2026 form qualification.

## Actual source collection still in progress

The current guided ordinary IRA route requires confirmed zero basis. Positive
traditional IRA basis needs separate owner identities, original 1099-R source
links, actual prior Form 8606 basis/history and all year-end traditional/SEP/SIMPLE
accounts. Missing values cannot become zero; incomplete intervening history,
inheritance, current deductions/contributions, conversions, QCDs, rollovers and
special distributions need their own actual source methods. No source collector
or wider qualification is claimed by the arithmetic prerequisite.

The separate review also identified an existing Roth history issue to correct:
the IRS basis chart refigures the prior line 23 without the line 20 homebuyer
amount, while the current FIFO consumes contribution basis from line 21 after
that amount. This was not introduced by the rounding change. It remains an
internal source-history task, separate from the ordinary traditional IRA route.
