# Minimum-tax-credit upgrade evidence

## Sources and scope

Checked October24/25,2026: [final2025 Form8801 instructions](https://www.irs.gov/instructions/i8801), [final2025 form](https://www.irs.gov/pub/irs-pdf/f8801.pdf), [draft2026 form created May27,2026](https://www.irs.gov/pub/irs-dft/f8801--dft.pdf), [Rev.Proc.2024-40](https://www.irs.gov/pub/irs-drop/rp-24-40.pdf), and [ScheduleD Tax Worksheet](https://www.irs.gov/instructions/i1040sd). The draft is research evidence only. No2026 form or model is promoted or qualified by this work.

## Implemented calculation package

- Replaced the hardcoded prior2024 path with tax2025/prior2024 and tax2026/prior2025 tables. Current2026 AMT phaseout changes do not rewrite the prior2025 recomputation.
- Corrected all physical lines1–55. Actual prior6251 income/NOL-source sum, exclusion-only NOL deduction, minimum-tax foreign credit, and6251 comparison tax are explicit source inputs. Prior MFS additions and nonresident real-property floor follow the form; known foreign-earned-income sources use its worksheet.
- Preserved signed line18 before combining carryforward19 and legacy pre2009 vehicle credit20. A negative combined pool yields no credit or carryforward. Line22 is the current regular tax after the specified allowable credits; credit25 flows to Schedule3line6b.
- Replaced the unsupported capital-gain approximation with actual prior QD/CG or ScheduleD Tax Worksheet amounts. Ordinary regular-tax worksheet income, special-gain allocation, and the AMT comparison control the result. Collectibles stay in ordinary AMT; section1250 uses its separate25% computation. Foreign capital-gain-excess modifications require explicit confirmation.
- Shared raw-input completeness cannot be supplied as true to manufacture absent prior AMT/exclusion/carry amounts, and false stays false through reparsing. New source facts remain absent rather than defaulting to zero. Strict2026 calculations require confirmed actual applicable source facts. Legacy simple2025 inputs remain explicitly unverified; positive historical capital inputs require actual worksheet sources.

## Verification

Spec first, then11 failing new calculation cases and2 failing model cases before implementation. Final focused result:87 tests passed across new2026, historical calculation/edge, and raw-source model suites. All55 form-line spec references resolve. Owned-file lint passed. Initial root typecheck caught a concurrent ScheduleA rename; that owner fixed it, and a fresh root typecheck is recorded with the package commit.

Historical expected results were corrected against the actual prior worksheet, including the zero-rate threshold consumed by regular taxable income and signed carry reduction; no assertions or readiness gates were disabled. The IRS instructions' MFS example895950→900950 is covered directly.

## Remaining work and evidence limits

Federal orchestration and exact line22 credit ordering are owned by the federal integration agent; the current-source contract must be passed without defaulting unknown facts. Review PDF line-source mapping is implemented in the follow-up below. Guided collection of these actual prior-return worksheets is still required. This module consumes completed exclusion-only MTCNOLD/MTFTCE worksheets; it does not itself prepare those ancillary source worksheets. Estates/trusts are outside the individual filing-status engine. Final2026 instructions/templates, independent tax review and filing qualification remain pending; current output remains review-only.

## Audited review summary follow-up

Calculation and schema package: `a44adbb`. The review summary now uses the actual official lines 1–26 and all applicable Part III lines 27–55, checks each required audit for uniqueness/finiteness, and reconciles the result totals. It shows the calculation and prior source years, distinguishes unverified historical inputs, and rejects the unavailable 2026 mapping. Every page receives the visible review-only notice.

Verified source calculations can omit both redundant legacy aliases; a red-first model regression confirms the actual Form 6251 fields suffice. The federal integration owner is connecting the exact after-credit limit and all optional source facts without inventing zeros.

Focused calculation/model/PDF suite: 92 passed; all 56 current spec references resolve; root typecheck and owned lint passed. Three new/updated PDF regressions failed before the mapping correction. Rendered the synthetic five-page `.local/upgrade-evidence/f8801-reference-filled.pdf`, inspected first and final pages, and extracted text from every page to confirm the review notice. No filing form is qualified by this rendering evidence.
