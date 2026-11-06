# Current charitable receipts and Form 172 loss origins

This package supplies actual current direct charitable receipts to the existing regular and alternative current-loss calculation. It requires independently confirmed empty regular and AMT charitable histories and the existing complete current-origin source packet. The return chooses the deduction; users do not enter a calculated loss, charitable allowance, or carry.

The selected personal charitable deduction joins the nonbusiness deduction group. Form 172 limits that group against actual nonbusiness income. The unused percentage excess remains its original charitable carry. Creating a new current NOL does not by itself subtract an attributed share of that loss from the excess. Any completed prior-NOL charitable comparison takes precedence, including an actual zero result. The independent AMT percentage carry is retained even when there is no prior ATNOL.

## Official sources and derived controls

Refreshed on 2026-10-26:

- [Form 172 instructions, Part I lines 6–9 and Part II line 26](https://www.irs.gov/instructions/i172): personal itemized deductions and the standard deduction enter the nonbusiness group; the prior-loss carry adjustment is a separate calculation.
- [26 CFR 1.172-3(a)(3)](https://www.ecfr.gov/current/title-26/section-1.172-3): ordinary nonbusiness deductions are limited to the actual nonbusiness income and relevant capital excess.
- [26 CFR 1.55-1](https://www.ecfr.gov/current/title-26/section-1.55-1): retain the regular AGI for AGI-based alternative-tax limits. The source packet independently establishes matching current basis, depreciation and loss limits.
- [IRC 170](https://uscode.house.gov/us/usc/119-120/t26/s170/): preserve current source valuation, percentage limits, contribution-year carry and the isolated 2026 floor. The existing 2026 calculation/export gates stay closed.

These are derived statutory controls, not published matching numeric examples or human tax qualification:

| Actual sources and choice | Regular new NOL | Alternative new NOL | Current charitable excess in each independent ledger |
| --- | ---: | ---: | ---: |
| Wages 20,000; active business loss 40,000; interest 30,000; public cash gift 20,000; personal real-estate tax 20,000; itemized | 16,000 | 0 | 14,000 |
| Same income and gift; medical 30,000 instead of personal taxes | 20,000 | 20,000 | 14,000 |
| Same income/taxes; ordinary public property FMV 20,000 and basis 4,000 | 14,000 | 0 | 0 |
| Same income/taxes; other cash or ordinary property 20,000, or public capital property 20,000 | 13,000 | 0 | 17,000 |
| Same income/taxes; other capital property 20,000 | 12,000 | 0 | 18,000 |
| First case with actual 2025 standard deduction 15,750 | 5,750 | 0 | 14,000 |
| Isolated 2026 first case: 6,000 percentage allowance less 50 floor | 15,950 | 0 | 14,050 |

The medical case has 35,250 selected nonbusiness deductions and 30,000 nonbusiness income: its 5,250 addback produces a 20,000 loss. Removing the gift produces a 19,250 loss. That 750 difference is caused by the 6,000 already deducted; it does not consume the 14,000 undeducted excess. A standard-selection gift below its percentage capacity does not become a carry merely because it was unclaimed.

## Source, guide and saved-output boundaries

The new helper accepts current original receipts only. It verifies the separate empty histories, retains exact current category valuation and binds source records with a digest. A source-bound private review context carries validation through identifier redaction. Equal-allowance recipient or basis changes, removed sources, modified wages, stale results, and regular/AMT category or medium changes reject before template I/O. The reference prints original qualified value, each selected current deduction, the percentage excess and the separately computed new losses.

Existing guide controls collect the original receipts and loss facts. Missing charitable histories leave the adjustment section incomplete even without a prior NOL. Each empty history is recorded separately. Receipt edits revoke current-origin and carry confirmations; no current loss or allowance is a guide input. The unmocked workspace path exercises actual bridge, engine and PDF preparation.

## Verification and independent reviews

The source spec and failing tests preceded implementation. Retained local evidence is under `.local/upgrade-evidence/charity-current-origin-*` and is excluded from publication.

- Initial three source tests failed at the old charitable-source guard; subsequent tests separately exposed absent AMT carry output, stale equal-allowance source acceptance and redacted-source rejection.
- Missing-history guide and actual workspace tests failed before the completeness check was added.
- An existing guide test expected the old later canonical rejection. Its assertion now verifies the earlier incomplete-history boundary while preserving the original receipt. No qualification or arithmetic expectation was relaxed.
- The isolated 2026 synthetic fixture initially omitted W-2 payroll Boxes 3 and 7. Explicit fictional payroll wages and known-zero tips were supplied; the public year gate remains tested separately.
- A reviewer-style development assertion initially expected prior AMT carry reduction without a modified-income addback. That expectation was replaced by an actual capital-loss source case: tentative 30,900 and completed AMT carry 30,090. No formula was changed to satisfy the incorrect expectation.
- A shared browser fixture initially contradicted its positive receipt with a legacy aggregate zero. The fixture now leaves that unused aggregate unanswered; the original receipt remains 20,000.49. Both failed logs are retained, with product code and browser assertions unchanged.
- The first local server attempt was blocked by sandbox loopback permission. The permitted server used only local fictional records and was stopped after checks. Initial browser fixture alias-import failure is retained separately.
- The real production workflow exposed a current-origin confirmation callback that inserted display-only empty aggregates into a source-only adjustment record, revoking the independently confirmed histories. A spec-linked DOM regression reproduced that defect. The callback now preserves the original saved adjustment shape and changes only the current-origin packet. The new DOM case and two adjacent confirmation cases pass; no browser assertion or required source fact was removed.
- The rebuilt production browser passes both desktop and mobile cases with zero retries. It separately records each empty history, confirms the actual current sources, checks the estimate, reloads saved original cents, and removes a history to restore the incomplete-source state. Both screenshots were inspected; the dedicated loopback server was stopped.
- Independently reopened 40 saved PDFs (95 pages, 235 nonempty form fields), including the actual guided workspace packet. Six physical Schedule A fields match literal amounts. Text, every-page notice count and taxpayer/source privacy checks pass. All contact sheets and footer crops were inspected, with detailed Schedule A, Form6251 and NOL reference pages; raster checks confirm red notice pixels on every page. These are software artifact checks, not human form qualification.

The initial adjacent suite passed 823 cases with two failures from the contradictory synthetic aggregate described above; both source-corrected fixture tests pass. The immutable review tree `e045dd104e33e9514096ef86b27bbab6eaaf7117` on `e3dcc3f7b579f220f08c6c73f436655fd4800669` passed 933 tests in 114 files with four workers, root/web types, 5,498 spec references, scoped lint (zero errors; four existing warnings), production build and both desktop/mobile browser cases with zero retries. All 23 owned hashes stayed unchanged. The first unconstrained run, concurrent with static checks, passed 929 and reached four existing five-second workspace PDF deadlines. Those four passed unchanged in isolation and then the entire bounded cohort passed; no deadline or assertion changed.

The exact artifact generator ran from a separate archive of that tree. Its local test SHA256 is `770e51fe182016cbf4649069976e1dd911c032b978a8ac075be0c5973d13b1fe`; it is not part of the published source. The exact artifact manifest is `charity-current-origin-exact-artifacts/manifest.json`, with producing-source provenance in `charity-current-origin-exact-artifact-generation.json`. All 95 rendered pages match the previously inspected images byte for byte.

Federal source/software review independently verified every owned hash and passed 16 tests in seven files, including five private controls. They cover mixed current cash/property and input order, automatic standard choice, hidden or unknown alternative history, balanced stale output, and the existing source-backed current-only canceled-debt composition. The latter has 20,000 regular and alternative current losses followed by a 5,000 excluded-debt reduction: both closing NOLs are 15,000 while both charitable excesses remain 14,000. [Publication 4681](https://www.irs.gov/publications/p4681) supplies the existing after-tax attribute-reduction rule. This was a scope-wording clarification, not a numerical defect or a new formula; the final spec and ledger distinguish this composition from unimplemented original-source/modified-absorption COD methods.

Parent independently reopened the exact 40 PDFs/95 pages/235 nonempty fields, checked six literal Schedule A widgets and the actual guided cents, inspected all-page contacts, eight readable details and four footer contacts, and recomputed all 95 matching PNG hashes. Each page has one review notice; bounded SSN/EIN and named-history-reference privacy checks pass. Review report SHA256: `169288a7af5e94088a1fc8cf27ab354ff86917afe0fcffcace187206a16f72ee`.

The final candidate rebased onto health commit `f25a2b72f7f21909399a5291e5a30c9f18b4ac1c` retains all 21 reviewed executable, test and UI files byte for byte. The only additional changes are the scope clarification above, this evidence ledger, metadata `2025.147` / `2026.144-law-integration-draft`, the new Form172 implementation link and the generated 522-entry inventory. All 41 existing implementation links, the current generator and health sources are preserved. Parent independently inspected this exact delta and its hashes.

The final exact-base cohort passes 595 tests in 28 files with four workers, including the adjacent original/prior charitable NOL methods, guide confirmation, actual workspace PDF, readiness, strict test references and implementation/inventory gates. Root types, all 5,517 spec references and the generated-inventory check pass. This targeted final-base cohort is narrower than the separately retained 933-case review cohort; it does not replace or relabel those earlier build, browser and artifact results. Log SHA256 values are `1a516635a3f4e9586cdf9246dd722e97496760cee3ccb205757bc461516e6030` (tests), `b2256ded4cd62c3b39e4cda2d1e707dbfc46994b784cd3eb8a3a1ad988142a9a` (types), `b6da5a46650076213bdd5f69068b9e72e06bce7aaa7a13a4a64f66317d724048` (spec) and `1b8edcd4490b541bc974ac9b26fbf2132d06af38592299fa8eb5cf038312e532` (inventory check).

Local evidence includes `charity-current-origin-exact-checks.json`, `charity-current-origin-final-snapshot.json`, `federal-charity-current-origin-review.json` and `parent-charity-origin-pdf-review/checks.json`. Reviewer-only probes remain in private archives. These are bounded agent/source/software and artifact reviews, not independent human tax or filing-form qualification.

## Finite remaining charitable methods

This package does not establish positive prior charitable histories in a current loss year, 2026 standard/nonitemizer current-origin treatment, K-1 business/loss classification or crypto current-origin classification, original-K1/crypto or unresolved modified-absorption COD methods, or unsupported property elections. The already validated direct-current-only COD composition described above remains available. Those are separate source and software work.

The controlling interpretation questions remain distinct: within-category current/prior floor attribution and original expiry; nonzero NOL benefit allocation across multiple affected excess origins; partial same-category cash/property attribution; and prior-C treated-paid consumption after the amended2026 B offset. Existing category ordering alone does not establish those allocations. They are not credentials or human-review blockers, and a guard is not a claim that the method is complete.

The approved finite software queue is source/choice closure for existing donation-only originals and the single-prior-vintage current origin; the generalized current/prior floor class whose entire floor hits unambiguous current sources or is zero; and source-complete zero/unique affected-excess NOL cases. Each needs actual collector, selected-result and saved-reference follow-through. Broader operating-K1, farming and estate origins retain explicit support exclusions unless a named ordinary brief dependency requires them. No arbitrary category-pair list or marginal allocation is substituted for these endpoints.
