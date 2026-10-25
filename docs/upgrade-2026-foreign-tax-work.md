# Actual foreign-tax deduction and NIIT coordination

This package adds a bounded annual foreign income-tax deduction path for actual 2025 sources and the isolated 2026 candidate. It does not enable a production tax year, filing export or model route. The absent-election credit calculation remains a historical unverified path; this work does not qualify that credit method.

## Controlling sources

Refreshed October 25, 2026:

- [IRS Publication 514](https://www.irs.gov/publications/p514), annual credit-or-deduction choice, paid/accrued history and deduction-year absorption of prior credit carryovers.
- [IRC 164](https://uscode.house.gov/us/usc/119-118/t26/s164/), foreign income-tax deduction and the separate state/local limit; [IRC 275(a)(4)](https://uscode.house.gov/us/usc/119-118/t26/s275/), no foreign income-tax deduction when a credit is chosen for any part.
- [Final 2025 Schedule A instructions](https://www.irs.gov/instructions/i1040sca), foreign income taxes on line 6, territory taxes on their separate state/local route.
- [Final 2025 Form 8960 instructions](https://www.irs.gov/instructions/i8960), line 9b and documented reasonable allocation; [Regulations 1.1411-4(f)(3)(iii), (g)(1)](https://www.ecfr.gov/current/title-26/section-1.1411-4).
- [Final 2025 Form 6251 instructions](https://www.irs.gov/instructions/i6251), line 2a restores all Schedule A line 7 taxes when itemizing.

## Implemented source and calculation contract

- Actual annual choice, matching year, paid-tax method, prior accrued-credit history, complete current sources, redetermination history and absence of unused credit carryovers are explicit facts. Missing facts are not zeros or elections.
- The supported deduction branch binds every positive INT/DIV foreign-tax statement to actual payer/TIN, account reference, recipient, country and exact reported tax. Dated USD payments must total that reported amount. Actual excluded-income taxes are removed; previously deducted amounts require separate coordination. Exact investment allocations cannot exceed eligible taxes.
- Schedule A line 6 rounds the combined eligible foreign taxes once; line 7 adds the actual capped local-tax deduction. The annual deduction choice suppresses current FTC and new FTC carryforward even if the standard deduction wins. Existing positive carries are rejected rather than silently retained or deducted.
- Independent agent review found that the initial explicit-credit branch ignored a known same-year deduction elsewhere. A red regression reproduced it. The branch now rejects that deduction and refuses to feed an unprocessed deduction-source ledger into the legacy credit estimate; supplied excluded-income/ineligible-source facts cannot silently disappear. The UI retains the ledger when changing the annual choice.
- NIIT combines actual local and foreign allocation cents before one line 9b rounding. The regular deduction and final shared itemized limit are applied once. AMT line 2a receives actual Schedule A line 7.
- The historical Schedule A review PDF copies unique canonical tax audits, rejects missing or conflicting tax totals, retains the source-year gate and one visible review notice, and works with the identifier-redacted render copy.
- Guided intake collects actual source records from an empty worksheet. Investment account references are preserved locally and through the canonical input. Statement/owner changes invalidate the annual confirmation; annual election changes invalidate dependent NIIT confirmation. Confirmation-only edits do not create a loop. Existing review redaction removes account references from the render copy while the source and encrypted full-fidelity backup retain them.

## Verification before scoped commit

Specs were written before the failing tests. Local evidence under `.local/upgrade-evidence/`:

- `foreign-tax-election-red.log`, `foreign-tax-election-canonical-red.log`: source contract initially absent; canonical return initially omitted Schedule A6 and incorrectly retained a foreign credit after a deduction election.
- `foreign-tax-election-amt-red.log`: actual Schedule A7 was 22,601 while the old AMT transfer restored only 22,000.
- `foreign-tax-election-pdf-red.log`: old mapper omitted foreign tax, omitted additional real-estate tax, and accepted missing tax audits.
- `foreign-tax-election-guided-red.log`, `foreign-tax-election-dom-red.log`: missing actual intake/helper before implementation.
- `foreign-tax-election-adjacent.log`: 346 tests across 13 source, canonical, NIIT, credit, Schedule A and PDF files passed.
- `foreign-tax-election-ui-green.log`: 10 guided/DOM tests across four files passed, including a new empty-row interaction and existing NIIT interactions.
- Root and web types passed. Spec validation covered 4,098 references with none missing or broken. Scoped lint had no errors; new test non-null assertions were then removed, with an unchanged legacy Schedule A assertion remaining.
- `foreign-tax-schedule-a.pdf` and `.png`: synthetic review output reopened with nine canonical field values and nine matching widget appearances. Render inspected: line 6 is 601, line 7 and total 22,601, SSN blank and red review notice visible. No 2026 physical mapping or qualification is claimed.

Independent expected calculation: current USD tax 600.75 minus excluded-income tax 0.25 gives 600.50, reported as 601. Local source taxes remain 22,000. NIIT allocations 2,000.25 + 500.25 + 400.50 sum to 2,901 before rounding; 30,000 investment income minus 2,901 gives 27,099, and 3.8% gives 1,029.762, reported as 1,030.

Exact core/PDF implementation tree `3b5e65b9c601b6556ab3380588d4fddf9e2dd37d` (base `f90b2234b18078b2d94be30c23cb4287e36c9ba8`) passed 1,388 tests across 30 files in an immutable archive with one worker, pinned Node24.22.1 and pypdf6.10. Root types passed; all 4,079 staged spec references resolved; scoped lint had zero errors and five pre-existing non-null-assertion warnings outside the changed expressions. Logs: `foreign-tax-core-staged-{tests,types,spec,lint}.log`.

An independent agent reviewed the actual annual source method, canonical transfer, guided source handling and saved PDF. Its initial credit-choice finding was reproduced red (`foreign-tax-election-credit-conflict-red.log`) and corrected. The final five-file re-review passed all 15 cases with no additional actionable finding (`facts-rereview-foreign-tax.log`). This is agent software/source review, not independent human tax qualification. Guided intake is a separately reviewed following commit; its exact staged checks will be recorded below.

## Scoped commits and intake verification

- Core and historical Schedule A PDF: `9a302c08ce126c29b51bbe7371bdc4ca9c737a76`.
- Intake implementation tree `ff5a53798c40174f31d8684f5290b87764f36af9`, based on that core commit, passed 703 tests across 57 files in its own immutable archive. Root and web types passed, all 4,084 spec references resolved, scoped lint had zero errors and two pre-existing bridge warnings. Logs: `foreign-tax-ui-staged-{tests,types,webtypes,spec,lint}.log`.
- The final intake check added a red regression for an empty optional account reference on the explicitly unverified credit path. It now remains omitted; a deduction still rejects the missing actual identity. Logs: `foreign-tax-ui-optional-account-{red,green}.log`. No default account identity was introduced.
- Independent review included the guided helper/DOM and canonical/PDF files (15 cases after the credit-conflict correction). Actual empty-row entry, source replacement, section/bridge parity and confirmation invalidation are covered. Shared staging contains only the foreign-election hunks; concurrent Marketplace health and passive-loss changes were excluded.

## Remaining internal methods and external evidence

The implemented ordinary branch is not a substitute for these separate methods:

1. **Deduction-year special carryover methods:** The ordinary passive INT/DIV method is implemented below. Capital/preferential-income adjustments, mixed filing histories, foreign loss accounts, additional income categories, multiple-country state-tax attribution and post-section-68 itemized allocations still require their actual separate source methods. These are internal implementation boundaries, not external approval requirements.
2. **Accrued-tax elections and redeterminations:** require actual historical elections, foreign liability/payment/translation changes and affected-year recomputation. The current input captures the history boundary and rejects unsupported cases.
3. **Pass-through, externally paid and previously deducted taxes:** need actual source/category/recipient and no-duplication routing beyond this INT/DIV paid-tax branch. Territory taxes must use their actual separate routing.
4. **NIIT recovery-year adjustments and unqualified annuity taxable amounts:** remain distinct source methods recorded in the ordinary NIIT work document.

Independent human tax review and final 2026 form/export qualification remain external evidence requirements. They are separate from the software boundaries above and are not claimed here.

## Ordinary deduction-year carryover absorption

The prior annual intake commit is `e3e8ed0`. This next core package binds actual adjusted balances to origin year/category and actual foreign income to the same owner, payer, account and country as the original statement. It supports known continuous individual filing or joint returns with the same spouse, cash-paid passive INT/DIV sources and ordinary regular income. It does not promote the historical credit estimate.

The private canonical pass changes only the annual choice to credit, recomputes the actual standard/itemized choice and regular tax, and stops at Form1040 line16. The original return still deducts current foreign tax where allowed, grants zero current credit, and never deducts prior carry. Supported standard and actual itemized source allocations follow final Form1116 instructions; ordinary charity remains U.S.-source under Regulations1.861-8(e)(12). Signed country columns are summed before the limitation floor. The oldest actual category balance is absorbed first; any unused tenth-preceding-year amount expires after current use. No new credit carry is created by a deduction year.

Refreshed controlling sources on October25: [Pub514](https://www.irs.gov/publications/p514), unused taxes carried to deduction year and state-tax allocation; [final Form1116 instructions](https://www.irs.gov/instructions/i1116), lines1–7/18–21 and at-least-four-place ratios; [ScheduleB instructions](https://www.irs.gov/instructions/i1116sb), oldest-first use and tenth-year expiration; [Regulations1.861-8](https://www.ecfr.gov/current/title-26/section-1.861-8), paragraphs(e)(9)/(12).

Independent expected cases retain the IRS600current/200prior/700limit example:100 absorbed,100 left. The canonical synthetic2025 case has95000 wages,5000 actual foreign interest and15750 standard deduction. The official84250–84300 TaxTable gives13455; the supported foreign ratio0.05 gives673 after rounding, so73 of prior200 is absorbed and127 remains. The2026 indexed statutory preview gives13170 tax,659 limitation,59 absorbed and141 left. A15500 state-tax source plus600 current foreign tax selects16100 actual itemized deductions; the hypothetical credit pass instead selects15750 standard. It must not mechanically add600 to actual taxable income.

Spec-first regressions reproduced missing core/canonical handling, contradictory state-exemption facts, incorrectly floored country columns, missing state-country attribution and a saved deduction ledger silently surviving a credit choice. Evidence: `foreign-carryover-{red,state-red,country-red,canonical-red}.log`. The latest focused core/canonical cohort passed20 tests across three files. Root types passed. The new guided contract and DOM tests also pass, but intake/PDF are committed separately after this core.

Parent independently refreshed the controlling sources and ran61 child/PDF/foreign cases, including the carryover core and canonical cases (`child-reference-foreign-review.log`), with no additional scoped findings. This is agent source/software review, not independent human tax qualification. Exact immutable core results and commit references follow after validation.

Core immutable tree `15f960310b58f369ac746eb07f7b0c54e9dbd46b` passed736 tests across10 files; a further164 ScheduleA/foreign-credit/PDF cases passed across four files. Root types and all4,144 spec references passed. Scoped lint found no errors, four existing federal non-null warnings and one new unused test import; the new unused import was removed before the final snapshot. Logs: `foreign-carryover-core-staged-{tests,adjacent,types,spec,lint}.log`.
