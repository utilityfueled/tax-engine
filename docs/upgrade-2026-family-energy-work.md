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

- Commits: `e2d93f0` calculation and `cffa574` reviewed input validation.

## Adoption (Form 8839)

- Sources refreshed 2026-10-25: [2025 final instructions](https://www.irs.gov/instructions/i8839),
  [2025 final form](https://www.irs.gov/pub/irs-pdf/f8839.pdf),
  [Rev. Proc. 2025-32](https://www.irs.gov/irb/2025-45_IRB), and
  [current IRS credit page](https://www.irs.gov/credits-deductions/individuals/adoption-credit).
- Replaced the incorrect shared credit/exclusion cap with independent per-child
  limits; lifetime usage reduces the remaining maximum before current expenses.
  Refundability is determined per child after phaseout (5000 in 2025, 5120 in
  2026). Current nonrefundable credit and dated historical carryforwards are
  limited by the actual credit-limit worksheet. Oldest vintages are consumed
  first and expire after five following tax years.
- Actual finality and payment years determine expense eligibility in 2026.
  Unreimbursed expense records aggregate before dollar rounding. Employer plan
  qualification and separate exclusion MAGI are required when applicable; foreign
  not-final benefits stay taxable. Qualified-plan special-needs exclusions can
  produce a negative Form 1040 line 1f adjustment, as the final form specifies.
- The [new IRS carryforward FAQ](https://www.irs.gov/faqs/questions-and-answers-about-adoption-tax-credit-carryforward)
  distinguishes the 2025 systemic refund adjustment from Form 8839 completion:
  filers continue following the published 2025 instructions. 2026 carryforward
  inputs require confirmation of the corrected worksheet using the actual IRS
  notice adjustment; this code never infers that adjustment from a refund total.
- Full spec line coverage (33/33), red-before-green calculation/PDF/cents tests,
  112/112 tests across engine, edge and PDF suites, and root types passed.
  Existing wrong expected outputs were corrected against official separate-limit
  and remaining-lifetime-limit formulas, not removed or relaxed.
- 2025 review mapping now copies engine audit values for refund, nonrefundable
  credit, carryforward, liability limit and signed benefits. Missing audit values
  reject export. More than three children require additional attachments and are
  explicitly rejected by this single-form review mapper. No filing qualification.
- Synthetic PDF `.local/upgrade-evidence/adoption-2025-review.pdf` was rendered
  and both pages visually inspected. Printed lines 13/18/31 align with 5000,
  100 and (16280). Reopened canonical AcroForm values, unique widgets and appearance
  streams agree for those fields; serialized PDF regression tests also pass.
- Remaining precise scope boundaries: prior-year foreign employer benefits need
  the historical exclusion worksheet (nonzero amounts reject); shared federal
  wage/credit ordering integration belongs to the federal agent. Final 2026
  Schedule 3-A public-benefit eligibility must be handled centrally across credits,
  with the proposed regulation/final-rule distinction preserved; an individual
  adoption credit is not simply erased when the aggregate refunded benefit is
  restricted. Independent human tax review is pending.

## Remaining assigned work

- Residential energy 2026 termination and prior-year carryforward/credit limits.
- Vehicle acquisition/service-year transition, known-zero prior AGI, confirmed
  qualification and transferred-credit reconciliation behavior.
