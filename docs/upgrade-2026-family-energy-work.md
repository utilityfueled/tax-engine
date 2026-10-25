# Family and energy credits: 2026 calculation work

Calculation evidence is separate from final-form qualification. The current 2026
2441/5695/8936 instruction PDFs are drafts and are not filing artifacts. No new
2026 form mapping or readiness claim is enabled by these changes.

## Dependent care (Form 2441)

- Official source refreshed 2026-10-25: [26 USC 21(a)(2), (c), (d)](https://uscode.house.gov/us/usc/119-118/t26/s21/).
  [IRS dependent-care information](https://www.irs.gov/credits-deductions/individuals/child-and-dependent-care-credit-information)
  and the [2026 draft instructions](https://www.irs.gov/pub/irs-dft/i2441--dft.pdf)
  corroborate the year change.
- Spec first: `spec/federal/form-2441.yaml`, then three failing spec-linked tests,
  followed by year-aware Decimal calculation. 2025 rates preserved; 2026 has both
  phase-downs, joint thresholds, exclusion offsets and separate-spouse income.
- 2026 callers must provide confirmed provider/person/work/residence eligibility,
  actual taxpayer and spouse earned income, and an explicit excluded-benefit
  amount. That is the completed section 129 exclusion, not an inferred W-2 amount.
  Earned-income inputs must already account for foreign exclusions, deductible
  self-employment tax, and any applicable monthly student/disability worksheet.
  Prior-year expenses and the Part III exclusion worksheet need separate facts;
  these are not inferred by the arithmetic routine.
- Red proof: `/private/tmp/tax-2441-red.log` (new tests failed). Green: 67/67 focused
  tests and root typecheck, 2026-10-25. Scoped ESLint: no errors, six existing
  non-null-assertion warnings in older tests. Review: inspected diff and boundary
  expectations against the statute; independent human tax review remains pending.
- Shared input/orchestrator integration is owned by the federal-rule agent and
  must pass its own end-to-end tests before this package is treated as integrated.

## Remaining assigned work

- Adoption refundable/nonrefundable split, separate credit/exclusion lifetime
  limits, phased amounts per child, and carryforward vintages.
- Residential energy 2026 termination and prior-year carryforward/credit limits.
- Vehicle acquisition/service-year transition, known-zero prior AGI, confirmed
  qualification and transferred-credit reconciliation behavior.
