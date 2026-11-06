# Annual education category limits

This private package extends the existing complete ordinary annual cash QTP calculation to actual K12, registered apprenticeship, recognized credential and determined student-loan principal sources. It preserves each original Box1/2/3, beneficiary/recipient and receipt allocation. No final-year, filing, independent professional review or release gate is changed.

Official authority refreshed October26,2026: [IRC529](https://uscode.house.gov/us/usc/119-118/t26/s529/), [Pub970](https://www.irs.gov/publications/p970), [Form1099-Q instructions](https://www.irs.gov/instructions/i1099q), and [IRC221(e)(1)](https://uscode.house.gov/us/usc/119-118/t26/s221/). Section529(e)(3)(A) applies the beneficiary cash K12 cap,10000 in2025 and20000 in2026; PL119-21 section70413(b)(2) supplies the latter effective date. Expanded K12/credential eligibility begins after July4,2025. Registration and required-cost answers are separate actual apprenticeship facts. Supplied cash dates and explicit after-July4 answers must agree.

Actual category predicates retain false versus unknown. The annual pool sums qualified expenses after actual refunds, assistance, distinct postsecondary credit use and determined prepaid costs, then applies one cash K12 cap or actual borrower lifetime capacity. Original earnings use the unchanged exact annual fraction and aggregate reporting. A K12 label alone does not prove eligibility for a postsecondary credit; the existing independently qualified postsecondary expense/credit source route composes with capped costs. Refunds require original dates, exact cash-retained receipts and complete-history confirmation. No missing history, interest, recipient or source amount becomes zero.

The finite remaining interpretation questions remain precise: mixed pre/post-July4 cash originals with expanded costs, and positive qualified student-loan interest requiring annual earnings attribution under221(e)(1). Actual known-ineligible or exhausted-cap loan costs do not need that positive attribution. Shared borrower use across beneficiaries at a binding lifetime cap also needs a determined allocation; no priority is invented. Existing ESA, outside-plan original completeness, transfer, correction and competing-prepaid methods are not expanded by this package.

Spec-first evidence is retained under `.local/upgrade-evidence/education-annual-category-*`:

- First seven new source cases failed against the previous special-category guard. `core-red.log` SHA256 `4765ddc25072d574359eb8585076b9798a433fa0ecb2384fe351a1ad5462045f`.
- Initial seven plus existing annual-cash and ordinary-expense controls passed22tests/3files, one worker. `core-green-attempt1.log` SHA256 `ac9ce64d90bfe6b512b19037afc47bd6340ba94dd2c0dd23a1430a5ad5f48ff5`.
- Separate chronology and known-zero controls retained two failures/six passes before their correction. `timing-and-zero-red.log` SHA256 `15bdfefe3b5bff87e9bfb2e37e8065caf530e82f0c089fd6f718d9d4812b650e`; corrected eight source cases passed in `timing-and-zero-green.log` SHA256 `18b3da1a5278a2ee22d6183c22000ae3814fd2a6dd1f36117f3f7b9c86dc0a3a`.
- Initial canonical, guide/reload, real panel, private PDF and workspace cohort passed12tests/6files, one worker. `followthrough-attempt1.log` SHA256 `cf3d92495e5d8669c3fd95a80f303732a56db497c96c8cf44cc6f450edd53e0f`; root typecheck passed. These counts precede the last two source controls and do not stand for the final freeze.
- The completed prefreeze cohort passed14tests/6files, one worker, including the distinct actual postsecondary credit source alongside capped K12 costs. `prefreeze-focused.log` SHA256 `4f4b02b02edfec846b69dd7889b8acc52f21304c455a3956a6bbcaf9a1ecc67c`.

Immutable broader checks, production browser, saved-original/PDF generation and independent source/artifact review are still pending at this source freeze. Derived fixtures are not published IRS numerical examples. Generators and software review do not establish professional tax qualification.

The original frozen annual-category audit incorrectly reused the allocation-only K12 zero even when the completed annual category cost was10000. Saved original/PDF inspection reproduced it; the spec-linked core and PDF regression both failed before the audit correction (2failed/9passed, log `education-annual-category-audit-handoff-red.log`). The revised audit consumes completed annual category costs, without adding source allocations or changing taxable/qualified totals. The corresponding loan category audit is bound to its completed principal-only costs too. V1 originals and PDFs are retained separately.

Parent source review corrected the citation locators after refreshing the current official code: apprenticeship is529(c)(8), tutoring/disability are529(c)(7), and credentialing is529(e)(3)(C) together with(f). The source predicates and monetary methods did not change for this citation correction.

Frozen V1 fba393084e1a622c4ab13b95cffdc3bec53be70b passes1889tests/245files with one worker, root/contract/web types,5772spec references, scoped lint0errors and both builds. Four production browser cases pass at1280/390 widths with zero retries and one actual worker (two configured maximum); task port3382 closed. All3470 frozen source hashes remain unchanged. The new spec makes the untouched generated inventory stale; that failed check is retained for the separate final integration delta. V1 saved8originals/147mergedpages are retained with the known audit wording/value defect rather than claimed corrected evidence.

Audit correction passes23tests/4files including both previously failing core/PDF assertions and existing annual exact-rounding tests. Its green logSHA is de417dfe976ac8788305b14dffedeca548c16cfcf5e6fa1c16ca032b5dde9937. A fresh V2 freeze and original/PDF generation follow; no V1 runtime/artifact or failing log is overwritten.

Parent independent controls found an exact-history precision omission in the frozen V1/V2 category helper: prior use1e-60 plus other current use10000minus1e-60 exactly exhausts the lifetime limit, but the helper did not include the history digits in its local Decimal precision. The permanent spec-linked test retained the false positive-interest guard failure (1failed/10passed; logSHA50195bf6e9c3378cde4d0f4321027bdc0df8cc864407a0043907a513412a2ee0). Including the actual history digits corrected the calculation, then a strengthened audit assertion reproduced a residual1e-60 audit remainder (logSHAe8c4ee03fc8c66a3643766441123d2b6b7c9cdd3bad8b1d0b20bb1ee63562b3e). The final correction forwards the helper's exact computed remaining capacity into that audit, with no global precision change or user-entered exclusion.

This delivery does not close all annual category work. Mixed pre/post-July4 cash chronology and positive qualified student-loan interest attribution remain named internal methods needing precise original-source derivation, alongside the finite bond-history/reporting queue. They are not independent reviewer or credential blockers. No priority, election or marginal attribution is invented here.

The complete precision correction passes24tests/4files including the original annual rounding and physical-PDF controls (one worker; log `education-annual-category-borrower-precision-green.log`, SHAe6b8abd8ec993ac525e604e4b1e37b605460d3cede53ac6ef58cd3884d466706). The exact complementary source history, zero audit remainder, original-input immutability and unchanged global precision are all asserted; genuine positive remaining capacity still preserves the separate interest-attribution method guard.

Frozen V2 broader run retained1889pass/1failure across245files: the new workspace test generated and reopened both actual categories inside one unchanged5s test, and exceeded that deadline while the production build ran. V1 had passed the same workflow. The revised test uses `it.each([false,true])`, with each actual packet retaining all original source, numeric, notice, privacy, unknown-confirmation and year-gate assertions and the unchanged5s deadline. There is no retry, timeout, threshold or product change. Original V2 logSHAe42585c1c08b5669dac3f922b322c10b73d30c596b0bbf37758c15b2d2cb531b is retained.

The parameterized workspace cases and strict test-reference validation pass508tests/2files (each actual PDF case under800ms, unchanged5s deadline), logSHA4dfa494f84164ed4e8d539a52397f8a4f78ca94d4a7e9a68ef5289d2eb8c2ed1. V3 exact root/contract/web types,5774spec references, scoped lint0errors and both builds pass; stale inventory remains explicitly retained. V4 is test/ledger-only, with all producing product files identical to V3.

## Final frozen source and saved-output evidence

Corrected V4 `d59aa7633f46304fc75ddb640ab14e6f420bb946` passes 1,892 tests in 245 files with one worker in 125.90 seconds. Log `education-annual-category-v4-frozen-tests.log` has SHA256 `266b6d2df6ac0d14888c512a4ac610367c10b4ed757d62fe1406fb22525e30c2`. Root, contracts and web types, 5,774 spec references and scoped lint with zero errors/warnings pass. V3 has the identical producing runtime and passed both builds plus four production browser cases at desktop/mobile widths, zero retries and one actual worker; task port 3386 closed. V4 changes only the parameterized workspace test and evidence ledger. The untouched generated-inventory failure is retained; final integration regenerates it separately, without suppressing the failed check. All 3,470 frozen V3 and V4 source hashes were reverified after checks.

Parent independent V4 source review passes 25 tests in seven files with one worker, including eight unchanged private original-derived controls. Report `parent-annual-category-source-v4-review.json` has SHA256 `6da7c321e5140d25374dcee2406544f8b9faed2ecc3f1f270edc29b0054e62fe`. It retains the original 17-pass/one-failure precision finding, the corrected V3 23-test cohort and the separate V2 audit/citation, V3 exact-history and V4 test-only delta inspections. All eighteen owned hashes remain unchanged. This is software/source review, not independent professional tax qualification.

Final immutable artifact manifest `education-annual-category-artifacts-v3/manifest.json` has SHA256 `fb342f56ed32750871ca1d57a042d8b646574e1f41e97e62051f3bbd8dc829ae`. Nine canonical original inputs and four actual saved guide states were preserved before calculation. The author Python Decimal reader derives its expectations from those originals: 86 PDFs, 406 pages and 409 populated fields; 120 physical, 1,104 reference and 409 appearance checks pass. Personal visual inspection covers all thirteen page contacts, thirteen footer sheets, nineteen readable affected pages and eight actual desktop/mobile screenshots. Author report `education-annual-category-artifact-checks-v3/checks.json` has SHA256 `b0bdc5bede3cafbafc36a7965427f0550fc9c10c12c4938dfffa2d78a35377d6`. The reader-only missing-pdfium setup failure is retained; the same reader completed with the bundled Python runtime and unchanged original/PDF files. The generator is not an authored test or independent review. Parent independent original/PDF inspection is still pending at this private integration preparation.

## Private integration scope

The exact integration base is `16609f2d4b81c33bfd44680afa2f928c4c390bb8`, with parent-reserved rule provenance 2025.168 and 2026.165. Every one of the seventeen V4 product/spec/test/browser blobs is byte-identical; no runtime merge is required. The ledger alone gains final evidence. Provenance records the bounded category method, one explicit own-spec association connects actual shared Form1099-Q runtime and the historical 2025 reference mapper, and inventory is regenerated while preserving every predecessor row and association. No calculation status, independent-review status, filing qualification or final-year gate is promoted.

This delivery leaves the already named mixed July 4 chronology and positive qualified student-loan-interest attribution methods as internal work, followed by bounded bond history/rational reporting. Current guards do not establish that those methods need an external reviewer or credential. Source-derived allocation must be established before either composition is added; no new priority, marginal exclusion or election is invented here.

Parent independent original/PDF review is now clear. Report `parent-annual-category-artifact-review/checks.json` has SHA256 `43f3f0c4e20ca19d197b2590e11b1ea8384e184862fe8b64b6aed052fc212e46`. It independently derives all thirteen saved originals/guide states using Python Decimal, reopens all 86 PDFs/406 pages/409 populated fields, and passes 9,057 source/hash/physical/reference/notice/privacy checks with zero failures. All 3,470 producer source blobs remain unchanged. Personal inspection covers thirteen merged contacts, readable Form1040/Form5329/loan reference pages and all eight UI screenshots. The actual edited K12 browser expense9000 yields6300 taxable earnings and630 additional tax. The earlier pending statement records the first private-preparation checkpoint; this receipt closes that artifact review. Software/source/output review remains distinct from human tax qualification.


### Final cross-document claim correction (October 26, 2026; private)

Final candidate7704eb9b and every V3 retained original/PDF remain immutable.
Parent's additional canonical completeness probe found that the exact exhausted
borrower original asserted1000 interest claimed before phase-out but supplied no
independent loan-source worksheet. Its accepted59000AGI/PDF omitted that claim.
The earlier numeric/provenance review is retained at its stated scope; it did not
clear this subsequently demonstrated source-completeness defect.

The bounded correction requires existing actual loan sources for a positive
primary/joint-spouse education interest claim even with zero excluded QTP
earnings. It does not derive a deduction from the claim. Existing loan eligibility,
source/year/borrower/expense reconciliation and canonical phase-out determine the
deduction. An explicit zero claim and another taxpayer's claim remain distinct.
Complete fictional independent lender facts give1000 actual deduction,58000AGI,
and unchanged9000taxable QTP earnings/900additional tax. The original incomplete
artifact is kept as red evidence; the corrected source original is saved separately
before new calculation/PDF generation.

Guide verification also reproduced a no-packet omission: two callers collected
education loan rows only when a loan packet was already present. They now collect
actual student_loan rows too, so the existing adjustment validation and bridge can
report the missing worksheet before preview. No source amount or route selection
is invented. Source save/reload, rejected missing links, and actual education-edit
confirmation revocation remain tested.

Retained author logs: education-annual-category-claim-red.log is only a runner
setup failure (unsupported Vitest minWorkers option; no assertions executed).
The corrected invocation red-behavior.log contains1failed/3passed, followed by
28tests/5files passing in claim-green.log. The guide-red and first guide-green logs
retain the missing-vector failure; guide-green2 then exposed an absent adjustment
fixture, and guide-green3 exposed a test assumption that the generic update helper
clears own-source confirmations (the actual source panel owns that operation).
The final test keeps missing-link rejection and separately exercises actual
education-edit invalidation without changing the existing production behavior.
Both failed assumptions and their logs remain disclosed; no timeout, threshold,
or assertion protecting actual amounts/source linkage was removed.

Official IRC221(a),(b),(d),(e) and Pub970 chapter4 were refreshed for this correction.
This is source completeness in the existing deduction method, not a resolution of
the separate positive-qualified-interest annual attribution or mixed-July4 method.
Independent review of the new freeze and original/PDF delta is required before
delivery; all public year/form/filing and independent-human gates remain closed.

### Corrected final source, browser and original-output closeout

The corrected immutable source is `e6d8d1dbc90fd38e82f61f51b6862e1c874dff56`, based on `16609f2d4b81c33bfd44680afa2f928c4c390bb8`. Its 25 owned paths include only four new runtime source-presence/collection changes beyond the preserved annual-category candidate. The existing actual lender calculation is unchanged. No source, monetary or eligibility value is inferred from the positive claimed amount.

The exact corrected source passes 1,959 tests in 249 files with one worker (Vitest 198.12 seconds), root/contracts/web types, 5,805 spec references, the 547-row generated inventory, both builds and scoped lint with zero errors. Eight preexisting warnings occur in the newly included caller files; no warning-producing hunk was added. Test log `education-annual-category-claim-frozen-tests.log` has SHA256 `3407b2f08f5baa9cc6f775f2ea6dbbf03be2c4f6e5e7a08030ea05050fca9282`. Production desktop/mobile verification passes all four unchanged annual-category workflows with zero retries, one actual worker and two configured maximum workers; port 3390 is closed. Browser log SHA256 is `dc9ee55393fbedaf9fb7f093093f0d66f528360e745ad3e384ade8fc85fd1bde`. Source save/reload, missing independent loan-packet rejection and actual education-edit confirmation invalidation are additionally covered by the new focused guide tests. No deadline, retry policy, coverage threshold or exclusion changed.

Parent independent correction review passes 32 tests in eight files with one worker, including all twelve unchanged private controls: the four claim-coordination probes and the eight annual-category probes. Report `parent-annual-claim-review.json` has SHA256 `e88c8db9d1555412ebc6d6184931d356d9ba52e7183ba30a5e71d36ecc746dc8`. It confirms the four runtime edits remain bounded to source presence and collection and preserves the original accepted incomplete-claim regression.

Three corrected originals were saved before calculation in a new versioned artifact directory: the original plus complete actual lender facts, the original with an explicit zero claim, and the original with an outside-taxpayer claim. Manifest `education-annual-category-claim-artifacts/manifest.json` has SHA256 `29822f96b355d508ddc469fe99710ecf40fb30132764cdcca9712ef562f17b20`. The earlier incomplete original and every earlier PDF remain unchanged. Author original-derived Python Decimal checks reopen 27 PDFs/108 pages/132 populated fields and verify 42 physical, 288 reference and 132 appearance values. Personal inspection covers three all-page contacts, three footer sheets, eleven readable affected pages and eight actual browser screenshots. Author report `education-annual-category-claim-artifact-checks/checks.json` has SHA256 `778281b9bf91cf3419ec0638564b98f2d3751e9f7d08b9bf6728c4105c6f9d08`. The initial generator invocation failed before generation because its launcher could not create a sandbox IPC listener; the completed `node --import tsx` invocation uses the same source and is retained separately. The generator is not an authored test or an independent review.

Parent independently derives the corrected totals from the original receipts and lender facts, verifies all 3,501 producer tracked blobs and the retained incomplete-original hash, and reopens the same 27 PDFs/108 pages/132 fields with 2,855 checks and zero failures. The complete own-return claim prints a 1,000 deduction and 58,000 AGI; zero and outside claims retain 59,000 AGI, while Form5329 remains 9,000 taxable earnings and 900 additional tax. Three contacts and readable Form1040/Schedule1 pages were inspected. Report `parent-annual-claim-artifact-review/checks.json` has SHA256 `db5676813a1d4e6e6cf14a9cc7a333c39ad5b21d2970e71c868662b813498d31`.

Final receipts and rehashed logs are collected in `education-annual-category-claim-frozen-checks.json`, SHA256 `b155bf0b4b2529e6f16ebd0279c924cfb78094fafa66ebca6e0c6f95403292b4`. All 3,501 tracked source hashes in both the tested freeze and the producing copy remain unchanged. The delivery delta after that freeze is this evidence ledger alone; every other tested/reviewed owned blob is preserved. Provenance remains the reserved 2025.168/2026.165, and all prior inventory rows/associations remain retained. Mixed July4 chronology, positive qualified-interest annual attribution and the bounded bond-history/reporting work remain internal follow-ups, not completed by this correction. Software/source/PDF review does not establish independent professional tax qualification or filing readiness.

Main integration on the exact delivery passes 20 tests in six files with one worker in 18.36 seconds. The command selected the six new source, return, guide, panel, workspace and PDF files; its additional student-loan path matched no file and is not counted as coverage. Log `education-annual-category-main.log` has SHA256 `9cbb0e08678ad4c274796a5d17ecebd8b904c2aecb0f4d889cda179745bf1dd5`. All 25 delivery hashes matched before this evidence-only ledger addition. The previously completed 1,959-test frozen cohort includes the existing lender method; no additional global-suite result is claimed here.
