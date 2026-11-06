# Educator expenses and actual savings-bond ownership

This private package uses original purchase funds and prior interest to retain exact income-ownership ratios, calculates the separate pre-exclusion educator deduction required by Form 8815, and carries the determined final deduction through the actual guide and review output. It does not supply a user-entered deduction, allocate a reduced joint exclusion, or qualify filing output.

## Authority and derived controls

Official sources refreshed October 27, 2026:

- [Final 2025 Form 8815](https://www.irs.gov/pub/irs-pdf/f8815.pdf), page 4, Line 9 worksheet footnote: the educator deduction for this MAGI calculation is determined before the Form 8815 exclusion reduces educator costs. Other actual return deductions remain separate.
- [Publication 550](https://www.irs.gov/publications/p550), Co-owners and Table 1-2: unchanged noncommunity co-owners report interest according to actual purchase funds. Actual previously reported interest remains owner-specific.
- [2025 Form 1040 instructions](https://www.irs.gov/instructions/i1040gi), Schedule 1 line 11 and Rounding Off to Whole Dollars: apply the owner-specific expense reductions and cap; add amounts contributing to a line before rounding its total.
- [IRC 62(d)](https://uscode.house.gov/us/usc/119-118/t26/s62/) and existing 2026 educator specifications retain their distinct year and itemized-funding rules. The isolated current-year test does not open the public qualification gate.

The literal controls are derived from original facts and these rules, not published IRS examples. With principal 3,000, purchase funds 1,000/2,000, current interest 1,000 and actual zero prior reporting, owner interest is exactly 1,000/3 and 2,000/3. Fully excluded interest and actual educator costs 400/800 leave deductions 200/3 and 400/3, reporting 200 and AGI 79,800. An actual eligible IRA contribution of 1,000 instead gives IRA MAGI 80,800, bond MAGI 79,400 and final AGI 78,800.

The separate sole-owner control has wages 149,650, interest 500 and educator costs 600. Pre-bond educator deduction 300 gives bond MAGI 149,850, exclusion 490, final educator deduction 110, taxable interest 10 and AGI 149,550. A supplied 487 exclusion is rejected even when reusing it could create an internally consistent final deduction.

Two deductions of 99.50 report 199 after addition. Raw bond interest 1,000.50 retains actual owner values 333.50/667 while the printed Form 8815 reports 1,001; educator 66.50 + 133 reports 200. Raw 1,000.49 instead reports Schedule B and Form 8815 interest 1,000, without discarding the original cents used to check statement capacity. A 1,000.48 statement cannot cover a 1,000.49 redemption.

## Source and calculation boundaries

`savingsBondReductionMethod: return_sources` is an explicit request to derive a reduction from complete actual return records. The ordinary source-derived route requires unchanged ownership and a completed full exclusion. The exact source candidate is supplied before other return worksheets; the completed Form 8815 must independently reconcile eligibility, the full expense fraction, no phaseout, reported total, and exact owner amounts. An incomplete, reduced or changed-ownership route cannot escape that final validation. A sole-owner partial exclusion retains the existing actual declaration/reconciliation route.

Original optional amounts remain absent until supplied. Unknown confirmation, missing original bond records, rounded substitutes for recurring shares, conflicting statements, false ownership, or stale receipts block calculation. The helper accepts the structural raw-source shape rather than inventing an empty parsed array. Actual guide edits revoke educator and bond confirmations separately; source values survive save/reload. The prepared review context binds the original return, exact redaction, educator/Schedule 1 calculation and bond MAGI before PDF I/O.

The income-ownership helper now exposes exact ratios for all its callers while retaining finite display values. Only the explicitly source-derived educator cohort uses the new completed-line reporting branch. The original reference output remains partial and its pagination follows the separately delivered renderer correction. No readiness, human-review, state, current-year or e-file gate changes.

## Retained development evidence

Evidence lives in `.local/upgrade-evidence/educator-bond-*` and is not a public filing qualification.

- Spec and first-source hashes preceded implementation. `first-red-attempt2.log` retained three intended failures: recurring ownership, incorrect bond MAGI reconciliation and missing calculated-source path. The first attempt also had an incomplete fictional exempt-interest source, corrected before the intended red run.
- `source-boundary-red.log`, `guide-red.log`, `dom-red.log` and `private-review-red.log` preserve original source, actual-control and private-context failures. Intermediate attempts retain two wrong result-property references, a missing fictional IRA confirmation, and test-only expectation/confirmation-sequence corrections; they are not successful checks.
- `exact-cents-red.log` and `statement-rounding-red.log` retain the raw-versus-reported source failures. Subsequent focused cohorts pass 21/4 and 70/3 respectively.
- The isolated 2026 fixture initially omitted the actual joint W-2 owner. `current-year-and-fixture.log` preserves that rejection; the corrected original source passes 1/1 in `current-year-fixture-complete.log`. Its other passing entry was a browser-fixture copier, not an authored behavioral test.
- `source-web-types.log` retains the raw guide optional-source type mismatch. The structural input type correction changes no runtime behavior and passes `source-web-types-optional.log`.

## Current private rebase and checks

The work was rebased from the immutable bond V3 dependency onto delivered `c6abb245770d94d5a9760ec03b142318ccb802bc`. Only `src/engine/federal.ts` and the Form 8815 mapper required automatic clean three-way merges. The other owned source/test blobs were copied unchanged. The rebase preserves the delivered Form 8815 partial-readiness, reference pagination and shared-marriage changes.

Current source checks: 14 tests / 6 files with one worker (`rebased-owned.log`, SHA256 `55be1c86170b98901b328c4f83c564b089923de24d725254bf06e6369d36151a`); root, web and contract types; 5,960 valid spec references; scoped lint zero errors and seven existing warnings. The source snapshot will separately pin exact hashes. Broader checks, production desktop/mobile workflows, saved-original/PDF derivation and independent source/artifact review remain pending. No metadata or inventory change is included in this initial source freeze; final delivery must regenerate those against its actual base.

## Finite remaining methods

This package does not resolve a positive partial exclusion shared by two positive income owners, changed community ownership periods, mixed July 4 education-distribution timing, or a mixed-purpose annual student-loan-interest attribution. Those retain their precise original-source/authority boundaries. No allocation election or history is inferred from the current implementation.

## Immutable V1 review and navigation correction

Source tree `311d248a42e236877c612a35575f435e1cda2ce1` is preserved. Its affected cohort passed 2,188 tests / 217 files with one worker; root, web and contract types, 5,960 spec references, scoped lint (zero errors, seven existing warnings), root build and production web build passed. The shared dependency runtime separately pins the reviewed pako 1.0.11 patch (`d41a50bfb404925c968ae99ca11a824bf057a67692637c9ecb44bdd99eb90e04`) and the resolved installed deflate source (`f537b12f55f31f9af74b162d0ad6b3667c78c356875f18c9f56be4db419d6ccc`). An initial wrapper used the old unused store path and stopped before any test execution; its dependency-resolution receipt is retained.

The independent AI source review passed 20 tests / 7 files, including six private original-derived controls, with all 27 owned and 3,636 tracked source hashes unchanged. Report `ai-educator-bond-independent-review.json` has SHA256 `37dafe2c3231097abb75096be71654746410136c5bf91e287b3a2c642a918400`. The reviewer retained its first threshold-fixture correction: a one-cent MAGI excess reports back to the threshold, so the corrected control uses a reported one-dollar excess while the exclusion reduction still reports zero. This source/software review is not a human tax qualification or a saved-artifact review.

Both production browser cases then reproduced an actual navigation defect: changing an educator receipt correctly revoked the later bond confirmation, but Adjustments required that later confirmation before allowing Continue to Tax Credits. The 1280/390 failures remain in `educator-bond-browser-attempt2.log` (SHA256 `26bb1722051eef0c7fa8ebaa82d78477ed8fde6e3dc018068a7eb5e8f6e8fedb`). The earlier localhost-listener sandbox rejection happened before browser execution and is separately retained.

V2 moves only the combined `educatorBondFactErrors` step check from Adjustments to Tax Credits. Local educator fields still gate Adjustments, while the bridge and canonical/pre-I/O validation are unchanged. A new full-shell case starts without any future step completed, keeps an unknown paid cost blocked, restores and confirms actual educator sources, reaches the later bond panel using Continue, remains blocked there until its separate actual confirmation, and then obtains the same 200 deduction and 79,800 AGI. The source-step test also retains missing-packet and unknown-confirmation rejections at Tax Credits and in the whole return. The first new test attempt used the wrong successful status spelling (`valid` rather than `complete`); that log is retained, followed by the corrected three intended reds in `navigation-red-complete-status.log`. The unchanged corrected regression assertions pass five tests / two files in `navigation-green.log` (SHA256 `799095599221112109708e725ade522c5cca15c159e30262b3e56f7c2acb2acc`). Exact V2 checks, browser rerun and original/PDF evidence remain pending at this freeze.

## Reviewed V2 final rebase handoff

The reviewed V2 source is `d0f65a830d61137ff7042d3b8cc320f744dceb53`; its immutable source, browser failures/repairs, and saved original/artifact producers remain unchanged. Final private rebase is onto delivered charity commit `2a8f6c17c2f4d03b6d26e1542053717391ec202e`. Metadata, implementation links and inventory remain parent-owned and unchanged in this handoff. Exact merge evidence is retained separately with the owned patch.

AI independently passed 20 tests/7 files including six private source controls on V1, then 8 tests/3 files including three private navigation controls on V2. Reports `ai-educator-bond-independent-review.json` SHA256 `37dafe2c3231097abb75096be71654746410136c5bf91e287b3a2c642a918400` and `ai-educator-navigation-independent-review.json` SHA256 `9959bb9185bda18e6fb4b0e4556880cbfb0599add144ccb974e71d054b048089` preserve both review scopes and setup corrections.

The exact V2 author cohort passed 2,190 tests/217 files with one worker, root/web/contract types, 5,962 spec references, both builds and production desktop/mobile 2/2 with one worker and zero retries. The original navigation failures remain retained.

Parent independently derived expected values from nine saved originals and reopened all 52 PDFs/215 pages/206 populated fields: 10,471 checks, zero failures. Parent personally viewed all eleven page contacts, eleven readable details and four actual desktop/mobile screenshots. Report `parent-educator-bond-artifact-review.json` SHA256 `53f02550df18479fd9f3b17db33598355280bfa96f8b12cdc94b5e474d79bdf1`; reader checks SHA256 `fa99969046a39fd469a699708b6fa854dba1aab1be1d065bed7cbcec3ac45839`. Reader setup and seven label-oracle errors are retained, and monetary expectations were not changed. These are software/source and saved-output reviews, not human tax qualification.

Final integrated checks and delivery remain pending parent adoption. Current tax-year, form, independent human, selected-state, hosting and e-file gates are not promoted.

## Final integration and delivery

Final immutable source `841331eddf1dd998dc2ece3d04405a0176b928fc` is based on `04b66d2ebf362d73da81047cf3564d95ebe336b0`, preserving all current charitable, monthly-coverage, reissue and PDF changes. The 30 owned paths include rule provenance `2025.178` / `2026.175-law-integration-draft`; inventory now has 565 entries and 150 explicit implementation associations. All predecessor inventory rows and associations remain unchanged. Twenty-five reviewed V2 files remain byte-identical; the flow change is the independently reproduced automatic merge and the ledger is an evidence-only append.

Final private checks pass 32 tests/12 files including all nine unchanged independent controls, root/web/contract types, 5,999 spec references, inventory and scoped lint (zero errors, seven existing warnings). All 3,670 tracked source hashes remain unchanged. Receipt `educator-bond-final-checks.json` SHA256 `1f081b7597d70dddd58577989d06db365898da7953046c2ec3903939d3ac36d5`. Root and production web builds pass; production desktop/mobile passes 2/2 with one worker and zero retries (11.5 seconds). Local port3462 is closed. Production receipt SHA256 `6c5200a1ed1ded878ef1e555d4e9681c18991fbbe0ea1d19186f43e7641d9e5a`; browser log SHA256 `31d57606c4203896238946d4afb3d80e02f44cca0b0efe49c170ed2d5eefaeee`.

The actual final browser source records equal the independently checked V2 originals. Parent reopened both final downloaded PDFs and compared all 30 pages: every text value matches that output except the explicit rule-version update; privacy and single-page notices remain correct. This 34-check comparison is retained in `parent-educator-final-browser-equivalence.json` SHA256 `940cc00e2c12ae43d19fc3fe124cffa8f7e67ebdd41082a53af32064fb9d4ed9`. The original 52-PDF numerical/visual review retains its original producer attribution. No fresh pixel-equivalence claim is made.

Adoption verified every owned hash and the unchanged predecessor before copying. Main passes 21 tests/10 files, including actual adjacent reissue, charity, privacy and packet-write paths, plus root types, spec, inventory and diff checks. Receipt `educator-bond-main-checks.json` SHA256 `1b1648ae3795503004df8b37f86a3461cfc0f87cfb95493b1e3a37915f07fe09`; affected log SHA256 `f2dabb86f2b1f8e42a063cb5e576a12df70517d2cf7f325455daedcbb82d0bb6`. Human qualification, final2026 forms, selected states and filing gates remain open; reduced joint exclusion and the separate education queue remain unclosed.
