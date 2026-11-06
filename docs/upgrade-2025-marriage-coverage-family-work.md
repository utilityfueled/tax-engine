# Actual monthly coverage in marriage-year health worksheets

This private package composes complete monthly coverage-family sources with the existing marriage and self-employed health methods. Independent review and final delivery are pending. The first exact production build/browser and retained-source artifact pass are complete; the saved-form correction below is being verified in a separate V2 artifact set. It makes no filing, independent human tax-law or form qualification claim.

The governing sources were refreshed October 27, 2026: [Pub974](https://www.irs.gov/publications/p974), including the coverage-family definition, Gary/Sue premium split, Worksheets W/X and I/III, and the signed simplified Step3; [final Form8962 instructions](https://www.irs.gov/instructions/i8962), including line9, Table2 and PartV; and [Reg1.36B-4(b)(2)](https://www.ecfr.gov/current/title-26/section-1.36B-4). Annual alternative-family assignment, actual QHP enrollment, and monthly PTC eligibility are separate facts. WorksheetI/III line8 uses the first full enrollment month and line9 the last premarriage enrollment month. A month of other MEC can establish an enrollment endpoint while contributing no eligible benchmark member.

The existing full original, per-person payments, complete monthly eligibility and corrected benchmark records remain independent. Actual PartIV allocation is completed first. Full allocated enrollment premiums and advances remain in the reconciliation. The coverage/noncoverage SLCSP ratio determines specified health premiums; it does not reduce the Form8962 full enrollment premiums or credit. A source-derived ineligible premium before the first full alternative month remains in the joint original ledger without creating an alternative contribution or credit. There is no entered amount, income or credit override.

Derived controls in `spec/federal/marketplace-marriage-coverage-family.yaml` include:

| Actual source cohort | Independently derived result |
| --- | --- |
| Annual primary policy with February and December ineligible through other MEC | Health7214, AGI85721, final PTC4426, repayment2574; full premium12000 and advances7000. |
| Actual January partial, February full but MEC-ineligible, other eligible months through November | Alternative startsFebruary; health7855, AGI85080, final PTC3853, repayment2447; all original premiums retained. A complete independently allocated half-share original gives the same own result. |
| Own qualifying child in annual alternative family, actual other government MEC for the child, primary eligible; full premium15000/advances12000, coverage/noncoverage benchmarks12000/6000 | Specified10000/nonspecified5000, W16 negative2000; computed X maximum4950; Step2 credit11610, signed Step3 negative1610, totalhealth3390; AGI52371, finalPTC11545/repayment455. Actual child advances are zero; annual alternative family size remains2. |

The guides use the same saved monthly evidence. Copying creates rows from full enrollment endpoints and actual eligible members, retaining blank amounts/references/confirmations. Empty groups require an actual zero. Source edits revoke outer and nested confirmations. The complete adjustments-shell control confirms source copying and re-entry, with no production defaults for unknown facts.

Retained evidence under `.local/upgrade-evidence/marriage-coverage-health-*` includes the initial source3-fail/1-pass regression, two guide failures and the full-shell copied-January failure. Initial canonical tests made two reader mistakes (the specified-only QBI audit component versus total health, and `allowedCredit` versus actual `credit`); all tax amounts matched. The mixed-person control initially compared periodic Decimal representations to exact integers; the corrected assertion checks documented cents and exact full-premium conservation. No calculation was changed for those test corrections. Initial web types found optional original-source IDs in the copier; the narrow optional access preserves missing-source rejection.

The current source/canonical/guide/shell plus adjacent marriage cohort passes54 tests/11 files with one worker; saved PDF/context/workspace controls pass3 tests/2 files. Root and web types pass, all5,932 spec references validate, and scoped lint has zero errors or warnings. The unchanged V1 production build and desktop/mobile browser workflow passed two cases with one worker and zero retries. The initial allowlisted build PATH omitted pnpm before any build started; the absolute-path retry passed. A first loopback server start was denied before browser assertions; the approved local attempt passed and its task-owned server stopped. Actual saved guide/workspace sources and both screenshots were retained and inspected. Existing year/readiness/qualification gates remain unchanged.

## Saved-form correction and retained evidence

The V1 producer saved four canonical original inputs before calculation, four distinctly labeled calculated results, and six actual guided state/workspace/bridge JSON records. It produced 14 PDFs with 143 pages and 428 populated fields. Original inputs, producer hashes and V1 PDFs remain immutable. The independent Decimal reader matched the health, credit and repayment controls but exposed a real December physical-form omission: an enrolled month made credit-ineligible by other MEC lost columns(a)–(e), although the full original premium remained in the source/reference. The reader also retained separate nonproduct corrections for a validation-only source flag and whole-dollar versus decimal-formatted nonspecified-premium text. These reader issues did not change any original, calculation or PDF.

Refreshed Pub974 Step7 explicitly transfers Worksheet3 columns(a), (b) and (f), uses the joint monthly contribution for fully married months, and derives columns(d)/(e). Final Form8962 instructions likewise retain actual allocated enrollment premiums. The spec-linked saved-PDF regression first failed on five blank December fields, then passed after the elected-marriage monthly audit transfer was corrected. The partial-January ordinary and shared controls now retain December(a)–(f)=1000/0/603/0/0/0 and January=1000/0/0/0/0/0. Health7855, finalPTC3853 and repayment2447 remain unchanged. The ordinary non-election and joint-income eligibility rules are preserved. The narrow corrected PDF suite passes three tests in one file; exact V2 adjacent/static/build/browser and versioned artifact checks follow. The original red and all V1 reader findings are retained under `.local/upgrade-evidence/marriage-coverage-health-*`.

## Finite remaining methods

This package establishes ordinary and existing shared-policy monthly coverage composition only. Existing premarital dependent/child qualification remains a sufficient actual-source cohort; an end-year spouse or stepchild label alone does not prove qualification before the wedding. Owner-paid outside-family persons and positive other-return credit attribution remain separate researched source methods. Positive noncoverage-person advances with partial or capped repayment retain their existing payment-attribution boundary; no aggregate cap alone proves deductible paid shares. The exact binding2025 joint repayment-cap split between owners remains a separate interpretation question, not answered by the downstream QBI ratio. A person appearing on both a filer and other-recipient original needs its separate premium grouping. These guards are incomplete methods, not universal legal ineligibility. No additional health regime is added.

## Corrected V2 independent review and final rebase

The V2 author static/build/browser and saved-artifact receipts bind tree
`0430d7a009de8daecbef55768f891844d27e5a07`. The earlier scoped-lint sentence
incorrectly stated zero warnings; the retained log reports zero errors and
151 existing warnings. `marriage-coverage-health-v2-lint-doc-addendum.json`
records this documentation correction without changing frozen source.

Parent independent source review passes 21 tests in seven files with one
worker, including six new controls at a different household income. All
3,602 tracked regular files and six original symlink targets are unchanged.
The source review receipt SHA256 is
`94ba0dd1e365241ce9654e2f3d325c5e63b04595fa73ba4c6b4b621f7ae514a9`.
Saved-original/PDF review is assigned separately and remains pending.

Final integration is prepared privately on `25f71f06`, preserving the actual
bond history, Form8815 reference readiness/pagination and reviewed compression
patch. Metadata advances to 2025.176 / 2026.173 draft. Exact frozen final
checks and original-output clearance must be recorded before main adoption.

## Final software review and integration

Independent original/output review is clear for V2 tree `0430d7a0`. It derives
six original cases without using engine outputs as an oracle and reopens all
14 PDFs, 148 pages and 443 populated fields. The retained report records
4,084 numeric, source and appearance checks, 228 flattened placements, 112
additional original-identifier checks and 148 visible footer raster checks.
Eight contact sheets, eight footer contacts and 17 readable pages were
personally inspected. The report SHA256 is
`387dd9b27a8179d3a9819ee1bbfbba0a5e1ade2a2ae4415c82c999cc304bb77c`.
The reader's gross-premium, Step7 and policy-number expectation corrections
remain recorded; they did not require a product change.

The final private rebase on `25f71f06` is tree
`ac711dea0789685d2d44bb9ec9a5dfe202a719c3`, manifest SHA256
`e70502c6491d7623fad8898db61825b83a551b3c5982bc0463a4b26d2a70ee69`.
All 18 non-ledger V2 paths are identical. Final affected checks pass 64 tests
in 14 files with one worker, including the parent's six private controls.
Root, web and contract types, 5,961 spec references, all 562 inventory entries
and scoped lint (zero errors, 151 existing warnings) pass. The check receipt
SHA256 is `bdf28bb86d6f72e5d299630b53756b11c92f3c32bbec90e177d20b60938682f4`.
All preceding inventory rows and 148 shared-method associations are preserved.

Root and production web builds pass. The final production browser exercises
both 1280 and 390 viewports with one worker and zero retries: 2/2 pass.
The browser log SHA256 is
`f28d596616851653e01795532f798dfd9607eab77ce26faabd39a12bec3dc01f`.
The independent reader verifies both final saved original states and workspace
JSON, allowing only generated IDs and timestamps, and inspects both screenshots.
All 3,638 frozen source hashes remain unchanged. Final browser downloads were
exercised but their PDF files were not retained separately; reopened PDF
evidence remains attributed to the V2 producer above. The final source includes
the separately reviewed pako compression patch. No saved PDF is relabeled as a
new producer's output. The task-owned loopback server is stopped.

Main integration passes 58 tests in 13 files with one worker in 18.49 seconds.
The main log SHA256 is
`949fd6c936a41ed63dc49210db1316035fe0be0c481be7ac04aae897d209d82c`.
All non-ledger adopted paths match the frozen final source. The diff and
whitespace check pass. No human tax, filing, current-year, state or model
qualification is inferred from this work.
