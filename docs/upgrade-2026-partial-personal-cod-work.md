# Partial personal cancellation and insolvency

This package completes the actual source route for one-date, continuing-individual, noncommunity personal borrowing with an insolvency exclusion smaller than the complete discharge. It also admits nondeductible personal interest already included in that discharge when the original use, interest and complete settlement records establish the treatment.

The source contract and independent literals were retained before implementation in `.local/upgrade-evidence/partial-personal-cod-source-contract-20261028.md` (SHA256 `2f393b606f2832d5777d9314f6cedc55a51cce5a0de3117683d7c6d5b6b3d90a`) and `partial-personal-cod-preimplementation-20261028/receipt.json` (`81de2b5d959cb771795fcf0297b311caa811fbedf9766f9b59b4c532ca65d640`). The separate AI review retained the exact historical CI inputs and official source readings at `ai-partial-personal-cod-ci-source-review/review.json` (`16a7b5ef193e327dc2318ed387a094320d111a8309e866aa67e9fba7cbdc988c`).

The original incomplete historical inputs are not treated as complete personal-use evidence. Their synthetic successors must preserve the original debt, interest, insolvency and monetary assertions while supplying explicit additional records. No runtime default supplies those records.

The calculation keeps complete discharge D, included nondeductible interest I, insolvency exclusion E and taxable remainder D−E separate. Interest is neither added nor subtracted from D. Current tax and actual NOL use precede attribute reduction; only E enters that budget. The immediate-after liability inventory loses D, not E. Personal cancellation is outside the enumerated net-investment-income categories under this source contract, but its AGI/MAGI effect can increase NIIT on other investment income. These are bounded statutory derivations; the spec identifies the published Pub4681 partial-insolvency example separately.

The new nested personal-debt records require explicit actual purpose, completeness, amounts and nondeductible-interest treatment. Unknowns remain unknown. Positive omitted amounts, deductible interest, business/investment/mixed use, simultaneous payments or borrowing and property transfers retain their precise source boundaries. Existing modified-NOL/charitable-comparison and current-minimum-tax-credit methods are not changed by this package.

## Retained initial verification

The source copy starts at delivered `92870a8aff4094d58e7b63fb4aa55036df44a36b`. The spec, original fixtures and eight canonical regressions preceded runtime changes. All eight initially failed at the existing partial-discharge or positive-interest guard: one file, one worker, 3.27 seconds. Log `partial-personal-cod-initial-red.log` has SHA256 `da910891c30885c8f99b5a44f31c2b80c817187ea548bc5e5f7ac8b100849b7f`. The pre-run receipt verified 985 runtime files unchanged.

This ledger does not claim independent human clearance, filing qualification or 2026 production output.

Before the first green run, inspection corrected two fixture/reader details. The completed successor restores the historical W-2 withholding of 12,750 instead of inheriting the NOL helper's unrelated 20,000, and its fully taxable comparison uses the exact original input. All expected monetary results remain unchanged. The physical Schedule1 reader expects the existing no-comma form text `8000`; the initially written `8,000` string was preserved before execution. The original eight-red and adapter pre-run files remain retained separately.

## Zero next-year minimum tax credit pool

Two actual positive-NOL originals cannot compute a signed current adjustment because their MTCNOL inventories are not empty. The accepted contract (`partial-personal-cod-zero-next-mtc-pool-contract-v2.md`) proves only the available pool: actual AMT A=0, a present verified full current Form8801 with C=0 and a separately recorded current-year legacy vehicle credit L=0 give max(0,C+A-X+L)=0 for every X>=0. No value is inferred for X, signed line18, MTCNOLD or MTFTCE, and no source PartI is fabricated.

The initial eight-case run left three failures after composition. One test used high wages to force AMT, but high regular tax leaves AMT at zero; the actual engine value was 0, so the proof was correct and the test premise was wrong. The AMT and stale-form rejections are now asserted at the bound itself, and the high-wage case is kept as a positive control. The review output needed the two reference rows the spec required, which are now printed with their reconciliation checks. The review tests also needed the QBI token that the workspace already prepares; a changed source then rejects at that earlier digest, before any file is written.

The guide collects the current-year legacy amount through a new field. Blank stays unknown, an entered zero is retained and edits revoke confirmations.

## Delivery checks

Delivered on top of `8c38d963`. All COD, current-credit, federal and 1099-C tests in this package pass together with the three type checks; the full-suite and remote CI results are recorded in the progress ledger for the final commit. This is agent evidence, not human tax qualification.
