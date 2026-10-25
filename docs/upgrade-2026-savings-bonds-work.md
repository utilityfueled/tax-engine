# Savings-bond education exclusion work

Refreshed 2026-10-25. This package calculates Form 8815 for 2025 historical review and source-backed 2025/2026 returns. It does not qualify a filing form or remove any release gate.

## Sources

- Final [2025 Form 8815 and instructions](https://www.irs.gov/pub/irs-pdf/f8815.pdf): official lines 1–14, Line 6 worksheet, expense coordination and Line 9 MAGI instructions.
- Final [Revenue Procedure 2025-32, section 4.17](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf): 2026 thresholds of $101,800 and $152,650; phaseout ends at $116,800 and $182,650.
- [2026 draft form](https://www.irs.gov/pub/irs-dft/f8815--dft.pdf) and [draft instructions](https://www.irs.gov/pub/irs-dft/i8815--dft.pdf): corroboration only, not a final filing artifact.
- [Treasury education-bond guidance](https://www.treasurydirect.gov/savings-bonds/tax-information-ee-i-bonds/using-bonds-for-higher-education/) and [31 CFR Part 321 Appendix, paragraph (b)(2)(ii)](https://www.govinfo.gov/content/pkg/CFR-2025-title31-vol2/pdf/CFR-2025-title31-vol2-part321.pdf): actual registration and age eligibility. The regulation expressly permits age 24 on the first day of the issue month. The calculator rejects a purchase-day date substituted for the assigned first-day-of-month issue date.

## Durable checklist

- [x] Spec updated before source and PDF regression tests; observed red failures saved locally.
- [x] Independent 2026 thresholds; correct official line numbering and Decimal arithmetic with dollar rounding and 12-place fractions.
- [x] Actual bond type, registered ownership, dates, owner age, face value, proceeds and prior reporting. Original incomplete-source markers remain false across reparsing. Known ineligible records yield no exclusion.
- [x] Paper EE principal uses half the face value; electronic EE and I principal use their actual face values. Previously reported interest is removed in the official Line 6 worksheet.
- [x] Education expenses are recorded once per return, with actual beneficiary, institution, year, qualification and distinct allocations to other tax benefits. Duplicate source IDs and positive legacy per-bond expense aliases reject on the verified path.
- [x] Actual current-statement reconciliation distinguishes previously reported interest included in current statements from historical interest already removed by the issuer. The federal caller applies only the confirmed adjustment once and reconciles to actual 1099-INT Box 3.
- [x] Historical 2025 aggregate records remain explicitly unverified. They cannot establish verified 2026 eligibility.
- [x] Review PDF consumes exact-year official audits and calculated redemption amounts. Missing, duplicate, wrong-form, nonfinite or inconsistent audited totals reject. Every page retains the review-only warning.
- [x] 107 focused calculator, edge and PDF tests pass; root types and the complete spec-reference check pass. Scoped lint is clean. Parent owns final whole-suite coverage and release checks.
- [x] Four-page synthetic review PDF rendered; first and last pages visually inspected; decoded PDF streams and extracted text confirm the warning on all four pages. Local evidence is under `.local/upgrade-evidence/form8815/`.
- [ ] Final 2026 forms, field mappings, independent tax review, and filing qualification remain pending. The 2025 reference summary is not an official completed filing form.
- [ ] Guided collection must gather the new actual source fields and reconcile old aggregate inputs. The shared schema and complete synthetic fixtures are available; no taxpayer source facts are invented.

## Caller contract

`calculateForm8815(redemptions, modifiedAGI, filingStatus, {taxYear, facts: input.form8815})` keeps `excludableSavingsBondInterest` stable for Schedule B and state integration. The verified path requires `sourceFactsConfirmed`, completed return-level education records, `currentStatementReconciliationConfirmed`, and the actual `priorYearInterestIncludedInCurrentStatements` amount. Known zero is explicit.

The caller computes actual Line 9 MAGI with foreign, adoption and territory addbacks and required Social Security/IRA/PTC coordination. `royaltyInterestAdjustment` is a signed change in MAGI from the actual pre-exclusion royalty-interest computation, not an always-positive addback. The federal integration owner separately validates the three possession/royalty facts, current 1099-INT amounts and Schedule B adjustment.

Source-backed synthetic tests use no real taxpayer information, provider requests or paid services. Commit references are recorded in the main upgrade progress ledger by the integrating parent.
