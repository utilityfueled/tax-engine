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

## Correction: Form 1040 and Schedule 2 payment routing

Refreshed the official 2025 Form 1040 instructions (lines 29, 31 and 38) and final
Schedule 2 PDF. Estimated-tax penalty now stays on Form 1040 line 38, outside
line 23 and total tax; it reduces the refund or increases line 37. Line 34 shows
the overpayment before penalty. Refundable AOC uses line 29. Schedule 2 correctly
separates Part I (APTC line 1a and AMT line 2) from Part II line 21, and line 18
sums only line 17 taxes. The penalty no longer impersonates Schedule 2 line 19.
The digital-asset response has its own audit key. The duplicated AMT in the
penalty tax base was removed. The Schedule H agent's new facts are forwarded.

All four new regressions failed first. 601 focused federal, integration and
Schedule 2 tests pass; typecheck, spec validation and whitespace checks pass.
Older assertions using incorrect Schedule 2 grand totals were replaced with
amounts derived from the final form's Part II sum, preserving boundary and
precision coverage; the >$100k scenario still exercises an actual >$100k Part II
sum. Scoped diff reviewed. Rule version advances to 2025.6. Parent's qualified
review-PDF mapping spec metadata is preserved in this shared-spec commit.

Remaining Form 2210 work: the existing algorithm assumes equal quarterly
underpayments and 2025 rates, so it is not qualification evidence for 2026 or
irregular payments. Separate work must finish dated installment calculations,
prior-year safe-harbor qualification, and all tax-base exclusions. Wage/withholding
classification and foreign-exclusion line routing remain separate corrections.

## Integration: 2026 dependent-care facts

The source-backed Form 2441 calculator now receives the actual return year,
filing status, separate taxpayer/spouse earned-income limits, known excluded
section 129 benefits and eligibility confirmation. Unknown amounts remain
unknown; zero spouse income stays zero. Four new integration assertions failed
first; 609 focused tests and typecheck pass. Whitespace and scoped diff reviewed.
The package's spec reference resolves; global spec validation temporarily sees
31 references in the concurrently edited Form 8839 spec before its agent writes
its tests. The 2025 legacy omission path remains explicitly tested.

Part III employer-benefit exclusion and taxable-benefit wage routing still need
full integration before the complete 2026 rule pack can be qualified; accepting
an explicitly determined excluded amount does not invent those facts.

## Package: active-business QBI minimum

Refreshed IRC 199A(i), (c)(2), (d) and (e). The 2026 constant pack now declares the
$400 minimum and $1,000 active-income threshold. Both Form 8995 paths apply the
minimum after ordinary limits, using exact pre-threshold Decimal amounts and
actual material participation. Detailed SSTBs contribute only their applicable
qualified portion; elective aggregation does not invent participation. Unknown
participation or active historical loss character rejects when it could change
the floor. A deduction already at least $400, or sources that cannot reach
$1,000 even if all positive sources were active, need no invented participation.
The zero-taxable-income path now computes the statutory minimum, and a historical
QBI loss survives a year with no current business sources.

Initially nine law/integration assertions and two constant assertions failed;
the no-current-business carryover regression also failed before correction.
674 focused tests passed before that final carryover case; the final count is
recorded with the commit checks below. Typecheck/spec validation pass. The scoped
diff was reviewed. This is source-derived implementation, with independent tax-law
review still pending; no readiness gate changed. Business-tip allocation and
self-employed deduction attribution remain separate QBI integration work.
Final package verification: 675 focused tests pass, including the carryover
regression; engine typecheck, spec validation and whitespace checks pass.


## Correction: source wage and withholding lines

Official Form 1040 instructions and Form 8959 Part V establish separate W-2,
1099 and other-form withholding. Additional Medicare withholding was computed
but omitted from federal payments. It now reaches line 25c, including a joint
return with withholding but no Additional Medicare liability. Actual K-1 federal
withholding is preserved separately from state amounts. Form 8959 withholding
reconciliation uses whole-dollar source totals and provides actual lines 19–24.
Wage audit lines 1a, 1c, 1g and 1h now retain their source classification.

Three source-classification regressions failed first; 597 focused tests and
engine typecheck pass. Spec/whitespace checks and scoped diff reviewed before
commit. Rule version advances to 2025.7. Remaining Form 8959 Part I/II audit
positions and separate-part rounding need a separate source-backed correction;
RRTA inputs remain unsupported. No qualification gate changed.

## Correction: Form 8959 separate tax parts

The final official Form 8959 requires separate rounded wage tax (line 7) and
self-employment tax (line 13), summed on line 18. The former combined calculation
could differ by a dollar and exposed incorrect line identifiers. Both regression
cases failed first; 115 focused tests pass, with engine typecheck, spec validation
and whitespace checks. Five older audit expectations now use the official line
positions and full supported line set, preserving their amount assertions.
The separate parts also provide the source amounts needed for the Schedule 8812
payroll-tax alternative. RRTA compensation remains unsupported; no gate changed.

## Package: Schedule 8812 refundable-credit worksheet

Refreshed the final Schedule 8812 and its Credit Limit Worksheet B. The calculator
now supports the payroll-tax alternative for three-child families and bona fide
Puerto Rico residents, subtracts EIC/excess Social Security payments, disallows
ACTC when Form 2555 is filed, and exposes the worksheet's reserved nonrefundable
amount for adoption/clean-energy ordering. The indexed refundable cap is explicit
in the constant pack. Unknown 2026 payroll facts reject when material. Counts and
monetary inputs are validated; all arithmetic uses Decimal. Actual identity and
foreign-income addback facts remain the next federal integration package.

Seven new assertions failed first; all 115 focused tests, typecheck and spec
validation pass. Existing audit checks now verify the official line positions
and complete supported line set; no amount assertion was weakened. Scoped diff
reviewed. Integration/identity qualifications and Schedule 3-A remain pending.

## Integration: Schedule 8812 identity, MAGI and payroll facts

2026 child-credit claims now require actual timely taxpayer/dependent SSN/TIN
eligibility and known possession-income/PR-residency facts. An SSN's printed
format is not evidence of employment validity or issue date. Joint filers may
qualify with one employment-valid SSN and both timely TINs. Known ineligibility
removes the claimed credit without manufacturing an ODC claim. Existing explicit
qualifying-dependent flags remain responsible for the non-identity dependency
requirements; independently qualified complete-dependent review is still pending.

The federal calculation now supplies the actual year, foreign-income addbacks,
Form 2555 status and payroll/EIC/excess-SS amounts to Schedule 8812. EIC and Form
8959 run before credit allocation so Worksheet B can use those source amounts.
Five substantive identity/payroll regressions failed first; additional positive,
ODC, duplicate-claim and unknown-residency checks pass. One draft joint-return
fixture was corrected before implementation to the independently derived bracket
amount ($50,000 minus $32,200, times 10%). Final 2026 tax tables remain unqualified.
625 focused tests/typecheck/whitespace checks pass; all our spec references resolve.
Global spec validation temporarily sees eight references in the concurrently
edited Form 8936 specification, reported to its owner. Scoped diff reviewed.

### Personal credit limit worksheets A/B — 2026-10-25

Refreshed IRS Schedule 8812, Form 8839 and Form 5695 instructions. Added a pure
Decimal allocation helper: reserve Worksheet B line 14 where applicable, allocate
adoption before residential clean energy, then return the actual remaining CTC
limit. Form 2555 and claims without qualifying children use ordinary CTC priority.
Six spec-linked tests were absent/red before implementation and now pass, including
$1,000 tax/$2,200 CTC/$1,700 refundable potential -> $500 adoption and $500 CTC.
72 focused tests, typecheck, spec validation and whitespace checks pass. Reviewed
scoped diff. Integration follows separately; this helper does not qualify a form.

### Adoption/vehicle source contracts — 2026-10-25

Added actual adoption finality/expense years, plan/exclusion worksheet and
origin-year carryforwards; preserved vehicle acquisition/service/report/transfer
facts and current/prior MAGI confirmations. Missing prior-year AGI remains unknown;
known zero remains usable. Before legacy vehicle defaults, compute completeness
from original price/type/personal-use/transfer fields and overwrite any supplied
marker. Verified calculations will require that evidence rather than infer it.
Four spec-linked contract tests failed first; 120 focused tests, root typecheck and
whitespace checks pass. Subsequent log inspection found malformed YAML in the new
contract entry (the shell continued after validation failed); corrected in the
return-integration package and reran validation. Scoped diff reviewed.

### Federal personal-credit integration — 2026-10-25

Integrated actual Form 2441/5695/8936 limits and Schedule 8812 Worksheets A/B.
The dependent-care/elderly/education/saver/improvement/vehicle sequence now feeds
actual remaining limits to adoption and residential clean energy, then CTC.
Schedule 3 aggregates allowed credits after general-business and prior-AMT
allocation; prior-AMT now sees actual net regular tax after earlier credits.

Form 8839 uses actual Part III exclusion MAGI before AGI, includes signed taxable
benefits on 1040 line 1f, sends refundable adoption to line 30, limits nonrefundable
credit, and preserves year-tagged carryforward. Actual W-2 code T must reconcile
when reported. 2026 original classification/benefit/prior-lifetime-use history is
required before defaults. Form 5695 exposes allowed credit and next-year carry;
2026 costs cannot become carryforward. Verified 8936 claims require original
facts; actual new/used transfer repayments enter Schedule 2 lines 1b/1c and 1040
line 17. Unresolved legacy transfers and unattributed business vehicle credits
reject explicitly.

Nine calculation/missing-fact regressions failed first, plus an adoption-history
regression; eleven integration cases now pass, including child/adoption ordering.
Expanded focused run: 918/919 passed; the remaining pre-existing vehicle assertion
expected tentative $4,000 rather than the actual $3,872 tax limit. Corrected it with
an independently derived bracket amount and additional $4,000 tentative/$128
unused assertions. The affected 469 tests pass on rerun; root typecheck, 3,112
spec references, and whitespace checks pass. Scoped ESLint has no errors and six
pre-existing non-null warnings. Scoped diff reviewed.

Still unqualified: 2026 Schedule 3-A public-benefit limitation/final IRS forms and
independent tax review; Schedule R/8863 exact worksheet audit needs follow-up;
prior-AMT year-aware prior constants remain next. No filing readiness gate changed.

### Schedule 3 and omitted payments — 2026-10-25

Refreshed official 2025 Schedule 3 and 1040/2210 instructions. Corrected GBC/prior-AMT
lines 6a/6b, separate line-6 subtotal7 and total8, PTC9, extension10 and excessSS11.
ACTC/AOC remain explicit legacy result fields but never enter Schedule 3 totals or
fabricated lines14a/14b; they belong directly on1040. Federal extension payments
now enter total payments once; actual prior-return applied credits enter line26,
with source-year mismatch rejected. Form2210 treats excessSS as withholding and
excludes extension payments from refundable-credit tax-base reductions.

Five new source-linked regressions failed first. Historical line/total assertions
were corrected to the printed form without dropping cases; direct1040 amounts are
still asserted. 549 focused tests, root typecheck, 3,114 spec references and
whitespace checks pass. Scoped diff reviewed. Rule versions advanced to2025.8 and
2026.3-law-integration-draft to identify changed calculations; qualification and
incomplete2026 gates remain unchanged. Per-filer/per-employer excessSS calculation
and actual dated Form2210 payment/rate calculation remain separate follow-up.
