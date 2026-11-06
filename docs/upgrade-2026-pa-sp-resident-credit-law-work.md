# Schedule SP line 13 resident-credit law correction

This is a separate law successor to the immutable fixture-only package. Its base is 44e752d0a45021f544aa910d1bc40710ae157e1e plus the exact prior three-file package manifest d702f8b0ee36b1f16a8962410fb799e00f0b04b98620812c49f91321d9d5abf0. The predecessor is not overwritten or claimed correct for SP ordering.

Official 2025 Schedule SP Section IV line 13 takes PA40 line22 resident credit. Line14 subtracts that credit from line12 tax, and line 16 applies the table percentage, rounded to whole dollars. The form page 2, its instructions PDF page 8 and PA40IN printed page39 were read as complete rendered pages; live official PDF text was refreshed. Retained official source bytes were copied with hashes, without claiming a fresh byte-identical download because sandbox DNS was unavailable. This was read-only source inspection, with no PDF creation.

For the synthetic MFJ 14000 example, PA tax 430, NY shared compensation 5000 and supplied final paid tax 200 yield G-L credit 154. Schedule SP therefore computes (430−154)*60%=165.60→166. Adding resident 154 and other 50 gives total credits 370 and net liability 60. The predecessor's 138/342/88 follow the wrong raw-paid-tax reduction 200 and must be corrected with preserved before versions. A different synthetic paid 80 remains credit 80 and forgiveness 210. Paid 800 still carries 154 and cannot further reduce forgiveness. Neither raw withholding nor unknown actual foreign facts are inferred.

Minimal products: two legacy orchestrators carry their final whole-dollar PA-40 line22 resident credit into the existing taxPaidToOtherStates SP field. Nonresident G-L continues zero. The actual ordinary composer already uses base.residentCredit and stays untouched. SP primitive arithmetic and public field names stay unchanged; only its comment/audit description becomes explicit PA-40 line 22. Existing SP spec wording is corrected, including its erroneous line19 transfer note to the official line21.

Author source-first: eleven independently derived regression controls cover resident/PY/NR, both G-L cap sides, whole-return cap, aggregate per-state credit, zero, precedence, half-up whole-dollar rounding and reciprocal rejection. All products and existing monetary expectations remain unchanged until genuine failure evidence is retained. The original source-first receipt predates product edits; filing remains disabled.

Actual RED evidence: the first eleven-test run produced six genuine failures and five passes, stopping at the incorrect line13 raw-paid carry. A separately frozen refinement changed only the first new case to soft assertions with identical numeric oracles. Its second eleven-test run again failed six tests/five passed and explicitly exposed old138 versus166,342 versus370 and88 versus60. Both source-first versions and failures remain immutable. No product was edited until those failures were retained.

Final bounded checks passed on the exact candidate:492 tests/six files including all eleven new and481 original legacy resident/PY/NR/SP/G-L/full-return controls; root/web/contracts types;7,060/7,060 spec references; separately625 strict AST catalog tests; strict product/new-control lint zero warnings/errors; engine and web builds. Historical test-file repository-policy lint exited zero with140 warnings. Original/candidate JSON comparisons prove identical rule/message/source-code/severity multiplicity and zero new warnings. No warning waiver or configuration change was made.

Only four old output assertion lines are intentionally corrected: the three obsolete full-return138/342/88 outputs become166/370/60, and the old resident SP input diagnostic500 becomes307, matching its already-asserted PA40 resident credit307. All other assertions and every original input amount remain unchanged. All4,429 unowned baseline regular-file hashes remain exact; the actual ordinary composer is unchanged and already carries base.residentCredit. Source-first eleven oracles are byte-identical to the retained deep-red version. These author-private checks establish no PDF, hosted, human-review or filing qualification. Parent integration and its additional rounding correction are recorded below.

## Parent integration and printed-dollar boundary

Independent parent review found a further carry boundary: raw G-L credit80.50
reports81 on PA-40 line22. With PA tax430 and a60% SP rate, SP must calculate
(430−81)*60%=209.40→209, rather than using raw80.50 and reporting210. New
source-first resident/part-year controls independently exercise80.49/.50/.51.
The official [2025 Schedule SP and instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40sp.pdf)
were refreshed November3: SectionIV13 carries PA-40 line22, and the recording
instructions require whole-dollar half-up rounding.

Before products, parent replay retained six genuine failures/five passes in the
author controls and allsix new cents controls failed. The root correction adds
Decimal roundDollar at both caller carries and imports that existing helper in
the nonresident caller. The first attempted green run exposed the missing import;
its20 failures are retained separately, and no test expectation changed to fix it.

The corrected parent run passes1,165 tests/ten files, including17 new law/cents
controls, legacy resident/part-year/nonresident/SP/G-L/full-return, canonical
ordinary/resident-source controls and strict AST catalog. Allthree type checks,
7,062 spec references, inventory check, strict products/new-test lint, engine
and web builds pass. Historical-file repository-policy lint exits0 with140
preexisting warnings; the author baseline comparison proves zero new warnings.
No lint configuration, global coverage threshold or readiness gate changed.

Durable private receipts: `nov03-parent-pa-sp-credit-main` preserves both genuine
red runs, original before files, exact author-copy proof and the explicit root
delta; `nov03-parent-pa-sp-credit-main-green-v2/checks.json` records each current
command, exit code and log hash. Full unit/coverage/browser/CI and qualified human
tax review remain separate open gates. No PDF was created for this package.

A distinct agent read-only review approves this narrow internal law integration:
receipt949a834cd835d0ad9d85abed3091c6251b30fd4264a50c37c3eb7cc54642e0d1.
It independently refreshed official SP pages2/3/8 and PA40IN pages4/39, computed
the cents boundaries with Python Decimal, compared all product deltas and
validated the parent check/log hashes. It did not rerun Node or supply qualified
human tax review.
