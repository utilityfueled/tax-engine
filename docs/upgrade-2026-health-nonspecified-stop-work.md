# Actual nonspecified-premium worksheet stop

This package implements the published stop before the special Publication 974 worksheets when each qualified specified-plan business has exhausted its own income after its completed nonspecified claim. The engine then calculates the ordinary final credit and other income-sensitive claims using that fixed health deduction. It retains each business's original premiums, independent owner limit and QBI attribution. It does not borrow another business's earnings or create a stopping election.

## Authority and exact boundary

[Publication 974](https://www.irs.gov/publications/p974), refreshed October 26, 2026, Before You Begin step 1 and the instructions following Worksheet P/Form 7206, says to stop when P line 2 does not exceed line 1 or Form 7206 line 13 does not exceed line 3. The completed nonspecified deduction transfers to Schedule 1; Form 8962 then calculates the credit. The W/X and special iterative/simplified instructions do not apply after that stop. Multiple sources retain their separate Form 7206 limits.

The predicate uses exact canonical source amounts. An actual remaining $0 qualifies; $0.01 does not become zero because its printed line rounds to zero. The method requires a positive completed nonspecified deduction and actual specified premiums. Negative combined W line 15 with a business that still has capacity remains a separate method. Unknown eligibility, original receipts, owner, or earned-income attribution cannot establish the stop.

The final pass recomputes ordinary student-loan and other claims instead of retaining special-order results. The actual final credit and original business amounts are bound again before PDF I/O. Physical Form 7206 pages show each completed nonspecified claim, with a distinct stop explanation and a nonadditive combined transfer. Ordinary Form 8962 continues to use its existing reference-summary mapping; this package does not add an ordinary physical Form 8962 mapping. Isolated 2026 tests do not change readiness or form-qualification gates.

## Source-derived controls

- One owner: C $5,000, F $20,000 and W-2 $25,000; C nonspecified $6,000 and F nonspecified $3,000. Actual half-SE attribution leaves C $4,646.60. The combined health transfer is $7,647, AGI $40,586 and PTC $4,068. Reordering plans preserves the exact sources and result.
- Separate actual spouses: C $5,000 and F $20,000 have separate half-SE deductions $354/$1,413. The claims are $4,646/$3,000, health $7,646, AGI $40,587 and 2025 PTC $5,221. The isolated 2026 final result is PTC $3,496 and full $104 repayment, without W/X.
- The real guide uses primary C $5,000 and spouse shareholder W-2 $50,000 with actual Medicare wages $47,000 and premiums included in income. Health is $7,646, AGI $47,000 and PTC $4,515. Editing the third plan revokes confirmation; explicit reconfirmation restores calculation; blank payment remains unknown through reload.

These are independently derived fixtures, not published IRS numerical examples. Software/source review is not independent human tax qualification.

## Preserved failures and verification

Evidence is retained under `.local/upgrade-evidence/health-nonspecified-stop-*`.

- `red.log`: the three initial canonical cases reproduced the existing negative-W15 rejection before implementation.
- `pdf-red.log`: four canonical cases passed while the new PDF path rejected the unrecognized method before its source binding was added.
- `cohort.log`: the first six-file engine/PDF cohort passed 18 cases.
- `followthrough.log`: two authored follow-through issues were retained. The first isolated 2026 fixture correctly hit the existing unverified multiple-trade SE allocation guard; its replacement uses actual separate owners and preserves that unrelated guard. The DOM test used the wrong existing policy label. `followthrough-corrected.log` passes all three cases with the source and privacy assertions preserved.
- `records-tests.log`: the runner stopped before discovery because its pinned Python environment was omitted. `records-tests-configured.log` passes after supplying the existing PDF environment; no dependency installation or test change was required.
- `workspace.log`: the authored expectation incorrectly requested a physical ordinary Form 8962 filename. `workspace-corrected.log` passes against the existing ordinary reference summary, preserving final credit, both business forms, source immutability and every-page privacy/notice assertions.
- Render inspection found legacy Step 2 wording in the new stopped-method appendix. `output-label-red.log` reproduces that misleading label; `output-label-green.log` passes 11 cases across four output consumers after the stop-only text identifies the actual ordinary final credit. No calculation changed. The initial PDF cohort remains retained; the final cohort is regenerated from the final mapper.
- `browser.log`: both production desktop/mobile workflows pass with zero retries and normal clicks. The loopback server was stopped afterward. No product UI change was needed.
- `broad.log`: 763 cases across 72 files pass. Two requested stale filename filters matched no files; the actual readiness and NOL files were then run explicitly in `readiness-nol.log`, passing 40 cases across four files. No full-repository or coverage run is claimed.
- `health-nonspecified-stop-artifacts-final/manifest.json` retains same-owner, separate-owner and actual guided forms plus the merged workspace. Its generator and source hashes are retained separately. Independent reopening, rendering and final scoped checks are recorded in the final evidence manifest. The initial reader lacked Pillow in the PDF-only environment; the configured bundled document runtime supplies both reader and renderer, with no PDF/product change.

## Finite ordinary-health remainder

| Cohort in the existing brief | Status after this source slice |
| --- | --- |
| Ordinary/shared Situation 3/4, agreement/default, overlap, shared plus unshared originals, actual same-return owner payments, known-zero noncoverage advances, monthly coverage-family split and determined signed multiple-business limits | Previously delivered within documented source bounds. The explicit consistent monthly full-plan allocation remains a reasonable-method inference, not an IRS numerical example. |
| Separate business/owner worksheets, applicable P/7206 stop, negative W15 with remaining capacity, remaining source gross-income attribution | The published stop is implemented here and has independent agent source/PDF review. The other named worksheet/source cases remain internal work. No zero floor is inferred for negative W15. |
| Eligible outside-tax-family child or other allowable person, actual owner-paid outside person, paid share different from Part IV allocation | Internal source/calculation completion. Keep section 162(l) eligible-person/payment facts distinct from section 36B tax-family allocation; an agreement does not establish payment. |
| Positive actual advances attributable to a noncoverage-family person | Source method remains guarded. Continue determined cohorts internally; do not substitute a health benchmark ratio for actual advance attribution. |
| Actual alternative-marriage calculation composed with preceding health/shared-policy sources | Internal canonical composition remains. Reuse the actual marriage worksheet on each replay and verify once-only income, QBI, credit, repayment and private output. |
| Binding 2025 joint capped repayment split between owners or between health-qualified/nonqualified groups when the split changes the deduction | Precise unresolved interpretation. Reg. 1.162(l)-1 does not supply the reviewed cross-owner cap allocation. Downstream QBI proportional attribution cannot establish upstream cap ownership. |

For positive noncoverage advances, [Reg. 1.162(l)-1(a)(1)–(3)](https://www.ecfr.gov/current/title-26/section-1.162(l)-1) constrains specified premiums, corresponding credit and actual payments/attributable repayment. Aggregate `min(full premium minus credit, actual cash plus repayment, earned limit)` is only a necessary bound until the source-level payment bridge is established. In the researched $15,000 full/$10,000 specified/$5,000 other example with $6,000 specified advances, $4,000 other advances, $9,000 credit and $375 repayment, the proposed $5,375 total would require $4,375 nonspecified cost after a $1,000 specified ceiling. Original nonspecified cash plus the entire repayment is only $1,375. The extra $3,000 equals credit less specified advances; annual net reconciliation alone does not expressly establish it as nonspecified taxpayer payment. The generic positive-advance guard is unchanged. This is an exact unresolved source-method question, not a declaration that the taxpayer is legally ineligible.

The last row does not turn uncapped repayment, one identified qualifying owner, known-zero advances or source-complete no-credit cases into external blockers. Continue those determined internal methods within this finite queue. No new elective health regime is added.

## Final frozen author evidence

Final checks pass: 570 tests across 11 files (the nine new source/output/guide cases plus strict spec tests), root and web types, 5,584 spec references, generated 530-row inventory check, and production web build. Scoped lint has zero errors and nine unchanged warnings. The final 570 overlaps the broader 763/72 cohort; the separate readiness/NOL 40/4 is reported independently. No full-repository or coverage claim is made.

The final saved cohort contains 10 PDFs, 54 pages, 78 nonempty fields and 12 literal field assertions (six completed claims and six blank identifier fields). All hashes, exact per-page notices and bounded identifier checks pass through the independent reader. Five all-page contacts, six footer sheets, enlarged footer crops, readable physical/trace/reference pages and all four retained browser screenshots were inspected. The final mapper distinguishes actual ordinary final credit from special Step 2. The production browser 2/2 pass used the same engine/UI/source fixtures before that final caption-only correction; the final build and PDF tests include the correction. The loopback server is stopped.

Exact reports and their hashes are in `.local/upgrade-evidence/health-nonspecified-stop-verification.json`. Artifact generation, reader, visual and pixel evidence is in `.local/upgrade-evidence/health-nonspecified-stop-artifacts-final/`. The final source hashes match the artifact generation manifest. The original label-red, source-red and authored fixture/reader failures remain retained separately. Independent agent source/software and artifact review is recorded below; no human tax/form qualification is claimed.

## Independent review and current-base integration

Parent independently verified the exact frozen source hashes and passed 13 cases across seven files, including four private controls. The review retains its initial two AGI oracle failures: the separate spouse half-SE deduction rounds to $1,131, not $1,130. Only the private expectation changed; the reviewed product stayed fixed. Source report `.local/upgrade-evidence/parent-health-stop-source-review.json` has SHA256 `eeb97d940a4bd7348a69dc968dbf54b811c5fe8ca3af059cea52ea6aaed70c57`.

The separate artifact review reopened the unchanged ten PDFs, 54 pages and 78 populated fields, checked 18 independently derived physical values, 21 reference values and four workspace values, and visually inspected three contact sheets and 14 readable pages. Exact producer-input Decimal derivations were retained for all three canonical source variants. Report `.local/upgrade-evidence/parent-health-stop-pdf-review/checks.json` has SHA256 `a85c7d2c37eb109959732fdbe0d46b8f4753d0d13620635a7cac7f34391ec172`. This is source/software and artifact review by an agent, not human tax or filing qualification.

Original source inputs and calculated results were reproduced in a separate copy from the unchanged frozen producer and fixtures; their manifest is `.local/upgrade-evidence/health-nonspecified-stop-original-sources/manifest.json`, SHA256 `1295ba26b4f810571304655c893f1230b119e9b056fc46cd4648a83504d7f7a0`. The reconstructed workspace preserves the actual ID, year, facts, guided state and producer arguments. Its creation/update/audit timestamps and audit ID are expressly reconstructed, not historical originals. No retained PDF bytes changed.

Final integration is prepared privately on `f6f9d063dd213484692a2cbaf231c9635238b5af` with versions `2025.156` and `2026.153-law-integration-draft`. The only executable merge from the frozen review is `src/engine/federal.ts`: the already delivered determined-charity import, selection guard and regular/AMT carry assembly are retained exactly. The unchanged stop delta is applied on top. All 126 previous implementation links and 532 existing inventory rows are retained; the stop adds one link and one row. No readiness, filing or human-review gate is promoted.

The final private rebase passes 937 tests across 95 files at one worker, covering the tax, source, guide, workspace, PDF, overlapping-policy, ordinary NOL and newly delivered determined-charity consumers, strict spec checks and unchanged return-readiness tests. Root and web types, 5,639 spec references, the 533-row inventory check, scoped lint (zero errors/nine existing warnings), diff check and production web build pass. The original browser and reviewed artifact cohorts remain unchanged and are not represented as new final-base runs. Evidence is retained as `health-nonspecified-stop-rebase-*`; no full-repository or coverage result is claimed.
