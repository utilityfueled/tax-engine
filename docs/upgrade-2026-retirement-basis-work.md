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

## Roth history and repayment correction

Official instructions refreshed 2026-10-25 identify two separate existing errors.
The next-year regular basis worksheet uses prior line 19; the conversion chart
refigures prior line 23 without the homebuyer amount. Current-year homebuyer tax
relief therefore cannot leave that withdrawn basis available for a later year.
The line 25c worksheet also subtracts actual qualifying repayments directly from
total taxable distributions after the disaster exclusion. Its published second
example gives 5,000 taxable after a 5,000 repayment, while the old proportional
cap gave 6,000 and an incorrect 1,000 later basis addition.

The new spec preceded four failing literal cases; the corrected direct and
adjacent suites pass 614 cases across eight files. The original incorrect
partial-repayment expectation is corrected with the worksheet citation and
its same source/exception assertions retained. The published first-example
fixture now records its actual 5,000 eligible distribution rather than treating
all 12,500 as eligible. Logs: `form8606-roth-history-red.log`,
`form8606-roth-history-integration-first.log`, `form8606-roth-history-green.log`
under `.local/upgrade-evidence/`. Immutable tree `dc0edd0df53147f11fedd3695afea8491500b5e8` passes 696 cases
across 11 files, root types, all 4,486 spec references and lint with zero errors
(17 warnings). Separate source review passes 220 cases and an independent
canonical probe: repayments 3,000/5,000 produce income 7,000/5,000, retained
exception 1,000/0, additional tax 600/500 and no false basis carry. Logs:
`roth-history-dc0e-*`, `federal-review-roth-history.log` and
`federal-review-roth-canonical.log`. No human qualification or wider source
intake is claimed.
