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

### Historical routing regressions reconciled — 2026-10-25

Reconciled the fifteen reported historical failures against the refreshed final
1040/Schedules2/3 instructions. Schedule2line21 is PartII alone, APTC belongs in
PartI, return balance equations include separate line38 penalty, and source
withholding checks use1099line25b/W2Gline25c. Corrected the related single-return
balance equations and strengthened penalty isolation/source amount assertions.
No test was removed and no tolerance widened. All321 affected tests pass; the144
cases with added assertions pass again. Typecheck,3,115spec refs and whitespace
checks pass. Scoped diff reviewed; these fixes do not qualify the legacy2210
short-method estimate or final tax tables.

### Schedule8812 MAGI source audit — 2026-10-25

Added actual Puerto Rico and Form4563 excluded-income fields. Known combined zero
implies both nonnegative components zero; positive2026 totals require an actual
split and supplied totals must reconcile. Schedule8812 now audits AGIline1,
PuertoRico2a, actual Form2555exclusion/housing2b, Form4563amount2c, and known subtotal2d.
Unknown legacy2025 source components remain absent; no zero is invented for review
PDFs. Three spec-linked regressions failed first;88 focused tests, root types,
3,116 spec refs and whitespace checks pass. Scoped diff reviewed. Guided actual
identity facts are required for both years; omitted historical2025 identity facts
remain explicitly unqualified legacy compatibility, never independent review.

### Education eligibility and actual Form8863 worksheet — 2026-10-25

Refreshed final2025 instructions, IRC25A-related IRS2026 SSN guidance and the
2026 draft form (layout evidence only). Added actual student identity/role,
AOCqualification, separate LLCstudent, claimant residency/dependency, Form8862,
and claimant support facts. Joint2026 eligibility requires primary OR spouse
employment-valid timelySSN; dependentstudents require theirs. Known ineligibility
applies to either year; omitted2025 facts remain unqualified compatibility.
Refundability follows actual claimant age/support, including exact half-support
boundary; the unrefundable AOC portion remains available as nonrefundable credit.

Corrected every printed calculation line, including refundable8/nonrefundable9,
LLC18 and actual credit-limit19. Federal integration now forwards prior claim
history and other student facts, adds actual excludedincome toMAGI, verifies2026
student identity against the return role, and preserves the typed form8863 result.
Eight regressions failed first (seven module/model and one integration);180 focused
engine/edge/integration/PDF tests pass. Root types pass; scopedlint has noerrors
and15 existing non-null warnings; whitespace/diff reviewed. Education specrefs
resolve; the only3 global spec failures are the next package's newly written PTC
model tests not yet implemented. No test removed or tolerance weakened. Final2026
forms, complete institution PDF mapping, public-benefit rules and independent
review remain separate qualification requirements.

### PTC household and monthly source contract — 2026-10-25

Implemented the parallel PTC owner's source-first schema contract. Actual household
MAGI components retain signed values and unknown optional facts; monthly coverage
reconciliation requires actual nonnegative premiums/APTC and eligibility answers,
with duplicate months rejected. Form1095A completeness is calculated before
legacy defaults, ignores claimed true markers, and preserves incomplete false
through reparsing so a missing APTC cannot become verified zero. Actual statement
year and policy identity are required for verified calculation; no household
benchmark is inferred by summing policies. Three model regressions failed first;
70 focused schema/historical-form tests, root types, all3,146 spec references and
whitespace checks pass. Scoped diff reviewed. PTC calculation and federal routing
are the next parallel integration package; this contract does not qualify filing.

### Credit stacking historical assertions — 2026-10-25

Reconciled the historical credit-stacking tests with final Schedule3lines8/9/11,
Form8962repaymentline29 and Schedule2AMTline2. Updated independent arithmetic
oracles for actual allowed energy/care credit limits and Schedule8812WorksheetB
CTC reservations; added unused-energy carryforward and ACTC checks. Synthetic
APTC statements now include their actual1–12 month identifiers; the synthetic
child claiming CTC has a consistent under17birthyear. Existing source withholding
assertions remain unchanged and pass. No test removed or tolerance widened.

All100 affected tests, root types,3,146spec refs and whitespace checks pass.
Scoped diff reviewed. Rule versions2025.9/2026.4-law-integration-draft add the
refreshed education sources; dated-source validation now permits actual later
refreshes while still checking the new exact2026-10-25 education provenance.
Qualification remains incomplete/pendingreview/filingfalse.

### PTC return integration — 2026-10-25

Integrated the parallel ca8c1e5 Form8962 package with explicit taxYear and actual
household/coverage facts. Only unqualified2025 compatibility previews receive
legacy AGI/family proxies;2026 never does. NetPTC routes to Schedule3line9 and
full2026 excess advances to Schedule2line1a. A new regression failed first on
silently selecting2025; it now verifies the2026 income cutoff, full3600repayment,
2400netcredit and missing-fact rejection.73 focused return/schema/stacking tests,
root types and all3,147spec refs pass; whitespace and scoped diff reviewed.
Unsupported special PTC allocation, marriage, lawful-presence and self-employment
coordination worksheets remain explicit gates, with final review still pending.

### Education dependent-claim and LLC TIN correction — 2026-10-25

A second source cross-check of final8863 Table1 and WhoCanClaim identified two
boundaries: timely studentTIN applies to LLC as well asAOC, and education-credit
ineligibility depends on being actually claimed as a dependent rather than merely
being claimable. Added actual claimedAsDependent, required for2026, and preserved
the distinct claimability fact. A source-linked regression failed first;132
focused tests, root types,3,150spec refs and whitespace checks pass. Scoped diff
reviewed. Guided facts owner received the corrected distinction. The prior PTC
integration spec run actually had3,148refs after a concurrent spec addition.

### Standard deduction source model and calculator — 2026-10-25

Refreshed final1040/Pub501 dependent worksheets, death examples and2026RevProc
2025-32 amounts. Added explicit blindness/dependency/residency/short-year/death
facts, MFS spouse conditions and deduction election. The pure calculator applies
the dependent1350minimum/earned+450cap, indexed age/blind additions, day-before
65thbirthday and actual deathdate, including the IRS5350blind-dependent and33100
joint examples. MFS extra spouse boxes require actual no-income/no-return/no-other
claimant facts; ineligible standard deductions remain zero.2026 omissions reject;
2025 omissions remain unqualified compatibility. Qualified disaster enhancement
is explicitly separate and is not inferred from ordinary casualty loss.

Spec/test preceded implementation.89 focused calculator/constant-shape tests,
root types, all3,155spec refs, scopedlint and whitespace checks pass. Scoped diff
reviewed. Federal selection/routing integration and explicit synthetic2026
fixture facts follow in a separate package; no readiness gate changed.

### Standard deduction return integration — 2026-10-25

Integrated the7a2a95b worksheet, persisted its audit/result, and honored explicit
standard/itemized elections. An ineligible standard deduction or explicit
itemization cannot switch to standard after the2026 section68 limitation.
Synthetic fixtures now state their actual eligibility facts; three incomplete
joint capital-gain fixtures now contain an actual synthetic spouse identity.
Two new spec-linked integration tests failed before implementation and now
verify actual senior/blind/dependent deductions, unknown2026 rejection,
automatic comparison and both explicit elections.617 focused federal/form tests,
root types and all3,157spec refs pass; scopedlint has zeroerrors (199existing
nonnullwarnings in large historical tests). Scoped diff and whitespace reviewed.
Qualified disaster enhancement and independent review remain outstanding.

### Excess Social Security withholding by owner and employer — 2026-10-25

Refreshed final1040 Schedule3line11 instructions and SSA contribution bases:
https://www.irs.gov/instructions/i1040gi and
https://www.ssa.gov/oact/cola/cbb.html. Each spouse has a separate cap; one-employer
overcollection goes to employer correction/Form843. Grouped by actual owner and
normalized employerEIN, capped each employer contribution before calculating
each owner's excess, and preserved exact10918.20/11439.00 yearly limits. Repeated
EIN records cannot manufacture another employer.2026 joint owner or employer
identity omissions reject;2025 untagged historical preview remains unqualified
and still needs actual owner facts before qualification. Guided owner collection
is being completed by the facts owner. RRTA source support remains separate.

Two new source-linked tests failed before implementation.591 focused return,
Schedule3 and stacking tests, root types and all3,191spec refs pass. Scopedlint,
diff and whitespace reviewed; no filing gate changed.

### State income tax payment-year deduction — 2026-10-25

Refreshed final ScheduleAline5a instructions at
https://www.irs.gov/instructions/i1040sca: estimated and prior-year income taxes
are deductible when paid in the calendar year. Added one shared payment-year
calculator for ScheduleA and the income-versus-sales-tax comparison. It includes
actual in-year state estimated/extension payments and actual immediately
prior-year state credits applied, excludes federal/out-of-year payments, and
rejects invalid dates, amounts and ambiguous older applied-credit source years.
The source-linked regression failed first; the existing four-installment
fixture now asserts6000line5a/8000SALT because its next-January1000payment belongs
to2026.587 focused tests, root types and all3,192spec refs pass; scopedlint has
zeroerrors. Scoped diff/whitespace reviewed. Non-W2 withholding classification
and amounts already deducted on business schedules remain a separate audit gap.

### Stable-suite source assertions reconciled — 2026-10-25

Addressed five law-owned failures from the parent's15929pass/6fail snapshot.
Final Form8863line14 is MAGI, line8 is refundableAOC, and line18 is LLC after
phaseout; the regression now asserts exact independent line values. Final8962
Table5 puts MFS in the other-status column:40000/15060 floors to265% FPL and
1950repayment cap, with noPTC absent an exception. Its synthetic1095A now has
actual policy identity/months. Three joint-return comparison fixtures now have
actual synthetic spouse identities; surtax/bracket/AMT expectations stay intact.
230 affected tests pass, scopedlint has noerrors, and diff/whitespace reviewed.
The remaining workspace1095A expected-source-marker failure is with the facts
owner. SALT audit-label typo after the earlier rename was separately corrected
in8c459ce; all587 tests and root types were rerun successfully after that fix.

### Form8801 return integration — 2026-10-25

Integrated independently implementeda44adbb/93f336c prior-year source worksheets.
Taxyear, sourceyear, original completeness, actual NOL/foreign-tax/capital-gain/
foreign-income facts now reach the module without optional-value coercion.
Verified2026 calculations do not need fabricated legacy alias amounts. Final
line22 uses1040line16+Schedule2line1z less CTC and actual earlier Schedule3credits,
excluding the minimum-tax credit itself, per refreshed i8801 instructions.
Red-first integration tests prove2025prior tables produce2306available credit,
earlier clean-energy credit reduces the current limit to0, and missing/sourceyear
errors reject. A second red-first direct-input test prevents missing priorAMT
from becoming zero even when bypassing schema parse.549 focused tests, root
types and all3,194spec refs pass; scopedlint has zeroerrors, diff/whitespace
reviewed. Source confirmation and independent final-form review remain required.

### Historical unknown employer compatibility — 2026-10-25

Remote CI exposed legacy direct inputs with no employer EIN. Added a red-first
source-linked regression and preserved those omissions without manufacturing a
distinct employer or an excess-withholding credit. Strict2026 still requires
actual EIN. Existing withholding source records remain unchanged.333 focused
Schedule3/Pennsylvania orchestration tests, root types, all3197spec refs and
scopedlint pass. Scoped diff and whitespace reviewed. This is unqualified
historical preview compatibility; actual employer facts remain required for
final return qualification.

### Original credit source facts survive reparsing — 2026-10-25

A red-first schema regression demonstrated that legacy defaults could turn an
incomplete vehicle or adoption record into a complete record on its second
parse. The shared presence marker now preserves an earlier false value, while
explicit complete original facts still pass and a caller-supplied true marker
cannot replace missing fields.17 focused model/guided contract tests, root types
and scopedlint pass. New spec reference resolves; the global validator currently
reports46 expected in-progress Form2555 test references owned by that parallel
package. Scoped diff/whitespace reviewed. No qualification gate changed.

### Foreign income return routing and tax worksheet — 2026-10-25

Integrated 28ba63d's actual Form 2555 source worksheets. Gross wages remain on
Form 1040; only actual foreign employment absent from W-2 is added to line 1h.
Net exclusion line 45 enters negative Schedule 1 line 8d, and housing deduction
line 50 enters adjustment 24j. Source years and W-2 attribution reconcile.
The foreign income tax worksheet uses net lines 45 plus 50, actual disallowed
deductions, and the official capital-gain-excess adjustment. Education MAGI also
uses net lines 45 plus 50 per Pub. 970. Rules now report versions 2025.10 and
2026.5-law-integration-draft; review and filing gates remain unchanged.

Six source-linked integration tests include red-first routing, source-year,
net-MAGI, stacking and capital-gain-excess regressions. Independent bracket
arithmetic for the above-$100,000 fixture gives 85,835 minus 24,095 = 61,740.
625 focused return/form/schedule tests and another nine metadata/routing tests
pass; root types, all 3,239 spec references and scoped lint pass (zero errors).
Scoped diff and whitespace reviewed. The module owner committed the shared
Form2555 historical integration test file with its coherent package.

Remaining related work is explicit: IRS Tax Table use below $100,000, special
capital-gain worksheet correctness, Social Security and savings-bond exclusion
addbacks, foreign self-employment/QBI coordination, and independent qualification.

### Separately reported Treasury interest — 2026-10-25

Refreshed official IRS i1099int: Box 3 Treasury/savings-bond interest is excluded
from Box 1. Schedule B now includes both source amounts exactly once before the
separate Form 8815 exclusion, and preserves both amounts in its payer audit.
A red-first direct test proves 100 + 2,000 = 2,100 interest and a valid 1,000
exclusion leaves 1,100; the federal return independently reports 87,100 AGI on
85,000 wages. Historical fixtures now represent actual disjoint Boxes 1 and 3
while retaining their original exclusion-boundary assertions.136 focused
Schedule B/OID tests, root types, all 3,257 spec references and scoped lint pass
(zero errors). Scoped diff/whitespace reviewed. Pennsylvania integration is a
separate package owned by the parent; all qualification gates remain in place.

### Social Security and bond exclusion addbacks — 2026-10-25

Refreshed Pub.915 Worksheet1 and Pub.970 chapter9. Actual net foreign exclusion,
housing deduction and adoption-benefit exclusion now feed Social Security
provisional income and savings-bond MAGI. The housing deduction is also retained
among the actual Schedule1 line25 adjustments. Farm income now enters both
preliminary worksheets. A supplied lump-sum exclusion aggregate is counted once
and rejected when below known exclusions. Positive exclusions use the audited
19-line Pub.915 worksheet; MFS lived-together skips lines9–16 as instructed.
The result identifies its worksheet kind for the separate reference-PDF update.

Four red-first regressions prove full SS taxation after an actual foreign
exclusion, 9,600 taxable benefits after a 17,280 adoption exclusion, restored
107,000 bond MAGI, farm income inclusion and no duplicate lump-sum addback.
A further red-first MFS audit assertion preserves the official skipped lines.
119 focused income/farm/identity tests, 124 adjacent SS/adoption/reference-PDF
and metadata tests, and a final 123-test SS/bond/metadata run pass. Root types,
all 3,278 spec references and scoped lint pass (zero errors); diff reviewed.
Versions are2025.11 and2026.6-law-integration-draft. No filing or review gate is
changed. Source-qualified Form8815 integration and territory exclusions are the
next separate package. CTC synthetic joint wage-owner fixture correction is
committed separately as aaa9dd7; its14 original identity assertions pass.

### Source-qualified savings-bond return integration — 2026-10-25

Integrated acab62e with the actual return year and full source facts. Confirmed
prior interest included in current statements is removed once before income,
Social Security and MAGI calculations; original gross Box3 remains intact.
Verified current bond interest and exclusion must fit the remaining reported
Box3. Actual territory exclusions and the signed royalty worksheet adjustment
are required for verified MAGI, including explicit known zeros. No legacy
amount is silently turned into a verified source fact.

Three red-first return regressions cover2026 midpoint phase-out, prior interest
and statement contradictions, and actual territory/royalty addbacks.211 focused
bond/interest/metadata tests pass, root types and all3,282 then-current spec
references pass; scoped lint has zeroerrors and diff/whitespace was reviewed.
Metadata is2025.12/2026.7-law-integration-draft; qualification remains closed.
PA source treatment and independent legal/form review remain separately owned.

### Non-W2 state/local withholding deduction — 2026-10-25

Refreshed ScheduleA line5a instructions. A shared source calculation now includes
modeled INT/DIV/B/DA/NEC/MISC/G/K/W2G and1099R state/local withholding once, along
with W2 amounts, actual in-year payments and separate additional payments.
Equal1099R aliases count once; conflicting positive aliases reject. Actual
non-W2 withholding deducted on other schedules is removed.2026 requires that
allocation when positive non-W2 withholding exists; an explicit zero is valid
and omitted facts remain unknown. A fixed sales-tax election does not require
an unused income-tax allocation. Auto-comparison uses the same complete amount
as ScheduleA, preventing a false choice caused by missing withholding.

Spec-linked red tests reproduced450 instead of490 in the comparison and an
unnecessary missing-fact rejection on fixed sales-tax election.220 focused
ScheduleA/payment-year/sales-tax tests and six final source/metadata tests pass;
root types, all3,289spec references and scoped lint pass (zeroerrors). The scoped
diff was reviewed.2025.13/2026.8-law-integration-draft remain unqualified. OID
withholding awaits its separately assigned corrected source contract.

### Schedule C other income and official review fields — 2026-10-25

The final 2025 IRS Schedule C confirms receipts less returns on line3, COGS4,
gross profit5, separate other income6 and gross income7. Actual other income now
enters profit, Schedule1 and ScheduleSE once. Canonical result names follow those
printed lines. The review PDF copies unique finite audited amounts, rejects
source/result contradictions, and preserves unknown proprietor/accounting/
participation/at-risk facts. Actual activity and other-expense descriptions are
represented without inventing them. Physical field checks also corrected the
home-office/net-profit positions and removed text from the line27a amount box.

Two calculation regressions and the source/physical-field PDF regressions were
red before implementation.141 focused ScheduleC/SE/PDF/metadata tests pass;
root types, all3,293 spec references and scoped lint pass (zero errors; existing
non-null assertions warn). The saved canonical fields were reopened and both
synthetic pages rendered and inspected. Scope/diff/whitespace reviewed. Versions
are2025.14/2026.9-law-integration-draft. Detailed COGS/vehicle/home-area facts and
loss limitation forms still require qualification; review copies remain marked
not for filing. This is not an independent tax or form review.

### Separate-person Schedule SE and complete review pages — 2026-10-25

Refreshed final IRS Schedule SE instructions and form. Each spouse now receives
an independent regular-method computation: only that person's profits, losses,
W2 Boxes3/7 and Forms4137/8919 reduce their wage base. Partnership Box14A enters
once; Box4 guaranteed payments are not added again. Actual adjusted K1 source
amounts and farm/nonfarm classification are required in2026. Missing joint
owners or payroll boxes remain unknown; legacy aggregate paths are explicitly
unverified. A partially attributed payroll calculation rejects unknown W2
owners rather than dropping their wages. Additional Medicare consumes line6
subject earnings after the SE filing threshold.

Eight source regressions reproduce spouse wage-base/loss netting, tips, K1
amount duplication and missing-attribution errors. The final2025 review mapper
copies each person's official audits into a complete two-page interactive form,
rejects contradictory totals/duplicate audits and preserves unknown identity.
Reopened canonical fields, widget values and appearance streams are checked;
all four synthetic pages were rendered and inspected.637 focused engine/PDF/
Illinois tests, root types and all3,315 spec references pass. The two historical
Treasury fixtures now use disjoint actual Boxes1/3; a separate100 bank-interest
assertion confirms Illinois retains that taxable amount. No assertion was
removed. Scoped diff/whitespace reviewed; metadata2025.15/2026.10 remains
unqualified. Optional SE methods, CRP/church/community-property worksheets and
per-business QBI deduction attribution remain separate qualification work.

### OID return integration and source-specific deductions — 2026-10-25

Integrated e5696a2 recipient calculations with ScheduleB and the federal result.
Taxable, Treasury and exempt amounts remain separate; actual private-activity
preference enters Form6251line2g. OID federal/state withholding and early
withdrawal penalties enter their own return lines once. Allowable excess bond
premium enters ScheduleAline16, with unused premium carry retained in the OID
result. A historical payer audit now has one reconciled instrument amount and
explicitly labels its unverified aliases. Physical ScheduleA16 and6251line2g
copies use unique finite audits; saved source fields were reopened and rendered.

Five integration/PDF regressions, with calculation and missing-field cases red
before implementation, cover310.33 taxable/620 exempt interest,12.70 withholding,
20 SALT,10 penalty,15 allowable premium and45 carry.293 focused engine/PDF and
metadata tests, root types, all3,321spec references and lint pass (zero errors;
12 existing non-null warnings). Scoped diff and whitespace reviewed. Versions
are2025.16/2026.11-law-integration-draft. Excess TIPS ordinary-loss amounts remain
available from the source module but positive return integration explicitly
rejects:26CFR1.1275-7(f) establishes the loss, while refreshed Pub1212 only
specifies the current-instrument ScheduleB offset, not the excess-loss return
route. No routing fact or line was invented. Detailed TIPS split-statement and
historic premium cases remain blocked in the source module. Independent review
and full Form6251 mapping qualification, including existing standard/senior
add-back display, remain outstanding.
