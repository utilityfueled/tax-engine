# Pennsylvania Schedule UE overnight travel meals

Pennsylvania allows 100% of actual qualifying overnight business travel meals.
Taxpayers need receipts, a business purpose and evidence that the employer
required the expense. Federal per diem, same-day travel meals and meals while
working late are ineligible. The 2024 and 2025 printed rules agree. The ongoing
department guide supports the same preliminary calculation for 2026 pending
the final year-specific instructions. [2024 Schedule UE, Section II line 13](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2024/2024_pa-40ue.pdf),
[2025 Schedule UE, Section II line 13](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40ue.pdf),
[PA unreimbursed business expense guide](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax/unreimbursed-business-expenses).

Positive typed meal amounts now require explicit confirmation of actual eligible
meals paid and employer-required overnight business travel. A saved positive
amount lacking either fact needs confirmation before calculation. Missing or
zero amounts continue to produce zero without a confirmation. The calculated
whole-dollar amount retains its existing result field so callers can read it.
The source-bound guided employee workflow still admits its existing four direct
expense categories. Overnight trip intake, the separate home-office eligibility
and expense rules, and source-linked reimbursement handling require their own
qualification.

The spec and tests preceded the calculation change. The original implementation
failed 20 targeted assertions on full deductibility, rounding, eligibility and
PA-40 composition. All 382 tests across six targeted suites passed with the
correction, including the original typed return and direct override paths,
source-bound employee results, reference summaries and readiness. The root
typecheck, all 25 Schedule UE spec references and the diff check passed.
