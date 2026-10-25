# State scenario selection and qualification gaps

Assessed 2026-10-24. Launch-state demand was requested and is still missing.
No state is selected or filing-qualified. The comparison below supports the
one-or-two-state decision; existing test counts and old verified labels do not
establish demand, legal review or filing readiness.

| Candidate | Existing 2025 implementation | Main remaining 2026 gaps |
| --- | --- | --- |
| Pennsylvania | Resident and separate explicit nonresident/part-year orchestrators; PA-40 review form; supporting class/local schedules mostly reference summaries | Separate PA income classes, federal decoupling, reciprocity and domicile/day-count facts; current local EIT/Philadelphia rates; care/working-family eligibility; prior-year payments/credits; final forms and every attachment |
| Ohio | Full-year resident IT 1040, adjustment/business/credit/withholding and SD 100 modules; reference output only | HB 96 rates and exemption cutoff, annually adjusted thresholds/exemptions, conformity/addbacks, school-district identity and rates, actual payment/carryover facts; full official PDF packet; nonresident and municipal returns are outside current implementation |
| New York | IT-201 full-year state resident and NYC/Yonkers component modules | Conformity, indexed rates/credits, local residency changes and IT-360.1 inputs; supporting final forms. Existing code is not an IT-203 nonresident/part-year return |
| New Jersey | NJ-1040 resident and months-of-residency branches; credit/health-coverage components | Conformity, residency allocations, credit thresholds, withholding/carryovers and final attachments. No NJ-1040NR path |
| Illinois | IL-1040 and Schedule NR allocation/credit modules | Year-specific conformity, allocation/credit/withholding reconciliation, final schedules and filing qualification |
| California | 540/540NR tax/credit/deduction/AMT components | Complete state/federal conformity and residency scenarios, carryovers, final forms and packet assembly; no official California return PDF packet |

`/support` now distinguishes each jurisdiction, year, residency, scenario and
output. Dedicated components may require structured inputs absent from the UI;
the page does not advertise them as a complete guided filing flow. All 2026 full
returns remain unavailable. No demand-based selection has been invented.

## Official sources refreshed

- [Ohio R.C. 5747.02](https://codes.ohio.gov/ohio-revised-code/section-5747.02),
  effective September 30, 2025, HB 96: (A)(3)(c) states the 2026 nonbusiness
  formula, (A)(4) treats taxable business income separately, and (A)(5) requires
  annual adjustment review. Do not copy the 2025 bracket array or assume the
  displayed statutory dollar values replace the commissioner's current values.
- [Ohio R.C. 5747.025](https://codes.ohio.gov/ohio-revised-code/section-5747.025),
  same effective date: (A) changes the exemption eligibility ceiling from
  $750,000 in 2025 to $500,000 in 2026; (B)/(C) require annual exemption indexing.
  Statutory base exemptions are not evidence of the final indexed 2026 amounts.
- [PA 2026 REV-413(I)](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2026/2026_rev-413i.pdf),
  revision 04-25, pages 1–3: 2026 estimated-income threshold $14,000/tax $430;
  90% current-year versus prior full-year PA taxable income times 3.07%; explicit
  estimated-payment dates and farmer rules. This is an estimated-tax instruction,
  not final PA-40 packet qualification.
- [PA Personal Income Tax Guide](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide)
  remains the starting point for residency/source/class-specific review. It
  does not prove every 2026 form or local rate is final.

The other-state rows are a code-gap inventory, not completed 2026 legal research.
After actual demand is supplied, research the selected state's official final
instructions, write per-line specs, derive independent expected cases, collect
complete facts and qualify the exact final form revision. All these gates remain
required; selecting a state cannot unlock generic draft output for filing.

## Complete historical review-packet fixtures — 2026-10-25

The PA/OH synthetic packet fixtures now provide actual personal eligibility,
W-2 owner/state, and investment source facts required by the guided flow. All
eight existing packet tests pass with their original numeric, disclosure and
missing-fact assertions retained. Scoped lint passes. Evidence:
`.local/upgrade-evidence/state-packet-complete-facts.log`.
This fixes test inputs for historical review output; it does not qualify a
state, tax year or filing form. The complete investment helpers are in `4679852`.

## PA source-interest reconciliation — 2026-10-25

PA Schedule A now starts with the disjoint 1099-INT Boxes 1 and 3 and removes
only Treasury interest still present in federal taxable interest. Actual Form
8815 education exclusions and verified prior federally reported interest reduce
both the federal baseline and the exempt-interest subtraction, preventing double
deductions. Schedule SP retains the reported exempt direct-obligation income;
a federal reporting election does not invent a PA tax-forgiveness exclusion.

Official sources: [IRS 1099-INT instructions](https://www.irs.gov/instructions/i1099int),
[2025 PA Schedule A, revision 04-25](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40a.pdf),
[PA interest guide](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/interest),
and [2025 PA Schedule SP, line 2](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40sp.pdf).
Source formulas and retrieval date are in `spec/state/pa-orchestrator.yaml`.

Eleven new source/rounding/bond regressions and the adjacent suites pass:
384 tests across five files, plus 15 nonresident tests. Eighteen historical
fixtures now state actual disjoint source-box amounts while retaining their
original scenario assertions. Engine types, spec references and scoped lint pass.
Evidence: `.local/upgrade-evidence/pa-interest-source-green.log`,
`pa-bond-source-red.log`, `pa-interest-{nonresident,types,spec,lint}.log`.
Independent review and 2026 state/form qualification remain outstanding.
