# Federal 2026 work ledger

Status: implementation in progress; **not tax-review qualified or filing ready**.
Full 2026 return calculation remains gated. Expected outputs below are manually
derived synthetic literals, not independent human-reviewed evidence.

## Scope audit (2026-10-24)

- [x] Refresh IRS Rev. Proc. 2025-32, Schedule A instructions, Publication 525,
  and the final 2025 Schedule 1-A form. Current Schedule A/Pub. 525 instructions
  are still labeled 2025. Do not represent them as final 2026 form qualification.
- [x] Historical refund SALT rules and explicit origin-year validation.
- [ ] Independent complete immutable 2026 data, provenance and payroll checks.
- [ ] Schedule 1-A eligibility, phase-downs and orchestration.
- [ ] CTC/ACTC eligibility, three-child/SS tax branch and exclusions.
- [ ] Charitable floor/nonitemizer deduction, itemized cap, gambling rules.
- [ ] Dependent care, adoption refundability and expense coordination.
- [ ] Education/529, QBI minimum deduction, PTC/APTC and energy transitions.
- [ ] Carryforward year validation and historical computation audit.
- [ ] Independent human review, independently derived expected outputs and
  final form qualification (external requirements; no substitution by agents).

## Package: taxable refunds preserve their deduction year

Sources refreshed 2026-10-24:
- https://www.irs.gov/publications/p525 — Recoveries; recovery for multiple years;
  sales-tax alternative and SALT tax benefit.
- https://www.irs.gov/instructions/i1040sca — 2025 SALT deduction worksheet,
  including MFS division after phase-down.
- https://www.irs.gov/publications/p505 — 2026 SALT amount and MAGI thresholds.

Spec was updated first; 19 new boundary/unknown/mismatch tests ran with 15
failures before implementation. Exact historical years 2018–2026 are supported
for this worksheet, with 2025/2026 MAGI explicitly required. The receipt year
cannot be the same as or precede the deduction year. Conflicting 1099-G Box 3
years and negative refunds reject. Property taxes consume the same SALT cap
under both income- and sales-tax alternatives. Existing 2025 fixtures now state
their known 2024 deduction year; absent years do not silently migrate.

Checks: 537 tests pass across the federal orchestrator, refund unit/boundary and
PDF reference-summary suites; engine typecheck passes; spec validation passes
(2,961 references at this checkpoint). Scoped diff reviewed; no filing gates
changed. Mixed-origin-year batches reject pending separate-workbook orchestration.

Review follow-up to `49d3085`: absent property/income-tax payments now fail for
an itemized refund, rather than consuming zero cap headroom. Explicit zero is
preserved. Negative deduction/payment facts and nonfinite MAGI reject; a finite
negative MAGI remains legal and incurs no phase-down. Seven additional failure
regressions failed before the fix. All 544 focused tests and typecheck pass.

## Package: complete independent 2026 constant data

The 2026 object now declares every existing federal `YearConstants` family,
without copying a 2025 object or importing historical state data. Every nested
object/Decimal is frozen. The rule version is `2026.2-constant-data-draft` and
full 2026 calculations still reject until rule implementation/qualification.

Additional official sources retrieved 2026-10-24:
- https://www.irs.gov/pub/irs-drop/n-25-67.pdf — IRA and QCD amounts.
- https://www.irs.gov/pub/irs-drop/rp-25-19.pdf — HSA contributions.
- https://www.ssa.gov/oact/cola/CovThresh.html — household wage trigger.
- https://www.irs.gov/pub/irs-pdf/p926.pdf — payroll rates and wage base.

39 new official-value/boundary/immutability tests failed before implementation;
all 81 constant/indexed tests and engine typecheck pass. The constant audit also
found a separate legacy 2025 QCD error ($105,000 rather than $108,000), pending
its own spec-first correction. Values for expired incentives intentionally do
not bypass acquisition/discharge date rules or imply current eligibility.

## Package: Schedule 1-A explicit facts and calculation

Official sources refreshed 2026-10-24:
- https://www.irs.gov/pub/irs-pdf/f1040s1a.pdf — final 2025 lines and rounding.
- https://www.irs.gov/instructions/i1040gi — employer/business tip worksheets,
  SSN and eligibility rules, deductible premium and senior birth-date cutoff.
- https://www.irs.gov/instructions/i8995 — line 11 subtracts Schedule 1-A.
- https://www.irs.gov/irb/2026-39_irb — T.D. 10054 vehicle interest regulations,
  published September 2026 and effective November 9, 2026.

Spec and 38 tests preceded the new module. Three federal integration regressions
failed first; two review regressions then failed for per-person senior rounding
and nonjoint spouse claims. The model requires actual SSN, occupation, FLSA,
loan and exclusion facts. It rejects duplicate sources, unknown spouse facts,
invalid dates and unsupported refinancing. Tips/overtime use floor steps; vehicle
interest uses ceiling steps; senior reduction applies separately per person.
Federal deduction flow preserves AGI/payroll and reduces the QBI income limit.
Business tips are calculated independently but federal integration rejects them
until source-level QBI coordination is implemented. Final 2026 form qualification
and independent human review remain outstanding. No readiness gate was opened.

This package also preserves optional residency and education eligibility facts
requested by the guided-input package; optional fields remain unknown until
explicitly answered. Subsequent education work will consume those actual facts.

Checks: 567 focused Schedule 1-A, federal integration and QBI tests pass;
engine typecheck and spec validation (2,971 references) pass. Scoped diff and
whitespace reviewed. All new calculation expectations are synthetic or directly
transcribed IRS example arithmetic, not independently reviewed evidence.

## Package: 2026 wagering and nonitemizer cash gifts

Refreshed https://uscode.house.gov/us/usc/119-120/t26/s165/ (90% wagering
loss/expense deduction before winnings cap) and
https://uscode.house.gov/us/usc/119-120/t26/s170/ (subsection (p), recipient
exclusions, current-year cash only, retained 60% contribution-base limit).
22 spec-linked tests ran with 19 failures before implementation. All 553 focused
Schedule A and federal tests pass, with engine typecheck passing. The 2026
standard-versus-itemized selection includes the additional eligible cash gift
amount; AGI is unchanged. Positive 2026 cash gifts require actual recipient
qualification, supporting-organization and donor-advised-fund facts. Invalid
amounts/dates reject. This does not complete the separate itemized 0.5% floor,
category carryover, PMI or overall limitation work, and the 2026 full-return gate
still prevents public use of the incomplete rule pack.

## Correction: 2025 QCD limit

IRS Notice 2025-67 explicitly compares the $111,000 2026 QCD limit with
$108,000 for 2025. The prior constant had used the 2024 $105,000 limit. A new
published-limit regression failed first; the constant/spec and joint-return
integration expectation now use $108,000 per owner. The older standalone tests
that inject $105,000 remain useful parameterized historical-limit tests and do
not select a tax year. Rule provenance advances to 2025.4. This numeric correction
does not establish independent review or remedy every legacy QCD eligibility path.
Checks: 601 focused retirement/federal tests, engine typecheck and spec validation
pass. Scoped diff reviewed; the QCD change is independent of other 2026 law work.

## Package: 2026 itemized contribution categories and floor

Official sources refreshed 2026-10-24: current 26 USC 170 at
https://uscode.house.gov/us/usc/119-120/t26/s170/ and IRS Publications 526 and
505. The new worksheet keeps the cash/public-property/second-category capital
limits separate, applies the statutory 10%-of-base cash coordination, then
consumes the 0.5% floor in statutory category order. Current-year carryforwards
retain their original year and category; floor-only amounts carry only when a
percentage-limit excess also exists. Ordinary donated property uses the lesser
of value and known basis; unsupported private-foundation capital-gain valuation
rejects unless qualified appreciated stock is explicitly established.

The spec preceded the 13 worksheet tests (initially missing-module failure),
four failing integration regressions and four failing qualification regressions.
Checks: 630 focused charitable/Schedule A/federal tests pass; engine typecheck,
spec validation (2,978 references), and whitespace checks pass. Scoped diff
review confirmed the 2025 calculation branch remains unchanged. Optional basis,
recipient classification and holding-period facts preserve unknowns.

Still blocked: historical charitable carryovers require source category and a
reviewed 2026 floor-transition treatment; they explicitly reject rather than
become current cash. Qualified conservation contributions, special property
valuation/elections and independent human review are not claimed by this
worksheet. The full 2026 readiness gate remains closed. These are synthetic
regressions and source-derived formulas, not independent expected-output review.

## Contract: education identification facts

2026 Publication 505 and IRC 25A(g)(1) were refreshed. The input model preserves
optional taxpayer/spouse/student SSN eligibility and AOC institution EIN; supplied
EIN syntax is validated, absent facts remain absent. Three spec-linked tests
included two red-first regressions; 59 education tests, typecheck and spec
validation pass. This contract enables fact collection and does not yet claim
2026 Form 8863 eligibility/calculation completion.

## Package: restored 2026 mortgage insurance premiums

IRC 163(h)(3)(E), (F)(i)(III), (5)(E)-(F), 2026 Publication 505, and the
historical 2021 Publication 936 premium allocation guidance were refreshed.
Schedule A accepts known provider/residence/acquisition-debt qualification,
contract date, allocation year and substantiated premiums allocable to that year.
Box 5 alone rejects for 2026; prepaid premiums are not assumed fully deductible.
The aggregate qualified allocation receives the exact 10% ceiling-step phaseout,
including the MFS threshold/step. Contracts before 2007 remain excluded; 2025
continues to give no PMI deduction. Actual prepaid amortization inputs remain
required from source records rather than an inferred loan term.

All 18 new tests failed before implementation. 579 focused Schedule A/federal
tests pass, engine typecheck and spec validation pass, and the scoped diff was
reviewed. No qualification/readiness gate changed.

## Package: overall itemized limitation and QBI coordination

Refreshed IRC 68 and 199A(e)(1), plus 2026 Publication 505 Worksheet 2-6.
The statute's exact 2/37 ratio is used instead of the estimated-tax worksheet's
rounded 5.4%; final return-form qualification remains outstanding. QBI is
computed without section 68; its deduction reduces the section 68 income base.
A newly smaller itemized deduction triggers selection of the standard deduction
and recomputation of taxable-income-limited QBI. The section 68 reduction is
reversed for AMT under IRC 56(b)(1)(E). Current section 56 URLs were unavailable;
the official 2023 code text and IRS instructions establish the unchanged AMT
exception, pending independent current-law review.

Eight standalone boundary tests began with a missing-module failure; all four
initial integration tests failed, followed by a red-first AMT regression. Five
integration tests now cover the charitable floor, standard selection, QBI order,
QBI recomputation and explicit NOL-coordination rejection. 730 focused federal,
QBI, AMT and Schedule 1-A tests and engine typecheck pass. Scoped diff and
whitespace reviewed. Spec references for this package pass; a concurrent guided
payment spec had a malformed reference and was reported to its owning agent.

Remaining implementation work: existing historical NOL application changes AGI
only after deductions, so 2026 NOL coordination explicitly rejects until a correct
joint calculation is implemented. Existing standard-deduction and senior AMT
addbacks were also identified for a separate corrective package. No gate opened.

## Correction: standard and enhanced senior AMT addbacks

The refreshed 2025 Form 6251 instructions expressly add back the selected
standard deduction and Schedule 1-A senior deduction. Federal orchestration now
passes those actual amounts separately from K-1 preferences, with distinct audit
entries. AMTI starts with AGI less deductions before Form 1040's zero floor so
low-income returns do not overstate AMTI when adding deductions back. Other
Schedule 1-A deductions remain allowed. The 2025 rule version advances to 2025.5.

Four regressions included three red-first failures. 641 federal/AMT/Schedule
1-A tests and three Form 8801 packet tests pass; engine typecheck and spec
validation pass. The affected PDF expectation was independently recomputed:
($200,000 AMTI - $88,100 exemption) × 26% = $29,094 TMT; $37,067 regular tax less
$29,094 gives the $7,973 credit limit. Scoped diff reviewed. This is a code
correction, not independent tax-law or return qualification evidence.

## Contract and calculation: direct SALT payment categories

Refreshed Schedule A instructions lines 5a–5c. Additional qualified income-tax
payments now enter line 5a and its sales-tax comparison; separately supplied
real-estate taxes enter line 5b. Personal-property taxes stay on line 5c. Input
contract expressly excludes amounts already counted on forms or estimates;
negative/nonfinite additional payments reject. Four integration regressions
failed first; 535 focused tests, typecheck and spec validation pass. Scoped diff
reviewed. This removes the need to invent a Form 1098 lender for direct tax facts.

## Correction: historical wagering precision and QCD expectations

The full-suite run exposed two 2025 wagering precision regressions and a 2025
extra worksheet audit entry introduced by the new 2026 Schedule A branch. The
legacy Decimal source precision and audit identities are restored; existing
regression assertions remain unchanged. Two historical QCD fixtures now use the
source-backed 2025 $108,000 per-owner cap from IRS Notice 2025-67; expected taxable
amounts are independently derived, including the Form 8606 rounded ratio.

All five failures were reproduced before correction. 604 focused tests pass;
spec validation and whitespace review pass. Engine typecheck reached only three
errors in concurrent parent-owned PDF mapping edits (reported to the parent),
with no federal-source errors. No readiness status changed.
