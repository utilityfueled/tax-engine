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
- Credit-ordering follow-up adds the actual nonrefundable worksheet limit with
  separate tentative/limit/allowed audit lines 9/10/11. Red-before-green regression,
  68/68 focused tests and 6/6 spec references passed; legacy omitted standalone
  limits retain their prior API while federal integration supplies actual limits.

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

## Residential energy (Form 5695)

- Calculation commit: `9639aa2`.

- Refreshed [final 2025 instructions](https://www.irs.gov/instructions/i5695),
  [IRC 25C](https://uscode.house.gov/us/usc/119-118/t26/s25C/) and
  [IRC 25D](https://uscode.house.gov/us/usc/119-118/t26/s25D/). The
  [2026 draft form](https://www.irs.gov/pub/irs-dft/f5695--dft.pdf) corroborates
  the four-line carryforward calculation; it supplies no filing qualification.
- 2026 creates no credit from new costs, including prepaid installations completed
  in 2026. Actual confirmed prior-year clean-energy carryforward is limited by the
  tax-liability worksheet; the entire unused balance continues to 2027. Supplied
  energy facts require a known carryforward, including explicit confirmed zero.
- Detailed 2025 records use actual property categories, valid dates, known residence
  and qualification facts, manufacturer IDs and fuel-cell capacity. Individual door,
  window, AC, heater, furnace, panel, audit and shared heat-pump caps are applied
  before the general pool and tax limits. Known false facts produce zero; unknown
  facts reject. Positive legacy aggregates cannot accompany detailed records.
- Both actual credit-limit worksheets are required for the detailed 2025 path.
  Federal ordering integration is a separately owned change. Legacy scalar input
  compatibility remains review-only and cannot establish detailed qualification.
  Joint-occupancy/multiple-household allocation and additional attachment facts
  still require an extended source contract; nothing infers those facts here.
- Red evidence: `.local/upgrade-evidence/energy-detailed-red.log` (four new failures).
  Green evidence: `energy-detailed-green.log`, 73/73 tests; root typecheck;
  38/38 current spec entries have valid test references. Scoped ESLint has no
  errors and four preexisting non-null assertion warnings. Reviewed category caps,
  line formulas, dates, unknown/false distinctions, and carryforward conservation.
- Review PDF mapping is being updated separately to consume these audited lines;
  the existing scalar recomputation cannot be used for detailed records.

## Clean vehicles (Form 8936)

- Refreshed [2025 final instructions](https://www.irs.gov/instructions/i8936),
  [Schedule A](https://www.irs.gov/pub/irs-pdf/f8936sa.pdf),
  [transfer FAQ](https://www.irs.gov/newsroom/topic-h-frequently-asked-questions-about-transfer-of-new-clean-vehicle-credit-and-previously-owned-clean-vehicles-credit),
  and [26 CFR 1.30D-4](https://www.ecfr.gov/current/title-26/section-1.30D-4).
  The [2026 draft](https://www.irs.gov/pub/irs-dft/i8936--dft.pdf) is research
  corroboration only; no vehicle form is qualified for 2026 filing.
- Verified 2026 records require actual binding-contract/payment/possession dates,
  accepted seller report, VIN/owner, vehicle and buyer qualifications, resale/return
  facts, use and transfer amounts. Acquisition is the later contract/payment date;
  both must establish acquisition by September 30, 2025. Possession determines the
  return year. Used acquisition before 2023 is ineligible. Duplicate VINs reject.
- Current and prior MAGI use actual exclusions and each year's actual filing-status
  threshold. Known zero prior AGI is preserved in both APIs. Newly-joint spouse
  claims need owner-specific prior MAGI when relying on a separate prior return.
- Seller-reported amounts cannot exceed statutory amounts. New fuel-cell/battery
  paths and rounded business allocations are separate. Used credit has no personal
  use proration in the official Schedule A. Actual worksheet balances allocate
  nonrefundable credit to used vehicles before new vehicles; unused personal credit
  is lost. Business credit is preserved separately and requires Form 3800 integration.
- Transferred credits never produce a second return credit. MAGI failure or resale
  within 30 days creates actual reported repayment: new to Schedule 2 line 1b,
  used to line 1c. Low tax liability does not recapture a valid transfer. Returns
  to the dealer require a corrected seller report and preserve dealer-side
  reconciliation without inventing taxpayer tax. Conflicting transfer facts reject.
  Per-owner limits prevent a third transfer or duplicate used-credit claims.
- Red proof: `.local/upgrade-evidence/vehicle-source-red.log` (six new failures).
  Green: 90/90 engine and edge tests, root types, scoped ESLint without warnings,
  and 20/20 spec references. Reviewed the distinct refund/resale rules and corrected
  the earlier proposed aggregate repayment destination against actual Schedule A.
- Federal schema/orchestration must preserve pre-default missingness, pass both
  income tax and remaining tax values, route the separate repayments, and gate
  unintegrated Form 3800. Historical 2025 scalar records remain unverified; unresolved
  transferred records explicitly return requiresTransferReconciliation=true.
- Existing 8936 review PDF recomputes credit ordering and guesses prior-year filing
  status. It must be migrated to audited source values before using verified records.

## Remaining assigned work

- Map Form 5695 review PDF from audited values and actual source facts.
- Review-only vehicle PDF source mapping and per-vehicle Schedule A attachments.
- Federal source/repayment/credit-ordering integration and independently reviewed
  qualification remain tracked by the coordinating federal/parent agents.

### Printed energy-line audit follow-up

- Official 2025 line 19 rounds the most expensive door's credit separately from
  the aggregate of remaining doors; three $5 doors produce $5, not $6.
- Fuel-cell property below 0.5 kW is ineligible even when an upstream qualification
  flag is true. Its cost is retained as disallowed, with no credit or carryforward.
- Added numeric audit entries for individual/overflow property costs, capacity,
  and all printed category totals. PDF mappings can copy those entries and
  preserve the actual source ordering without repeating tax arithmetic.
- Red: `energy-audit-red.log`; green: 74 Form 5695 tests and three spec-reference
  checks. ESLint: zero errors, four pre-existing non-null assertions in tests.

### Historical vehicle tax-limit integration

- Actual supplied tax liability limits now apply to historical 2025 aggregate
  records too, in the official order: previously owned vehicles before new
  vehicles. Tentative credit, allowed credit and unused credit stay separate.
- This compatibility calculation does not verify missing vehicle source facts;
  unresolved dealer transfers still require the detailed reconciliation path.
- Regression: $4,000 used plus $7,500 new tentative credit with $5,000 remaining
  tax allows $4,000 used and $1,000 new. Invalid limits reject explicitly.
- Red/green focused test recorded; no final-form qualification claimed.

### Energy review export correction

- Replaced scalar credit recomputation with mandatory unique engine audit entries
  for every numeric printed line. Absent/duplicate/invalid audits, legacy scalar
  records and inconsistent allowed totals now reject instead of printing zeros.
- Mapped category costs, limits, carryforward, actual fuel-cell capacity and actual
  four-character QMIDs. The IRS fields reuse `f3_30` under different parents;
  fully qualified paths preserve both the first heater cost and second heater QMID.
- Added a visible review appendix with every supplied property, including overflow
  and ineligible records. Installation addresses, physical qualification questions,
  enabled-property codes and occupancy allocations are explicitly uncollected;
  none are guessed from a mailing address or aggregate qualification flag.
- Four focused mapping tests pass, including serialized fields, overflow pagination,
  exact-year/template gates and audit failures. Synthetic `energy-2025-review.pdf`
  was rendered and inspected: line10 $500, line15 $1,000, line16 $2,800, two separate
  water-heater QMIDs/costs and the review-only footer. All five pages contain the
  notice; final source/form qualification remains pending.
