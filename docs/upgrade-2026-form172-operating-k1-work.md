# Actual ordinary operating K-1 current losses

This package connects complete ordinary operating K-1 sources to the existing current Form 172 calculation. It classifies the actual Schedule E ordinary amount after basis and at-risk limits as business income or loss. It preserves separately stated charitable amounts, original basis suspensions, QBI history, current excess-business-loss carry and independent regular/AMT histories. No calculated allowance, AGI or loss is collected.

## Source method

[Form 172 instructions](https://www.irs.gov/instructions/i172) permit partners and S-corporation shareholders to use their own shares of business income and deductions in their individual NOL calculations. Its Part I nonbusiness deduction limitation remains distinct. [Reg. 1.172-3(a)(3)](https://www.ecfr.gov/current/title-26/section-1.172-3) limits ordinary nonbusiness deductions to applicable nonbusiness income and treats wages as business income. [Schedule K-1 instructions, Box 1](https://www.irs.gov/instructions/i1065sk1) direct a materially participating partner's ordinary amount to Schedule E after basis and at-risk limits. Sources were refreshed October 26, 2026.

The helper uses the existing validated original K-1, section 199A, basis and Form 6198 packets. Each original must have a matching current Form 172 index, entity, owner and actual participation/nontrading record. The supported cohort is an ordinary continuing nonpassive business with complete independent histories and confirmed identical regular/AMT basis and loss-limit treatment. An actual false answer to all-investment-at-risk is retained: the existing completed Form 6198 calculates the K-1 limit. Unknown remains unknown; the older Schedule C all-at-risk boundary is unchanged.

The source sum must equal the completed Schedule E and Schedule 1 ordinary transfer. Current Form 172 separately reconciles business and nonbusiness income, selected deductions, old NOL use and current EBL. Charitable deductions retain their own original source, percentage and nonbusiness limits. This package does not declare charity exempt from section 465 or introduce binding charitable at-risk allocation.

## Independently derived controls

These are derived source examples, not published matching numerical examples.

| Actual original facts | Result |
| --- | --- |
| Ordinary loss 80,000 and cash charity 20,000, available basis 50,000 and nonbinding risk | Existing basis allocation allows ordinary loss 40,000 and charity 10,000; suspensions remain 40,000 and 10,000. Wages 20,000 plus interest 30,000 less ordinary loss gives AGI 10,000. SALT 20,000 plus charity 6,000 fits nonbusiness income 30,000: regular NOL 16,000. AMT retains charity but removes SALT: AMTI 4,000, no ATNOL. Charity percentage carry is 4,000 in each system. Partnership and S-corporation originals produce the same amounts with distinct source identities. |
| No gift, ordinary loss 100,000, basis 100,000 and actual at-risk capacity 60,000 | Allowed loss 60,000; wages 20,000 plus interest 5,000 gives AGI -35,000. Standard deduction 15,750 exceeds nonbusiness income by 10,750: regular NOL 40,000 and AMT NOL 35,000. No charitable packet is invented. |
| Ordinary loss 500,000, charity 10,000, full basis/risk, wages 20,000 and interest 5,000 | Current EBL 187,000 leaves AGI -288,000. Regular Part I loss 293,000 plus EBL gives new regular carry 480,000; AMT Part I 288,000 plus EBL gives 475,000. Charity percentage carry 10,000 stays distinct. |
| Ordinary loss 60,000, wages 20,000, interest 30,000, SALT 20,000 and a direct cash receipt 1,000 | AGI -10,000; actual SALT fits nonbusiness income. Regular loss is 30,000, AMT loss 10,000, and direct charity carry 1,000 in each system. No K-1 gift is inferred. |
| Isolated 2026 original loss 80,000, cash 20,000 and basis 50,000 | AGI 10,000; floor 50 gives itemized charity 5,950, regular NOL 15,950, AMTI 4,050 and charity carry 4,050. Actual standard 16,100 plus section 170(p) deduction 1,000 gives regular NOL 7,100, AMTI 9,000 and percentage carry 4,000. Public calculation and export gates remain closed. |

## Source intake and private output

The actual existing K-1 activity appears as a current-business selection in the guided loss panel. Confirming its source preserves the original basis, risk and charitable packets; changing the link revokes dependent confirmations. No legacy aggregate or calculated loss fields are inserted. The existing linked K-1 collector remains the actual facts source.

Original QBI and charitable review contexts are prepared before redaction. Current source digest, original index/owner and exact ordinary amounts are freshly checked against retained Form 172 results. Removed sources, altered identity or changed results reject before template access. Form 6251 forwards the independent QBI context when it includes the current-loss statement. Static ordinal rows do not print private source references.

## Verification boundary

Spec-linked tests first reproduced the unsupported ordinary-source handoff, missing actual guided option and private PDF context failures. Additional retained reds established that a source-complete no-gift K-1 could not accompany a direct charitable receipt and that direct Form 6251 needed the original QBI context before I/O. These became behavioral regressions. An author S-corporation fixture initially omitted known-zero direct debt fields; those actual fictional zero values were supplied without changing basis rules. A DOM expectation initially overlooked the intended dependent confirmation invalidation and was corrected while retaining original-source equality checks.

Development checks passed 166 adjacent tests across 51 files, then the ten package cases and strict/readiness cohort. A later module filename alignment matches the existing spec, avoiding a misleading extra missing-spec inventory row. New test non-null assertions were replaced with explicit fictional-source checks. No monetary formula changed during these naming/test refinements.

The final private source is rebased on delivered prior-release `7c11d1ca6524fe4c83e9fde7e17d7462487f3dae`, preserving the delivered health and performance files. Exact package/spec/readiness checks pass 604 tests across 13 files: ten package cases, 571 strict specification/inventory cases and 23 readiness cases. Root types and the production web build pass; all 5,727 spec references resolve and the generated inventory has 540 entries. Scoped lint has no errors and two existing unrelated fill-return non-null warnings. Production desktop/mobile tests pass two cases with zero retries on this final base; four screenshots were inspected and the localhost server was stopped. They check actual confirmation, save/reload, missing-source blocking and the real redacted draft PDF. Exact logs are recorded in the immutable source manifest. Retained original/PDF artifact production and independent review were pending at the original source freeze and are completed separately below. No human tax-law, filing or production qualification is claimed.

## Finite remaining methods

This closes the actual ordinary active K-1 current Form 172 classification gap within its validated source cohort. Binding charitable section 465 allocation, positive charitable-comparison benefit with COD, and changed filing-unit histories remain separate internal work. Actual passive dispositions, trading, rental, foreign and broader capital classifications retain their existing separate source methods; this package does not silently relabel those originals as ordinary active income. The four precise charitable floor/vintage, multi-excess NOL, mixed-medium B and amended prior-C allocation questions remain separately recorded.


## Completed independent review and final rebase

The independent source review of immutable `57f375ed20f27cca509af4297f4d641463339413` passed 16 tests across seven files with one worker, including six private original-derived controls. The reviewer verified all 23 source hashes before and after. A 90,000 ordinary loss, 30,000 gift and 36,000 basis independently yield 27,000 ordinary loss and 9,000 gift, AGI 23,000, regular NOL 6,000 and AMTI 14,000. Additional controls cover binding ordinary risk, two original activities in reversed order, unknown facts, original-context cloning/replacement and guided invalidation. Evidence: `.local/upgrade-evidence/facts-form172-operating-k1-source-review.json`, SHA-256 `a66cb6b8a3a68fff1185ee4a19ffd895e17602adf94b3383635a7b54a4423ca1`.

The saved artifact set retains six complete canonical originals and the actual guided workspace original. Its 33 PDFs contain 92 pages and 191 populated fields. The author independently reopened the files, checked 98 physical, 77 reference and five workspace literals, and inspected all-page contacts, footers and readable details. The separate reviewer derived expectations from the originals using Decimal, checked 183 physical values including 29 flattened-workspace values, 474 reference values and 191 appearance fields, and personally inspected seven contacts, seven footer contacts and 17 readable pages. All producer/source and PDF hashes remain unchanged. Evidence: `.local/upgrade-evidence/facts-form172-operating-k1-artifact-review/checks.json`, SHA-256 `95edc76d0b7174147c02f3cfd89825778980ebfc12aeaf00ca36d591ec068ae0`; artifact manifest SHA-256 `0c02a89a572f4cdf360776fbaf888d6e79e76157f1539b8b0377772f228195df`. These are agent source/software/artifact reviews, not human tax or filing qualification.

Retained reader-only setup corrections address Form6251 label matching, the S-corporation1366(d) label, ordinary QBI's existing whole-dollar transfer, and the established policy that explicitly identified business EINs remain visible. They changed no monetary oracle or product source. The initial standalone Form461 producer output lacked the existing full-return notice; that first artifact is retained separately, and the final producer applies the existing review notice. Production source is unchanged.

The final private integration base is documentation-only `c9db24a26da203d3835d89dd644884c22e1c6320`, preserving health delivery `5489eb6ba2a812c7d0bed63aad79ae45bef5e947`. All 20 reviewed executable, specification, fixture, UI and test blobs are byte-identical to the source review. Only the owned evidence ledger, append-only implementation link/generated inventory and source provenance are updated. Rules advance to `2025.164` and `2026.161-law-integration-draft`; the preceding health sources, all other source records, filing flags and calculation/review gates remain unchanged. Exact final checks are recorded in the final snapshot; main/index integration remains parent-controlled.


Final validation passed 609 tests across 14 files with one worker on the exact delivered health code: ten package cases, 574 strict specification/inventory checks and 25 readiness/provenance cases. The subsequent base change contains only three disjoint central documentation files, preserved byte-for-byte; no checked code or test changed. Root and web types, 5,742 specification references, generated 543-entry inventory validation and scoped lint pass on the final documentation base. Lint retains the same two existing fill-return warnings and no errors. All 542 predecessor inventory rows and 135 predecessor implementation links are unchanged; this package adds exactly one of each. The already-passing production build and two desktop/mobile cases belong to the reviewed 57f source cohort; they are not relabeled as reruns on the final base. Final logs and SHA-256 values are retained in `form172-operating-k1-delivery-snapshot.json` under local upgrade evidence.

Parent integration on `c9db24a2` independently verified all 24 owned hashes,
the 20 unchanged reviewed product/spec/test/UI blobs, the final check and review
report hashes, and preservation of all prior inventory/link rows. The ten
package cases in six files pass on the main checkout with one worker, including
the isolated 2026 guard, actual guided source and private PDF/workspace paths.
Evidence: `parent-operating-k1-main-tests.log`. The diff is scoped to this
package; unrelated and preceding health/performance changes remain intact.
