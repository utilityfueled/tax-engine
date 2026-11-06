# Actual K-1 charitable basis prerequisite

This package adds an optional, source-bound basis calculation for the existing K-1 cash and capital-gain charitable categories. It does not activate a canonical return input, claim a final Schedule A deduction, or establish independent human tax review. Existing one-argument basis calls retain the separately repaired nondeductible/debt ordering. The actual collector and canonical source handoff remain required follow-on work.

## Source decision — October 26, 2026

IRC [704(d)(3)](https://uscode.house.gov/us/usc/119-120/t26/s704/) and [1366(d)(4)](https://uscode.house.gov/us/usc/119-120/t26/s1366/) distinguish contributed property basis from its appreciation. The former enters the basis loss pool; the latter does not consume outside/stock basis. The [2025 partner instructions, Box 20 AH](https://www.irs.gov/instructions/i1065sk1) identify both attached-statement amounts. Actual beginning outside basis is not the K-1 capital account. The source packet therefore requires a complete original basis worksheet and confirms that unrepresented capital/liability changes are absent.

The [IRS partnership FAQ, Example 3](https://www.irs.gov/newsroom/new-limits-on-partners-shares-of-partnership-losses-frequently-asked-questions) supplies the literal control: a partner's 150 property value and 50 property basis with 30 outside basis produces 130 available after the basis limitation and 20 basis-suspended. The 100 appreciation is not repeated when that suspended basis is later released.

[Revenue Ruling 2008-16](https://www.irs.gov/irb/2008-11_IRB) supplies a second published control, scaled consistently: 190 property value, 100 basis, 25 capital loss, and 80 available stock basis produce 154 charitable amount, 16 capital loss, and 36/9 suspended basis amounts. That ruling addressed its stated 2006/2007 period; the current statutory appreciation exception supports the implemented distinction for 2025/2026. [Form 7203 instructions](https://www.irs.gov/instructions/i7203), [Reg. 1.1366-2](https://www.ecfr.gov/current/title-26/section-1.1366-2), and the partner basis worksheet preserve proportional current/prior categories. Actual source paths keep exact Decimal intermediate values under [6102(c)](https://uscode.house.gov/us/usc/119-120/t26/s6102/).

## Source and calculation boundary

The optional context binds actual entity name/EIN/type, taxpayer owner/name/last four digits, K-1 year, original statement period (including a fiscal period ending in the return year), original category totals, per-gift value/basis/date, and prior basis-use records. Unknown and false remain distinct from confirmed facts. Original through preceding-year basis-use history must be complete, including known zero years. Prior basis suspensions have their original year/category, no five-year expiry, and no percentage-carry FIFO assumption.

Cash basis equals cash value. Property basis cannot be fabricated from FMV. This prerequisite supports reported contribution value at least equal to allocated basis. Decreased-value and other special basis adjustments need their own source method. It rejects positive current/prior EBIE, foreign-tax basis, guaranteed payments, PTP/foreign/disposition facts, noncash distributions, and unrepresented basis movements. Negative portfolio amounts absent from the existing loss-category worksheet also reject. S-corporation direct debt facts must be explicit, including zero. The complete source confirmation cannot override supplied contradictory amounts.

Source-bound stock/outside allocation and the second direct-debt allocation retain exact category amounts. The source ledger reconciles the allowed charity basis proportionally across its original rows, adds current appreciation only once, and preserves basis-only carry balances. Audit descriptions use opaque source numbers; private entity/recipient references do not enter the audit.

## Remaining ordinary handoff

1. Register and collect actual attached-statement facts without defaulting a recipient category, property basis, history, or confirmation. Retain original saved semantic K-1 amounts and independent ordinary QBI/basis/at-risk/passive/EBL records.
2. Pass the validated context through Schedule E once, use the resulting allowed basis/character vector in Schedule A and current/nonitemized candidates, and retain distinct basis versus section 170 carry balances. Add full-return, guide, saved-review and source-tamper checks.
3. Resolve the exact activity/at-risk boundary before activating that source cohort. The partner instructions explicitly exclude charitable contributions from Form 8582; that does not itself establish a section 465 exemption. Current [465](https://uscode.house.gov/us/usc/119-120/t26/s465/) and [Form 6198 line 4 instructions](https://www.irs.gov/instructions/i6198) refer to deductions allocable to an activity. The June 5, 1979 proposed regulation 1.465-13 is not final authority. A blanket charitable at-risk exclusion is not claimed. The actual nonactivity versus activity-allocated contribution method remains a separately reviewed handoff decision.

## Verification

The YAML was written before the new tests. The first run failed for the missing source module; after adding only the source schema, all six new behavioral cases still failed against the old basis implementation. The initial calculation then passed 81 tests in two files. A further source-boundary regression reproduced acceptance of a prior EBIE record before the explicit guard was added.

Current private source tree on base `0229ea554c766db4921f405ab6deb70e7e3f87a7` passes 197 tests in five files (the six new cases, all existing basis and basis edge cases, Schedule E, and semantic labels), root types, 5,039 spec references, and scoped lint with zero errors or warnings. Evidence is retained locally as `k1-charitable-basis-{red,calculation-red,source-boundary-red,green,adjacent,types,spec,lint}.log`. This is software/source verification; independent package review is pending.

## Independent debt finding and corrected candidate

The parent reproduced two admitted-source failures on the first source candidate: default stock 0 / debt 100 / nondeductible 50 / property 180 with basis 80 incorrectly permitted 180 instead of 150; the actual election incorrectly left debt 20 and carried costs 50 instead of closing debt at zero and carrying 30. These were defects in the existing debt module, not grounds for rejecting the ordinary source method. The separate debt-order package repairs both, with its own spec, red tests, canonical and saved-reference checks.

This source candidate is rebased onto debt tree `cd7dd920eeb3a3a7c845fe97c6f6753b15506747`. The only merge conflict was the source path's exact-allocation flag in the repaired debt pass. The new persistent property-source case reproduced the old 180-versus-150 result (`k1-charitable-debt-source-red.log`), then passed with all seven source cases, four debt cases, and the two unchanged parent probes: 13 tests in three files (`k1-charitable-debt-source-green.log`). Reviewer-only probes stay outside committed paths. Further exact source checks and bounded re-review remain pending.

The next canonical package will start with a conservative sufficient section 465 condition: complete original at-risk capacity must cover all basis-allowed activity deductions plus the entire charitable amount. The classification cannot alter current allowance in that nonbinding cohort. This is not a blanket charity exemption, and no charitable at-risk carry is inferred. Binding allocation and incomplete histories remain separate methods.

## Final corrected verification and bounded review

The clean immutable source tree `ab9f1dbdaf71eecb7c3d78c4df7ebfcf4c4d11c4` passed 687 tests in 14 files, root types, 5,070 spec references with no missing or broken references, and scoped lint with zero errors. This cohort includes the seven source cases, repaired debt behavior, existing basis/edge cases, Schedule E, QBI and Form 461 consumers, federal calculation, reference PDFs, and strict spec test references. Logs are retained locally as `k1-charitable-corrected-exact-{tests,types,spec,lint}.log`.

The parent independently verified all six frozen hashes and passed 117 tests in six files, including the two unchanged probes that originally exposed the debt defects (`parent-k1-basis-corrected-review.log`, manifest `parent-k1-basis-corrected-snapshot.json`). No remaining actionable finding was identified in this optional source/basis prerequisite. This is agent source/software review; it supplies no human tax qualification and does not activate the later canonical source pathway.

Final integration is based on `ea436868953ef78a5b2bdf3df45879459ea19259`. The five executable/spec/test blobs are unchanged from the reviewed tree; only this evidence ledger is extended. The committed debt correction remains intact. This prerequisite does not change rule metadata.

The final rebased six-path package passed the same 687 tests in 14 files, root types, all 5,083 current spec references, and scoped lint with zero errors (`k1-charitable-final-{tests,types,spec,lint}.log`). The reference count increased with intervening committed specifications; the test cohort and five reviewed source hashes did not change. Reviewer-only probes, local logs, and unrelated files are excluded from the commit.
