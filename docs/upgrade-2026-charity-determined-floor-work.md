# Determined current-year charitable floor with original prior sources

This package uses one source-bound percentage calculation for actual current and prior ordinary contributions. It applies the2026 itemized floor when the original contribution year and cash/property medium of every affected amount are determined, then selects the appropriate carry after the actual deduction choice. No calculated floor, allowance, priority or carry is collected from the user.

## Source method

Official sources refreshed2026-10-26: [IRC170(b)(1)(B), (C), (D), (G), (I) and(d)(1)(C)](https://uscode.house.gov/us/usc/119-118/t26/s170/), [Reg1.170A-10](https://www.ecfr.gov/current/title-26/section-1.170A-10), and final2025 [Publication526, Carryovers](https://www.irs.gov/publications/p526). The historical carry rules supply current-before-prior within category, original oldest-vintage use and expiry. The amended percentage provisions and floor apply only after2025; historical cash limits are not substituted for the amended text.

The existing reviewed2026 percentage method is extracted into `calculateCharitableCategoryUse`, without changing its limits or prior-C reservation. It validates original receipts and complete independent prior records before deriving current allowance, prior treated-paid use and percentage excess. The explicit nonitemized wrapper continues to use those amounts without an itemized deduction. The new itemized candidate applies the floor in statutory D,C,B,E,A,G order; specialized E is outside this ordinary source contract.

Every positive floor hit must have exactly zero allowed prior contribution in that category. This is a sufficient original-source condition: all affected contributions are current-year, so no ordering between current and prior gifts needs to be inferred. A zero floor requires no vintage allocation. Existing B-medium proof must also determine the actual current allowance and carry; a partial mixed cash/property result still rejects. Current percentage excess permits the determined current floor carry under170(d)(1)(C); an older remaining balance alone does not create a current floor carry.

Original prior use, source identity, contribution year and expiry are identical in the itemized and nonitemized candidates. Automatic selection chooses between those candidates after computing the actual deduction; it never invents standard entitlement. Explicit standard/nonitemized selection retains its existing source method. A wrong, missing or stale internal proof cannot authorize the new selected carry. Existing real2026 preview, calculation and PDF export gates remain closed.

## Derived literal controls

These are statutory calculations, not published matching examples or human qualification. At a100,000 contribution base:

| Actual original sources | Before floor | Itemized result | Succeeding current carry |
| --- | --- | --- | --- |
| CurrentG10,000; priorG20,000; currentC40,000; currentD10,000 | G30,000/C20,000/D10,000 | PriorG20,000 plus currentG10,000/C20,000/D9,500 =59,500 | C20,000 and D500; nonitemized retains only C20,000 |
| CurrentG10,000; priorA5,000; currentC20,000; currentBcash40,000; currentD1,000 | G10,000/A5,000/B25,000/C10,000/D0 | Total49,500;500 floor affects currentC | B15,000/C10,500/D1,000; nonitemized C10,000 |
| CurrentG10,000; priorC5,000; currentD500 | G10,000/C5,000/D500 | D absorbs500; priorC5,000 remains allowed | None: there is no percentage excess |
| Same, but currentD499.99 | Positive0.01 floor reaches priorC | Reject pending the separate original-vintage floor method | No fabricated carry |
| PriorG20,000; current cryptoC60,000 plus K-1 stock FMV80,000/basis40,000/available basis20,000 | Current section170 source120,000; allowedC30,000 | CurrentC29,500 plus priorG20,000 | C90,500; separate K-1 basis suspension20,000 remains distinct |

Zero and negative contribution bases retain exact current percentage excess and original surviving balances, while expired records remain separate. Split cents, reordered sources, original identity/history mutations, a balanced K-1 FMV/basis change, and the one-cent floor boundary are covered. Equal monetary results do not make changed original sources interchangeable for private review.

## Reachability and verification

Existing direct, crypto, K-1 and complete charitable-history collectors provide the original facts. The new guide check uses the actual source bridge and prepared charity context, verifies source incompleteness and stale history rejection, and checks the unmocked2026 preview/calculation/PDF gates. No2026 filled return is generated or qualified by this package.

Spec entries preceded the new tests and calculation. Initial core tests failed on the absent new calculation; canonical and guided tests separately failed on the earlier prior-G/current-A-only guards. All initial failures are retained in `.local/upgrade-evidence/charity-determined-floor-*`. One first source-order test incorrectly expected the identity digest to remain identical after reordering originals; the test now asserts unchanged monetary/history results and a changed source digest. Product arithmetic did not change for that test correction.

The first broader cohort passed1,124 tests and exposed two old expectations. The existing five-category nonitemized control also has a determined current-C floor, so its old automatic/itemized rejection now checks actual49,500 deduction/53,500 carry and unchanged15,000 original use; the explicit nonitemized53,000 carry assertions remain intact. The pure-G current/prior control still rejects, with its assertion updated to the precise original-vintage floor error. Both original failure logs remain retained; no guard or monetary assertion was removed to conceal a defect.

The review candidate is rebased privately onto delivered closure commit `2bd4fdd9f6626a72cd7f5084686cb738d21bb90a`, with no upstream product merge. The exact cohort passes1,127 tests in108 files, root/web types,5,549 spec references and the regenerated526-entry inventory; scoped lint has zero errors and five existing warnings. The eight new cases cover the source calculation, final selection and actual guide/private-context gates. Existing2025 source/PDF checks are included in the cohort; no new2026 physical form is generated, and no browser flow is changed. The source snapshot and exact log hashes are retained under `.local/upgrade-evidence/charity-determined-floor-*`. Independent source review is recorded below; final delivery checks remain separate. Local evidence and synthetic source artifacts are excluded from publication. Agent checks do not imply human tax-law review, final-form qualification or filing readiness.

## Finite remaining scope

The remaining determined NOL class is complete original-source cases with zero succeeding-carry benefit or one uniquely affected excess origin, preserving independent regular/AMT claims and selected carry. Four source interpretation questions remain precise and separate: within-category current/prior floor attribution and original expiry, including pre2026 and basis-release origins; nonzero NOL benefit among multiple affected excess origins beyond the specified public-before-other order; partial same-category cash/property attribution; and prior-C treated-paid consumption versus final use after the amended B offset. This package resolves none by inventing a priority, marginal replay or taxpayer election.

## Independent review and final delivery preparation

A separate agent verified every owned hash in immutable `c614aaf8` and passed 24 tests in six files, including six independent source controls. Those controls cross the D/C and B/A/G floor boundaries, preserve unused prior-C expiry, distinguish an older surviving balance from the current-excess floor-carry trigger, and reject a reconciled sub-cent hit on prior C. A first reviewer-only extreme-precision fixture reached source reconciliation before the intended floor guard; that failure was retained and the independent probe was corrected to reconciling precision. No product changes resulted. The report is `federal-charity-determined-floor-review.json`, SHA-256 `33c2aff90deedc6a9e1b64e57e063ab9caf5e1adacdb0505395798b8298781a8`. This is agent source/software review, not human qualification.

The final private candidate is based on delivered health commit `24f2f921c1cc615052ec094975f9754be9312d6b`. All 15 reviewed executable, specification and test blobs remain byte-for-byte unchanged. The 122 preceding implementation links and their contents are preserved; one explicit canonical/guide mapping is added. Provenance advances to 2025.152 / 2026.149-law-integration-draft, without changing year or filing gates. The inventory is regenerated from this exact source. Final checks and immutable hashes are recorded in the delivery manifest before integration.

The exact final candidate passes 1,129 tests in the same 108-file cohort, root and web TypeScript, 5,574 spec references, the current 529-entry inventory and scoped lint (zero errors, five existing warnings). The two-case increase from the earlier 1,127 is parameterized spec-reference validation for the two new upstream cash-assistance and Marketplace business-credit specifications; the floor's eight owned cases and their assertions are unchanged. All 122 preceding implementation links are preserved, plus this package's one mapping. These checks include the actual guide and closed readiness/export gates, without a new browser or physical-2026 claim. Exact logs and SHA-256 values are retained in `charity-determined-floor-final-snapshot.json`; local evidence is not published.
