# Foreign income upgrade evidence

Updated 2026-10-25. This is calculation and local review evidence. It does not qualify filing, production release, or independent tax review.

## Sources refreshed

- [Final2025 Form2555 instructions](https://www.irs.gov/instructions/i2555): source lines19–26, official employer allocation34–36, exclusion37–45, deduction46–50, separate location worksheets, and one-year carryover.
- [Final2025 Form2555](https://www.irs.gov/pub/irs-pdf/f2555.pdf) and [draft2026 Form2555](https://www.irs.gov/pub/irs-dft/f2555--dft.pdf): physical line numbers and published daily housing bases56.99/58.26;2026 remains a draft.
- [Notice2025-16](https://www.irs.gov/pub/irs-drop/n-25-16.pdf) and [Notice2026-25](https://www.irs.gov/pub/irs-drop/n-26-25.pdf):136 and109 housing location entries. All245 annual/daily numeric pairs in the checked-in catalog were compared against independently extracted downloaded official PDF rows. Location continuation lines were checked during transcription. Daily values are retained verbatim, including apparent annual-versus-daily discrepancies for2026 Wollongong and Bern; no arithmetic correction is invented.
- [Publication54](https://www.irs.gov/publications/p54): mixed employment housing allocation, eligible personal-service income, disallowed deductions, and one-year housing carryover. [IRC911(c)(4)(C)](https://uscode.house.gov/us/usc/t26/s911/) permits prior carryover within the remaining income limit. Current-year zero housing does not manufacture a new carryover or erase the statutory prior carryover. Physical-form skip wording still requires qualified review before filing.

## Implemented and checked

- Spec-first official monetary lines19–50, separate current carryover, and stacking amount45+50. Actual PartIV/source mapping, eligibility/elections, known monetary facts and original source presence are required for2026. Parsed defaults cannot turn an incomplete record into verified evidence. Known ineligible facts yield zero benefits.
- Indexed130000/132900 maximums, published daily/full-year housing rules,136/109 location catalog, moves with each location worksheet rounded before summing, explicit higher2026 notice election for2025, actual previous location labels for regrouped notice entries. No future notice election or arbitrary dollar override.
- Housing allocation uses all actual employer-provided foreign income. FEIE precedes the limited self-employment housing deduction. Current excess carries one year; unused older carry expires. Actual allocable AGI deductions reduce line45. A prior-year-earned exclusion needs its separate actual computation, source year, received-income/unused-limit reconciliation and confirmation the income is already reported.
- Return integration is coordinated separately: gross wages remain; only actual foreign employment income outside W2 is added at1h; negative45 goes Schedule1line8d;50 goes24j. Output `totalIncomeReduction` is the stable net45 alias; `totalExclusion` is gross43 and is not a universal MAGI addback.
-20 new tests were observed failing against the old implementation; a separate red regression caught rounding the combined location limits instead of individual completed worksheets. Historical tests that encoded the incorrect housing order/reimbursement subtraction or a fabricated2025 leap year were replaced with source-derived assertions. No thresholds or readiness gates changed.
- Final focused calculation run:93 tests passed. Root typecheck passed. Scoped ESLint passed without warnings. Spec validator3239/3239 references resolved. Local logs under `.local/upgrade-evidence/form2555/` include initial red, rounding red, final calculation, types, lint and spec evidence.

## Remaining work / limits

- Corrected review-only PDF mapping and every-page notice are the next coherent package; old composite audit IDs are obsolete.
- Final2026 physical forms/instructions, qualified independent review and filing qualification remain required.
- Physical residence/presence/travel evidence, business capital-versus-services source worksheet, spouse-specific separate Forms2555 and housing allocation, foreign exchange source records, prior-year-earned computation statements, and original qualification/election proof must be supplied from actual records. A confirmation is not an independent tax review, and unknown facts are not inferred.
- Guided collection must expose the actual source contract. Legacy2025 aggregate previews remain explicitly unverified; positive housing requires actual employer-provided foreign income even on that path.
