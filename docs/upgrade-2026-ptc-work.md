# Premium tax credit work evidence

Updated 2026-10-25. Implementation is reviewable; final 2026 form qualification and independent tax review remain unavailable. No filing gate is enabled.

## Source refresh

- [Final 2025 Form 8962 instructions](https://www.irs.gov/instructions/i8962): actual tax-family/required-filing dependent MAGI worksheets, regional prior-year poverty guidelines, fractional-percentage truncation, four-place applicable figure, annual and monthly dollar rounding, source-specific line 10 method selection, duplicate-policy benchmark treatment, and physical audit line routing.
- [Rev. Proc. 2025-25, section 3](https://www.irs.gov/irb/2025-32_IRB): independently indexed 2026 applicable percentage brackets, from 2.10% below 133% FPL through 9.96% at 300–400% FPL.
- [2025 HHS poverty guidelines](https://www.govinfo.gov/content/pkg/FR-2025-01-17/html/2025-01377.htm): TY2026 uses contiguous base/increment $15,650/$5,500, Alaska $19,550/$6,880, Hawaii $17,990/$6,330. Current 2026 HHS guidelines are not the TY2026 tax calculation table.
- [Public Law 119-21](https://www.govinfo.gov/content/pkg/PLAW-119publ21/html/PLAW-119publ21.htm): section 71302 removes the special below-poverty lawful-presence/Medicaid exception in 2026; 71304 excludes coverage enrolled solely through income-based special enrollment without a qualifying event from plan years beginning after 2025; 71305 removes every income-based excess-APTC repayment cap after 2025. Broader noncitizen restrictions begin in 2027 and new verification provisions begin in 2028, and are not applied early.
- [26 CFR 1.36B-2](https://www.ecfr.gov/current/title-26/section-1.36B-2): existing marketplace-estimate below-poverty exception requires actual qualifying enrollment estimate, APTC, other eligibility and no intentional/reckless inaccurate information. This remains distinct from the repealed lawful-presence exception.
- [Pub. 974](https://www.irs.gov/publications/p974): completed coverage-family benchmark and QSEHRA Worksheets N/Q determine actual monthly eligibility/benefit reductions, including annual-method monthly allocation. Actual QSEHRA affordability is an input from the completed worksheet, not inferred from an employer's aggregate benefit.
- [October 15, 2026 proposed rule](https://www.govinfo.gov/content/pkg/FR-2026-10-15/html/2026-21056.htm): proposed changes are not treated as binding final rules. Final 2026 Form 8962 instructions have not been established; the draft endpoint still serves 2025 material.

## Implemented package

- Shared raw-fact contract is in `spec/federal/2026/ptc-source-facts.yaml`; shared schema/test commit `4fecf37` preserves unknown amounts and rejects duplicate months. A parsed default zero cannot become verified original data on a second parse.
- `spec/federal/form-8962.yaml` was rewritten before adding tests. All 24 new cases initially failed in `.local/upgrade-evidence/ptc-red.log`; the calculation then passed the new cases and corrected historical regressions.
- Strict 2026 and opt-in 2025 paths use actual taxpayer/dependent MAGI, family size, FPL region, coverage eligibility, corrected household benchmark, source-year/identity/completeness, MFS/below-poverty exceptions and actual QSEHRA inputs. Required facts never fall back to legacy aliases.
- Annual calculation applies only to unchanged full-year original policies and corrected household coverage; partial-year/replacement/variable policies use monthly calculation. APTC changes alone do not force a method change. One rounded monthly contribution applies per household, not per policy. Duplicate household benchmarks require actual reconciliation, not summation.
- Taxpayer and dependent MAGI may be signed; household income is floored only after combining. Table input drops the fractional poverty percentage; >400% reports 401, and TY2026 permits no PTC above the cliff. Decimal arithmetic and explicit rounding cover every monetary calculation, including rational annual QSEHRA allocation before final rounding.
- Physical audit IDs now distinguish line 3 household income, 4 FPL, 5 whole percentage, 7 applicable figure, 8a/8b contributions, annual/monthly columns, 27 raw excess, 28 historical cap, and 29 repayment. Net PTC routes to Schedule 3 line 9; repayment routes to Schedule 2 line 1a.
- Historical 2025 aggregate-only calls remain explicitly `sourceFactsVerified:false`; they do not infer below-poverty/MFS eligibility exceptions. Historical tests expecting credit without a required exception were corrected; credit-cap fixtures now use actual above-poverty zero-rate income. Tests expecting continuous interpolation or unrounded monthly contribution were changed to independently derived official-table/dollar results, with the same or stronger assertions.

## Verification

- 151 focused calculation/edge-case tests passed after 24 new cases were observed red.
- Root TypeScript check passed with the complete source-fact contract; no cast asserts unknown schema data as verified facts.
- Logs: `.local/upgrade-evidence/ptc-red.log`, `ptc-calculations.log`, `ptc-types.log`.

## Outstanding work and release constraints

- Part IV cross-family allocation, elected Part V alternative marriage calculation, circular self-employed health-insurance/PTC coordination, and unlawful-presence mixed-family repayment worksheets remain explicitly gated. Their presence cannot silently produce an ordinary calculation. These are implementation gaps, not external approvals and not a completed full Form 8962 claim.
- Guided collection of the complete household/coverage worksheet contract is required for 2026 taxpayers with marketplace statements.
- Final 2026 forms/instructions, independent tax review, approved scenarios and filing qualification remain required. The 2025 reference-summary PDF is review-only and does not qualify a 2026 form.

## Review reference mapping follow-up

- Calculation package committed as `ca8c1e5`; scoped source mapping follows separately.
- The 2025 reference summary now copies the corrected physical audit IDs, includes annual or monthly columns, distinguishes raw policy benchmark totals from the actual household benchmark, and explicitly labels unverified historical facts.
- Missing/duplicate/nonfinite audits, inconsistent audited totals or mismatched source APTC are rejected. Every emitted page has the visible review-only notice.
- Five PDF tests pass; the three new/corrected cases were observed red before the mapping change. Root TypeScript passes; focused lint has no errors (four existing non-null assertion warnings).
- Synthetic `.local/upgrade-evidence/f8962-reference-filled.pdf` rendered to five pages. Pages 1 and 5 were visually inspected; pypdf confirms the review notice on every page and PNG footer pixels confirm it is visibly rendered. No filing qualification is implied.
