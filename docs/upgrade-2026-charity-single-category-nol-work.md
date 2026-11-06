# Current single-category charitable contributions and NOL carry

This package extends the existing current public-cash method to one actual direct contribution category and medium: public ordinary property, other-recipient cash or ordinary property, and public or other-recipient investment stock. It preserves original per-receipt qualified value and the independent regular and AMT carry ledgers. Positive prior histories, mixed categories, partial mixed cash/property allocation, K-1 or crypto NOL attribution, and nonitemized NOL coordination remain separate methods in the finite charity queue. It does not qualify the full 2026 return or filing output.

The implementation uses an internal comparison record bound to the original year, source digest, category, medium and regular/alternative context. No input field can set a computed contribution limit. New non-public-cash sources require the existing independently confirmed regular and AMT charitable histories, each explicitly empty. The existing guide controls collect these facts; missing histories now keep the adjustment incomplete even when only the regular NOL is positive. A source edit revokes the existing confirmations.

## Sources and independent arithmetic

Refreshed official [Reg. 1.170A-10](https://www.ecfr.gov/current/title-26/section-1.170A-10), [Reg. 1.55-1](https://www.ecfr.gov/current/title-26/section-1.55-1), [IRC 170](https://uscode.house.gov/us/usc/119-120/t26/s170/) and [IRC 6102](https://uscode.house.gov/us/usc/119-120/t26/s6102/). The historical regulation's no-carry rule for other recipients predates the modern statutory category carry rules and is not imported.

- Reg. 1.170A-10(d)(1), Example 3 supplies the published capital-property control: income 50,000, fully deductible NOL 50,000 and capital gift 30,000 leave NOL carry 15,000 and charitable carry 15,000. The test uses a valid pre-2018 vintage in 2025 to reproduce that unchanged arithmetic without importing obsolete tax rates.
- Derived 2025 controls with income 100,000, gift 60,000 and NOL 100,000 produce charitable carry 14,000 for ordinary public property, 33,360 for the 30% categories and 42,560 for the 20% capital category. Cash and property retain their actual media.
- The independent AMT example retains regular AGI 97,000 and deduction 29,100. Actual ATNOLD remains 61,110; only the succeeding carry comparison changes, reducing alternative charity from 30,900 to 30,090. Regular charity remains 30,900.
- Exact receipts 60,000.49 and 60,000.50 retain their source cents and percentage computations. The completed alternative carry worksheet rounds tentative excess to 30,900/30,901, producing 30,090/30,091. This corrects the prior rejection of a fractional tentative excess, consistently with the existing regular worksheet's completed-amount convention. It does not round percentage capacities early.
- Isolated 2026 itemized controls reapply the statutory floor to the retained qualified contribution. The actual year gate remains closed. Absent, wrong, stale or nonitemized internal method tags reject.

These derived examples and automated reviews are software/source evidence, not human tax qualification.

## Reproduced failures and checks

Evidence is retained under `.local/upgrade-evidence/`, outside the committed payload.

- `charity-single-nol-red.log`: four new canonical cases failed at the previous public-cash-only or current-candidate boundary before implementation.
- `charity-single-nol-source-output-red.log`: stale selection tag and category-hardcoded PDF reconciliation failed before correction.
- `charity-single-nol-alternative-cents-red.log`: the original whole-dollar tentative-excess guard rejected actual source cents.
- `charity-single-nol-guided-red.log`: the real guide marked the property/NOL adjustment complete without the required independent histories. The correction passes through the actual bridge, input validation and canonical calculation; no bridge mock or invented amount is used.
- `charity-single-nol-guided-green.log` retained a test-setup failure from calling the validated-input engine directly with the bridge's unparsed input. The test now applies the production input schema; product code was not changed for that setup error.
- `charity-single-nol-existing-callback-red.log`: the existing pure helper test needed the new internal record's `amount` member. Its original monetary oracle is unchanged. The former fractional-tentative rejection is replaced with an explicit completed-amount assertion; invalid nonfinite, negative and inconsistent values still reject.
- `charity-single-nol-review-cohort.log`: 30 tests in 13 files pass, covering new canonical/source/PDF/guide behavior and existing regular/alternative NOL and history controls.

The saved-reference test reopens PDFs with an independent reader, checks one review notice on every page and identifier privacy, and rejects stale category, medium, original source and output carry rows. The immutable checks, independent review and retained visual artifacts are recorded below.


## Immutable candidate and independent review

The reviewed candidate is tree `bfee7111a751c0c54feb840d204d596025a43973` on base `9173d209715d6b8cca893fdba54acd2fcba6468d`; its 22-path manifest is `charity-single-nol-review-snapshot.json`. The exact broader cohort passed **379 tests in 81 files** (`charity-single-nol-exact-tests.log`), including all charity/NOL/Form172-related matching suites and Schedule A plus guided required facts. Root and web type checks passed, all **5,308** spec references were valid, and scoped lint had zero errors with five existing warnings. The earlier 30/13 focused result remains separately attributed.

The federal agent independently verified all 22 hashes before and after review in a separate clone, refreshed the controlling source text and passed **21 package/adjacent tests in eight files plus four private literal controls**. These include actual basis-limited D property, a fully expiring regular NOL with no succeeding-carry reduction, independent regular/AMT D amounts with the current claim unchanged, and split/reordered cents plus a stale-source PDF rejection. The reviewer also reopened and visually inspected a saved D reference. No actionable finding remained in this bounded method. Evidence: `federal-charity-single-review.json`, `federal-charity-single-review.log` and `federal-charity-single-probes.log`. This is agent source/software review, not human tax qualification; private probes are excluded from the package.

Retained `charity-single-nol-artifacts/manifest.json` and `reopened.json` record **27 PDFs / 48 pages** from three actual `fillReturn` packets: regular C, independent AMT C, and regular B property. The independent reader verifies all-page single review notices, identifier privacy, actual Schedule A 12/14/17 amounts and Form 6251 2e/2f amounts. All rendered page footers, all three NOL statements, regular-C Schedule A and alternative-C Form 6251 were visually inspected. The displayed carries are 33,360 regular / 46,800 alternative for the regular C and B-property controls, and 30,900 regular / 30,090 alternative for the separate AMT C control. Initial artifact-reader setup lacked Pillow in the pinned test venv, so rendering used the bundled PDF runtime; a review-only expectation for printed zero fields was corrected to the existing blank-zero mapper convention. Product output did not change.

## Final shared-health rebase and delivery

The final calculation candidate was checked on `0b65e34fde7cf48e6b2b5142f5e372c92f376beb` (shared-health `.130/.127`) as tree `d455b3929a768c6cfb700b54643dad7362b556de`. All 21 reviewed non-ledger source/spec/test blobs remain byte-identical to `bfee7111`; only this evidence document and the fresh rule metadata differ. The 23-path package preserves every shared-health source entry and adds the charitable source reference at **2025.131 / 2026.128**. The final tree after this evidence update is recorded in `charity-single-nol-integration-snapshot.json`.

Final targeted integration checks passed **34 tests in 14 files**, including the regular/AMT source, canonical, guide, reopened PDF and shared-health suites plus rule metadata. Root and web type checks pass; all **5,347** spec references are valid; scoped lint has zero errors and five existing warnings. Evidence: `charity-single-nol-integration-{tests,types,webtypes,spec,lint}.log`. This focused rebase cohort supplements the earlier exact 379/81 run; it does not replace or claim a new full-suite result. The private candidate and main staged tree are checked for the exact owned paths, unchanged reviewed hashes and whitespace errors before the normal scoped commit/push.

The next software source gap is a complete single prior charitable category/vintage with no current gifts, preserving separate regular/AMT opening sources, normal use, succeeding-NOL comparison and original expiry. Mixed-category or mixed-vintage NOL attribution, 2026 itemized floor attribution to prior vintages, and partial same-category B cash/property allocation remain precise unresolved source-method questions. They are not treated as external credential or human-review blockers, and no calculation is guessed for them.
