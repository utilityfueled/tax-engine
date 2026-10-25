# Private charitable cash and property source allocation

This package preserves actual cash and ordinary-property histories in the same contribution year and `other_30` category. It supports a fully allowed group, a wholly disallowed group, or a group containing only one positive medium. It rejects a partial allowance across positive cash and property sources before assigning deduction or carry balances.

## Controlling sources and boundary

- [Final 2025 Publication 526, Worksheet 2 and Carryovers](https://www.irs.gov/publications/p526), refreshed October 25, 2026: lines 5 and 7 enter the same line 23 total, line 24 applies the shared limit, and line 25 retains the excess. Current contributions precede prior contributions within each category; earlier contribution years precede later years.
- [26 CFR 1.170A-10](https://www.ecfr.gov/current/title-26/section-1.170A-10): original contribution years, intervening use, and five-year life remain distinct. No source ordering is inferred from the display order or an arbitrary identifier.
- [Section 170(b)(1)(B), (I), and (d)(1)(C)](https://uscode.house.gov/us/usc/119-120/t26/s170/): the current-year 2026 floor and eligible excess carry remain subject to their existing separate rules. This change does not open the 2026 prior-carry method.

The reviewed sources combine ordinary cash and property within B but do not establish cash-first or proportional allocation of a partial same-year allowance. The former implementation assigned cash first. This package removes that unsupported assignment. The partial mixed-media method remains named internal work; a taxpayer-entered formula or approval is not treated as a substitute for authority.

## Changes and literal controls

The facts-only validator now keys an actual vintage by contribution year, category, and medium. It accepts distinct cash/property rows with their own complete histories, while rejecting duplicate same-medium rows and duplicate source IDs. Legacy year/category totals reconcile to the sum of the actual media; legacy amounts are not classified by inference.

The calculator groups a category's same-year records before applying FIFO. A full group preserves both source amounts; a zero group preserves both remaining balances; a partial positive mixed group stops. The same rule replaces current-year cash-first allocation, including a partial 2026 floor reduction. New current B carry records explicitly retain cash or noncash medium.

- Current cash 1,000.49 and property 2,000.51 plus prior cash 3,000.49 and property 4,000.51 at a 100,000 base produce exact cash 4,000.98 and noncash 6,001.02. Printed Schedule A lines 11/12/13 are 1,000 / 2,001 / 7,001; lines 14 and 17 are 10,002.
- Prior 2020 cash 100.20/property 200.30 followed by 2024 cash 400.10 at a 2,000 base use 100.20 / 200.30 / 299.50 and retain 100.60. Reversing input rows changes nothing. At a zero base the 2020 balance expires, while 400.10 remains. At a 1,000 base the partially allowed 2020 mixed group rejects.
- A standard-deduction year retains the same supported treated-paid source usage but claims no charitable itemized deduction.
- Current 2,000 cash plus 2,000 property at a 10,000 base rejects the undetermined 3,000 split. Single-medium 4,000 still deducts 3,000.
- For current 2026 sources, a floor that removes the entire mixed B group creates no carry when there is no percentage excess. A zero B allowance with an actual percentage excess retains both exact media; a partial mixed post-floor allowance rejects.

The public/capital/private example in the existing crypto-charity test retains every amount. Its known private cash carry now includes `medium: cash`; two existing worksheet expectations receive the same explicit source metadata. No monetary oracle is replaced with implementation output.

## Verification

Spec entries preceded five new failing engine, guided-source and saved-PDF cases. The red log is `.local/upgrade-evidence/charity-private-media-red.log`. After implementation, all 19 initial new and adjacent worksheet tests passed. A broader run found only one additional legacy carry-shape expectation; its unchanged 5,000 amount is now explicitly cash.

The frozen review tree `25bd74e33e384f8b014c3ef6e2ada8ad0b1bf37a` passed 460 tests in 44 files, root and web typechecks, all 4,733 spec references, and scoped lint with zero errors. Evidence is in `charity-private-media-exact-{tests,types,webtypes,spec,lint}.log`. The prior broader working snapshot passed all 454 consumer tests after that single metadata expectation was corrected.

Parent independently reviewed the sources and the frozen calculation/validation/reporting delta, then ran eight tests in four files: all five new package cases plus three independent cents, floor-plus/minus-one-cent and grouped-FIFO controls. All passed in `parent-charity-private-media-review.log`, with no actionable finding in this bounded package. This is agent review only. Final rebasing preserves every reviewed executable/spec/test blob; only this evidence and rule metadata change. The coordinated rule revisions are 2025.80 and 2026.76-law-integration-draft; calculation/export gates remain unchanged.

The clean final tree `fa497fe3bba4ebf5a3537d922ad0db5444309dfc`, based on `cd088957810efbc42b12f83418fcbacb050b4382`, passed all 32 focused, strict-spec and rule-metadata tests in seven files, root typecheck, all 4,742 spec references, and scoped lint with zero errors. The earlier final run exposed only an unrelated committed refund-spec formatting defect; its owner reproduced and corrected that separately in `cd08895`. No parent-only review probes were included in the final tree. Final evidence is in `charity-private-media-final-{tests,types,spec,lint}.log`; the commit adds only this verification paragraph to the tested document.

The saved one-page review PDF was reopened with pypdf: 39 canonical fields, all five charitable field values agreed with their widget values and nonempty appearances, one visible review notice, and no taxpayer identifier. The rendered page was visually inspected, including lines 11–18 and the footer. This is software/source evidence; it does not establish human tax review, final 2026 form qualification, or filing readiness.

## Remaining finite methods

1. Establish a controlling partial mixed-media allocation method before accepting that case.
2. Implement the distinct 2026 prior-carry, floor and nonitemizer transition using actual histories; preserve original vintage years.
3. Extend regular and alternative-tax NOL/charity coordination to actual prior and mixed histories without copying one ledger into the other.

Conservation, changed filing units and special elections retain their explicit source boundaries. The separate source collector continues to preserve these records without inventing contribution bases or current-year allowances.
