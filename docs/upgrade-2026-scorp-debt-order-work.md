# S corporation nondeductible expenses and debt basis

This package repairs the existing ordinary stock/debt calculation in both supported years. It is separate from the proposed actual K-1 charitable-property basis source packet and does not activate that packet or qualify a filing form.

## Source and calculation

The [Form 7203 instructions](https://www.irs.gov/instructions/i7203), Basis of loans and lines 23, 28 and 30, require excess stock nondeductible costs to reduce direct debt basis. The ordinary order applies those costs before losses; an actual [Reg. 1.1367-1(g) election](https://www.ecfr.gov/current/title-26/section-1.1367-1) reverses the order and carries the costs still unabsorbed after both bases. Without that election, those costs do not carry. [Reg. 1.1367-2(b)/(c)](https://www.ecfr.gov/current/title-26/section-1.1367-2) includes both nondeductible and deductible reductions in later restoration. Sources refreshed October 26, 2026; the final form/instructions remain revision December 2022.

For stock 0, debt 100, nondeductible costs 50 and a basis-limited deduction 80, the default result permits 50, suspends 30 and closes debt at zero. The election permits 80, applies the remaining debt 20 to costs, and carries nondeductible costs 30. Actual following-year income 80 can restore 80 of the total prior debt reduction 100. Distributions still reduce stock only.

All arithmetic uses Decimal. The existing internal debt audit keys remain stable; their physical Form 7203 references now identify lines 21–24/28/30/31 accurately. Final total-allowed and suspended audit lines reconcile after debt allocation. The saved reference record retains the actual debt cost reduction, final unabsorbed cost and election carry separately.

## Regression evidence

- `scorp-debt-order-red.log`: four new calculation cases failed before implementation. The parent separately reproduced both default/elected failures in the proposed charitable-property packet; that packet will be rebased and reviewed after this repair.
- `scorp-debt-order-green.log`: 107 tests in three basis files passed.
- `scorp-debt-order-pdf-red.log`: saved reference omitted the new debt cost record before the mapper correction.
- `scorp-debt-order-pdf-green.log`: four tests in two PDF files passed, including actual federal Schedule E results and saved/reopened PDFs.
- `scorp-debt-order-adjacent.log`: 659 tests in nine matched files passed, including federal, Schedule E, basis, semantic-label, PDF and strict spec consumers. Two initially supplied filter names matched no files; the four intended K-1/QBI/461 files were then run explicitly in `scorp-debt-order-k1-consumers.log`: 21 tests passed.
- Root types passed; all 5,060 spec references resolved. Scoped lint had zero errors; existing non-null warnings remain in older tests and the reference mapper.
- Two fictional default/elected PDFs, their reopened text and four inspected page images are retained under `.local/upgrade-evidence/scorp-debt-pdfs/`. Values 50/50/0 and 20/80/30 are visible and unclipped. Initial Poppler rendering printed font-cache warnings but completed; the retained pages were inspected. These are generated reference summaries, not official Form 7203 qualification.

## Boundaries and remaining work

The repair preserves existing direct-debt inputs and actual election semantics. It adds no loan repayment, multiple-loan allocation, guarantees or property-distribution method. Existing partnership handling is unchanged; its legacy unabsorbed nondeductible field is not asserted to be a qualified carry. The charitable source packet, section 465 allocation, canonical charitable handoff and actual collector remain separate internal work. Independent review and immutable check evidence is recorded below; human tax/form qualification and existing year/export gates remain unchanged.

## Immutable verification and independent review

The clean review tree `cd7dd920eeb3a3a7c845fe97c6f6753b15506747` on `76e3538` passed 680 tests in 13 files, root types, all 5,063 spec references, and scoped lint with zero errors/82 existing warnings. The three additional references relative to the development run came from the newer base. Exact logs are `scorp-debt-order-exact-{tests,types,spec,lint}.log`; the nine-path manifest and patch are retained locally.

The parent independently checked all nine file hashes, refreshed the Form 7203 source, and passed 85 tests in five matched files, including additional nonzero stock/debt default/election and category-conservation controls (`parent-scorp-debt-review.log`). One additional requested edge filter did not match; the 680-test owned cohort did include the actual edge file. The parent also inspected both retained second pages. No actionable issue remained in that bounded review. This is agent source/software review, not human tax or filing qualification. The optional charitable-property source package remains separate.

Final integration on `fea969d99797b3180d1fea1bbe99c66aee5890a4` preserved all eight reviewed executable/spec/test/metadata hashes; only this evidence record changed. The same 680 tests in 13 files and root types passed, and all 5,068 references resolved (`scorp-debt-order-final-{tests,types,spec}.log`). The five additional references came from the intervening EIC PDF package. Source versions are 2025.111 and 2026.108. The final scoped diff check passed; unrelated local evidence and untracked files are excluded.
