# Marketplace health deductions limited by an owner's income

Reviewed base: `01c98e3`; final integration base: `dbd7db5304cfb7c7248f46f5a68fe1536b4dd329`. This extends the delivered separate-owner source method. The final package preserves all twelve reviewed executable/spec/test blobs and records rule versions2025.107/2026.102. It does not qualify a2026 return for filing.

## Source derivation

Refreshed October 25, 2026:

- [IRC 162(l)(2)(A)](https://uscode.house.gov/us/usc/119-118/t26/s162/) limits the deduction to the taxpayer's earned income from the business under which the plan is established. A joint return does not combine the spouses' separate self-employment income for this purpose; see [Reg 1.6013-4(b)](https://www.ecfr.gov/current/title-26/section-1.6013-4).
- [Reg 1.162(l)-1(a)](https://www.ecfr.gov/current/title-26/section-1.162%28l%29-1) limits specified-premium deductions by attributable credit and attributable repayment. [Rev Proc 2014-41 sections 3, 5.02 and 5.03](https://www.irs.gov/pub/irs-drop/rp-14-41.pdf) coordinates the credit with the deduction, subject to earned-income and repayment limits.
- [Pub974 Worksheet W and Simplified Step3](https://www.irs.gov/publications/p974) retain separate actual business sources before the aggregate calculation. The published enrollment-premium allocation identifies the credit attributable to each specified plan. Each owner's statutory earned-income limit still applies to that owner's remaining premiums. This package therefore applies each owner limit both to the initial maximum and to the later premium-minus-credit calculation; it does not treat unused spouse income as available to the other owner.
- [Reg 1.199A-3(b)(1)(vi)](https://www.ecfr.gov/current/title-26/section-1.199A-3) allocates an individual's allowed health deduction among that individual's businesses using actual gross income. This downstream allocation does not assign a joint repayment cap to spouses.
- [IRS premium-tax-credit questions and answers, Q31](https://www.irs.gov/affordable-care-act/individuals-and-families/questions-and-answers-on-the-premium-tax-credit) confirms the repayment cap does not apply after 2025. The supported extension is 2026, or 2025 with zero actual advances attributable to specified premiums. Existing nonbinding-owner 2025 paths retain their historical source calculation.

The derived initial maximum is the sum of each owner's smaller of specified premiums or nonnegative remaining earned income. The subsequent amount is the sum of each owner's smaller of net premiums after the actual Step2 credit or that same owner's income limit. Both are recomputed on every canonical pass. Original amounts remain exact Decimal values; only the existing joint Schedule1 transfer and QBI reporting reconciliation round to whole dollars. The aggregate review worksheet explicitly describes the separate owner limits when its total differs from a single combined-income minimum.

## Independent derived controls

These are statutory-method examples, not published IRS numerical examples or human tax qualification. Separate Python Decimal calculations preceded observed engine results.

| Sources | Initial owner maximum | Step2 credit | Final health | Final AGI | Final PTC |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2025 C1000/F50000, premiums6000/3000, no advances | 3929 | 7322 | 1488 | 45908 | 7041 |
| Same, C5000 | 7646 | 7322 | 1678 | 49435 | 6601 |
| First2025 case, actual spouse IRA7000 | 3929 | 7992 | 1008 | 39388 | 7738 |
| Isolated2026 C1000/F50000, zero or full9000 advances | 3929 | 5453 | 2111 | 45285 | 5176 |
| Same2026 case, C5000 | 7646 | 5453 | 3547 | 47566 | 4842 |
| Isolated2026 C1000/F100000, full9000 advances | 3929 | 0 | 3929 | 89935 | 0 |

The first row uses separate SE halves71/3533, owner limits929/46467 and the 2:1 actual premium shares. Final owner amounts are929 and559.333..., reported jointly1488. The ordered IRA case instead ends with owner amounts672/336, proving the initial929 is not frozen into the final calculation. The 2026 cases repay all excess advances, respectively3824/4158/9000 for full funding.

The renewed-eligibility control uses actual2026 C1000/F157096, premiums6000/12000, benchmark18000, family4 and spouse IRA7500. SE halves71/11099 give net146926. Maximum12929 and auxiliary health9826 yield retained IRA4470 and final Step2 income129527, above128600. Ordinary health12929 instead permits IRA5630 and income128367. Alternative credit5215 then yields owner health929/8523.333..., joint9452. Fresh final IRA4330 produces actual income133144 and no final credit. Full18000 advances are repaid. No auxiliary percentage or preliminary IRA is published as the final claim.

## Verification and review

- Six original tests in four files failed at the pre-existing binding-owner guard before implementation (`health-owner-income-red.log`).
- Initial implementation and existing owner controls:10 tests/five files passed (`health-owner-income-first-green.log`).
- Added independently derived ordered IRA and real two-owner renewed-eligibility controls; all14 cases/four files passed including adjacent ordered/re-entry suites (`health-owner-income-ordered.log`).
- Fresh source/PDF validation recalculates each owner's final amount, checks both retained audit containers, and rejects changed business income or a one-cent retained owner deduction. The saved PDF is reopened with pypdf and checked for the actual929 owner amount, joint1488 transfer, nonadditive warning and no taxpayer identifiers.
- Immutable tree `d7d3408fae7fbbd2e68cf30777fbfa17fdf6576c` passed268 tests in40 files, root/web types,5004 spec references, and the production web build. Product lint had zero errors and one pre-existing unused import warning. Evidence: `health-owner-income-exact-{tests,types-spec,build}.log`.
- Both saved PDFs reopen with18 fields and four pages each. All eight pages were rendered and inspected, including primary929 on page4 and spouse559.33 on page3; joint1488 appears with an explicit nonadditive notice. Every page has the review-only notice and the saved documents omit taxpayer identifiers. Evidence: `health-owner-income-render/saved-review.json`, the two PDFs and eight page images. Rendering used explicit local font configuration; an earlier default-font-cache failure was corrected without changing PDF bytes or product code.
- Parent independently refreshed Pub974's separate-business and Simplified Step3 instructions and passed11 cases in five files, including signed same-owner cents/order, exchanging actual spouse/business/plan owners with unchanged joint1488/AGI45908/PTC7041, and balanced owner redistribution rejected even when both retained audit containers and the total agree. Parent inspected the saved owner pages. Evidence: `parent-health-owner-income-review.log`, review archive `/private/tmp/tax-parent-health-owner-income-rxq73944`.
- No actionable finding remains within this bounded method. Reviewer-only probes remain outside the owned product paths. This is agent source/software review, not human tax or form qualification. The source snapshot remains immutable; only this later ledger evidence and the separately coordinated metadata are added for integration.

## Remaining binding2025 repayment method

This is still internal unfinished method work, separate from external filing/form qualification. Reg1.162(l)-1 ties the repayment amount to the specified premiums after the joint cap. Pub974 combines the repayment-limit worksheet; the refreshed sources do not prescribe which spouse receives a binding joint capped amount. Searches included the regulation, RevProc2014-41, Pub974 separate-business instructions and the individual gross-income rule for QBI. A second agent's bounded source reading reached the same negative finding; that is not a human tax interpretation.

Potential methods give materially different owner results: premium-share allocation, attribution by excess advances before the cap, or filling one owner's remaining eligible premium/income capacity first. Applying the downstream QBI gross-income ratio would introduce a fourth unsupported upstream ownership assumption. None is implemented. Positive2025 specified advances with a binding owner-income limit remain rejected, as do existing combined maximum amounts that cannot reconcile actual owner attribution. Unknown advances or ownership are never inferred as zero. A complete source-supported method, or a precise qualified interpretation if primary authority remains unresolved, is required before that branch can be enabled.

A concrete unresolved comparison uses2025 MFJ family2, C1000/F50000, SE halves71/3533, owner income limits929/46467, actual separate premiums and full advances6000/3000, and total benchmark4800. The750 repayment tier fails its income test;1950 is in range. Splitting1950 by premium shares first gives1300/650, then applying the first owner's929 limit gives health1579, AGI45817,224%FPL and PTC3444. Reassigning the clipped371 to the other owner instead gives929/1021, health1950, AGI45446,222%FPL and PTC3491. Both hypotheses still repay1950 and satisfy the simple aggregate premium ceiling, so those checks cannot select an attribution. These are independently calculated comparison hypotheses, not approved deductions or published IRS numerical examples. Exact Decimal derivation is retained in `health-owner-binding-cap-hypotheses.json`; neither hypothesis is enabled.

The later bounded refresh also searched the official IRS PTC Q&A, the2017 final coordination regulation, and Pub974's reasonable-allocation text. That text expressly addresses allocating the Step2 credit to plans; it does not expressly assign a binding joint repayment amount between spouses. RevProc2014-41 section3 permits another computation only when it satisfies all applicable law, so it does not establish the missing ownership rule by itself. No new controlling answer was located.

## Final integration checks

On October26,2026, the exact reviewed twelve executable/spec/test blobs were copied onto `dbd7db5` and verified by SHA256. Only this evidence and the separately coordinated rule-pack metadata changed. The final owned package plus strict spec checks passed18 tests/six files, the metadata suite passed three tests, root type checking passed, and all5022 spec references resolved. Evidence: `health-owner-income-final-{tests,metadata,types,spec}.log`. Prior268-case exact checks, parent11-case review and saved/reopened owner PDFs remain applicable to these unchanged product blobs. The unrelated untracked dependency cache and review documents were excluded.
