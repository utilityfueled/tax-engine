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


## Package: QBI deductions follow their actual owner and trade

Sources refreshed 2026-10-25: https://www.irs.gov/instructions/i8995 and
https://www.irs.gov/pub/irs-drop/td-reg-107892-18-corrected.pdf,
Reg.1.199A-3(b)(1)(vi). Partner-level SE tax deductions, health insurance and
qualified retirement deductions reduce the attributable business's QBI. A
partnership statement does not include the partner's individual deductions.

The spec and ten tests preceded implementation: the missing helper failed to
load, and the two return regressions showed omitted partnership and retirement
deductions. The implementation preserves each owner's calculated SE deduction,
does not add guaranteed payments to Box14A twice, and accepts reconciled actual
allocation facts for multiple trades/non-QBI portions. Ambiguous 2026 attribution
fails explicitly; proportional historical previews remain marked unverified.
The allocation contract preserves known zero and rejects omitted amounts,
duplicate sources, mismatches, negative/nonfinite amounts and unknown owners.
This slice attributes already allowed plan deductions; it does not qualify a
retirement plan or establish the allowable contribution from an aggregate entry.

All 11 tax-owned failures in the c0871d3 coverage snapshot were traced to omitted
synthetic W2 Box7 facts or fixtures that had stored ordinary income in Box14A
while separately adding guaranteed payments. Fixtures now state actual Box14A
totals, preserving the independently computed SE totals, and audit assertions
use official line2 instead of the optional-method line4b.

Checks: 215 focused QBI/care/CTC/SE/ScheduleE tests pass; root typecheck and all
3,346 spec references pass. A broader 672-test run passed671 and found only the
separate newly strict Form2210 dated-payment integration (queued next), not a QBI
failure. Scoped lint has zero errors; existing non-null warnings remain. New
helper/tests are warning-free. Diff reviewed. Rule versions advance to2025.17
and2026.12-law-integration-draft; review/filing gates remain closed.


## Package: actual dated estimated-tax integration

The Form2210 core/source package is44793ac. This return integration refreshes
https://www.irs.gov/instructions/i2210 lines1–3,6 and the household-employer
exception. Four new tests ran red before implementation (one source fixture
needed its actual supported Form8919 field, corrected before implementation).
Two additional household/extension regressions cover distinct integration paths.

The return now forwards the actual tax year, full optional Form2210 source facts,
actual federal estimated and extension dates, and explicit prior-credit/return
payment histories. It excludes state payments and never substitutes an annual
amount for dates. Physical line1 receives actual Form1040line22. Line2 includes
only the supported enumerated taxes: SE, distribution taxes, Medicare/NIIT,
HSA distribution/recapture and household tax subject to the two-part exception.
Employee misclassification taxes and excess-contribution excise taxes remain in
Form1040total tax but are excluded from the estimated-tax base.

Five historical direct-call edge fixtures were reconciled with the official
line IDs and actual synthetic quarterly dates. Their original safe-harbor and
$1,443 penalty assertions are retained; no annual-total shortcut was restored.
The independently calculated late-payment regression owes$268 for the three
late installments despite a January catch-up sufficient for the annual amount.

Checks:795 focused core, federal, guided and edge tests pass; root typecheck
and all3,350 spec references pass. Scoped lint has zero errors and six pre-existing
non-null warnings; diff reviewed. Four itemization-only 2026 fixtures additionally needed explicit synthetic
prior-year no-tax-liability facts; their deduction/AGI/taxable-income assertions
remain unchanged. Current 2026 source-fact and unpublished2027Q1 rate gates remain enforced.
Rule versions2025.18/2026.13-law-integration-draft remain unqualified.

## 2026-10-25 — Canonical Form6251 printed audit and review copy

- Official final2025 form and instructions refreshed: <https://www.irs.gov/pub/irs-pdf/f6251.pdf>, <https://www.irs.gov/instructions/i6251>. Source line1a is actual1040line14 minus Schedule1A37; line1b retains signed income; line2a carries actual selected standard deduction or ScheduleA taxes. Depletion belongs2d, AMTI/exemption/base4/5/6, computed tax7, tentative tax9, actual comparison10, excess11 -> Schedule2line2.
- Spec updated first; five new regressions failed before implementation (including an independently known senior/std source fixture:85000AGI,17750standard,5400senior ->1a17750/1b67250/2a17750/AMTI85000). Historical boundary assertions retain amounts and now use official audit IDs.
- Calculation emits official audit lines and actual total deductions; unknown total deductions do not become a fabricated line1a. Review mapper copies unique finite audited amounts and checks result reconciliation instead of deriving the regular-tax comparison from AMT. Duplicate or inconsistent audits reject.
- Added a review attachment identifying unimplemented AMT foreign-tax credit, foreign-income stacking, MFS additional AMTI, AMT NOL and full PartIII source worksheets. No verified-zero AMTFTC or qualification is claimed. Existing calculation amounts are unchanged in this printed-line package.
- Verification:569 focused calculation/federal/OID/PDF/metadata tests passed; root typecheck and3356spec references passed; scoped lint and diff whitespace checks clean. Three-page senior/std PDF rendered; first page and limitation attachment visually checked, review notice text verified on all3pages. Local artifact `.local/upgrade-evidence/amt-review/6251-senior.pdf`.
- Rule metadata now2025.19 and2026.14-law-integration-draft; all independent review/filing gates remain closed. Commit reference: this entry's package commit.

## 2026-10-25 — Single ScheduleA estate-tax deduction

- Refreshed official beneficiary instructions <https://www.irs.gov/instructions/i1041sk1> Box10 and ScheduleAline16. Actual estate tax attributable to IRD belongs in the same other-itemized deduction aggregate as allowable wagering losses and excess bond premium.
- Fixed a concrete integration regression: the ScheduleA result/PDF omitted estate tax while the global audit carried a second conflicting line16. ScheduleA now includes and validates actual Box10 sources once; the post-ScheduleA duplicate addition is removed. Existing3000/3500independent assertions preserved. New spec-first mixed-source and physical-PDF tests failed before implementation and now prove2000gambling+3000estate=5000once, including totalitemized.
- Verification:254 focused ScheduleA/K1/OID/PDF tests and364 adjacent full-return/SE-PDF tests pass; types,3360spec refs, lint0errors1existingwarning, and diff checks pass. Rendered ScheduleAline16/17 and source descriptions inspected (`.local/upgrade-evidence/amt-review/estate.pdf`). All prior CI8f7f172 non2210 failures assigned to this package now pass at current source.
- Separate unresolved source boundary: Box11B termination deductions retain their fiduciary statement category and cannot be qualified from the legacy aggregate scalar; Box11A official line24k routing also remains in the bounded federal follow-up list. This package does not claim those scenarios qualified.
- Metadata2025.20/2026.15-law-integration-draft; gates remain closed. Commit reference: this entry's package commit.

## 2026-10-25 — Published federal Tax Table source helper

- Refreshed final2022–2025 IRS tables; exact URLs and sourcePDF SHA-256 hashes are in `spec/federal/tax-table.yaml`. Actual published rows were extracted independently from PDF text into `tests/fixtures/tax-tables/`; all2,062 rows/all8,248 filing-status amounts peryear match the Decimal interval-midpoint calculation. Total32,992 source cells, both integer endpoints, and all QSS/joint comparisons pass.
- Added explicit taxYear to current/base-year constant packs and a separate `calculateRegularIncomeTax` helper. The existing exact progressive-bracket helper retains its semantics for callers that require rate arithmetic. Final2022–25 ordinary tax uses the published intervals below100000 and exact brackets at/above100000; nonfinite and unknown-year requests reject.
- Final2026 table was unavailable at refresh (current publication still2025). The2026 helper is explicitly `statutory-rate-preview` and does not generate or claim final table amounts. Existing getConstants(2026), independent review and filing gates remain closed.
- Spec first, three red tests recorded before implementation.69 focused tests pass, including every source cell; root types pass. This source/helper package precedes actual1040/QDCG/foreign/kiddie/ScheduleJ integration, whose historical expected amounts must be reconciled with the source rows separately.

## 2026-10-25 — Immutable f23a13a full-suite fixture reconciliation

- Parent full-suite snapshot found five stale cases across four owned files: two AMT audits still expected pre2025 line numbers, and three isolated2026 credit/deduction/bond scenarios lacked actual Form2210 facts. Updated only the physical audit IDs(1b/4/5/6/9) and declared explicit synthetic full-year US-resident prior-year zero-tax facts. Original tax/credit/deduction/bond amount assertions remain intact; no penalty or unknown-rate gate changed.
- All84 focused tests pass. Scoped diff reviewed and whitespace clean. Parent's snapshot met unchanged coverage thresholds(85.96percent branches,91.61percent functions) but was red until these five fixture corrections; this entry does not substitute a fresh all-green whole-suite run.

## 2026-10-25 — Published tax tables and complete preferential tax worksheets

- Integrated source helper `0b3d78e` into Form 1040, both foreign-income tax worksheet steps, parent/child Form 8615 and the current-year Schedule J computation. Schedule J base years intentionally use their actual Tax Rate Schedules, as the official instructions require; the three years derive from the return year. The result labels final historical table sources separately from the unqualified 2026 statutory-rate preview.
- Refreshed official 1040 and Schedule D instructions. Replaced the approximate special-gain stacking with the official QDCG lines 1–25 and Schedule D Tax Worksheet lines 1–47. Actual investment-income election amounts are supported by the pure worksheet contract. Low-income section 1250 and collectible gains use the applicable ordinary rates; capital losses do not erase actual qualified dividends. Every intermediate line is audited.
- Seven new source and integration tests were red before implementation. Independent expected outputs include every line of the 600000 mixed-gain worksheet (165177 tax), the published 69250–69300 single table row (10155), the foreign exclusion worksheet (6790), kiddie tax (412), and actual Schedule J base-year rates. Historical failures were corrected from source table rows and manually derived worksheet arithmetic; no thresholds or assertions were removed.
- Verification: 598 focused tests and 98 adjacent QDCG/Schedule J/metadata tests pass; root types and all 3459 spec references pass. Scoped lint reports zero errors with existing non-null/unused warnings. Diff and whitespace reviewed. Metadata is now 2025.21 and 2026.16-law-integration-draft; qualification gates remain closed.
- Limits are explicit: final 2026 Tax Table is unavailable; Schedule D lines 18/19 source gain/loss worksheets, current Schedule J gain allocation and actual Form 4952 election integration remain separate work. A complete tax worksheet does not establish those missing source amounts or independent review.

## Bounded remaining federal implementation matrix — 2026-10-25

This supersedes the initial scope checklist above. Implemented means the named
code path and synthetic/source tests exist; it does not mean independently
reviewed or filing qualified. The complete 2026 pack remains closed.

| Execution-brief family | Implemented evidence | Remaining authorized implementation or exact boundary |
| --- | --- | --- |
| Independent 2026 constants and year provenance | Immutable full-shape indexed data, official payroll/IRA/HSA sources; source helper 0b3d78e; rule metadata and 81 indexed tests | Final 2026 Tax Table and final physical forms are external source dependencies; 2026 tax remains a labeled statutory preview. |
| SALT and taxable refunds | Year-aware refund/source facts; 8a5e4c5 non-W2 withholding; 5a5c6b3 payment-year deduction; phase-down tests | Mixed-origin refund batches need separate actual prior-year workbooks; no inferred origin/property-tax facts. |
| Schedule 1-A | Explicit eligibility, SSN, occupation, FLSA, loan and exclusion facts; tip/overtime/senior/vehicle phase-down tests | Business-tip deduction needs source-level QBI coordination; unsupported refinance and source histories remain blocked. |
| CTC/ACTC | e8e767e payroll/reservation worksheets; b85af42 identity; bc26ffe actual possession MAGI | Central Schedule 3-A public-benefit limitation needs final applicable source/routing and exact taxpayer eligibility; no generic approval boolean substitutes for it. |
| Charity, high-income itemization and gambling | Category limits/carries, 0.5% floor, nonitemizer cash gifts, overall cap, 90% gambling rule, actual PMI qualification; ca323c5 crypto categories and 0433c87 actual mortgage balance/points/recovery worksheets | Automatic mixed/refinanced debt tracing beyond actual completed worksheets remains separate. Historical charitable category/floor transition, capital-gain election and actual Form8283 qualification remain separate. |
| Care/adoption | 724d942 adoption; 968fa7b actual credit ordering/refunds; 812fc61 and a413fd6 care Part III and validated Part II handoff; actual W2/C/F return integration below | Schedule E benefit deductions require actual partner/rental SE, QBI and passive-source coordination. Benefits-only PDF/source attachment is owned by the care agent; no qualification is inferred. |
| Education/529 | 2885753 actual Form8863 eligibility/support/limits; 83b9e8f claimed-vs-claimable and LLC TIN; eaaeb04 actual beneficiary/distribution allocation, 6b07529 final-credit coordination, 2f8abd7 per-expense loan sources; canonical student-loan integration below | Returned ESA/contribution-year and prohibited-transaction branches are owned by the education agent. Educator post-bond/529 reduction reconciliation and 2026 section67 itemized eligibility are the next federal slice. Actual positive loan/NOL coupling remains a separate source worksheet. |
| QBI and business income | 8ca3655 actual owner/trade deductions; c0871d3 separate-owner SE; 1a815e0 Schedule C other income; minimum active-business deduction; canonical Form461 and source classification below | Confirm allowable retirement/health-plan deduction before QBI attribution; business tips and special foreign/SSTB/wage/basis cases require their actual source worksheets. |
| PTC/APTC | ca8c1e5 core and 5e0822a integration; actual monthly/family/MAGI facts, 2026 cliff and uncapped repayment | Shared-policy allocation, alternative marriage, SE-health-insurance coordination and special lawful-presence worksheets explicitly reject until supported. |
| Energy/vehicle transition | 9639aa2/351c3d9 energy and 8d7731c/63f88fa vehicles; actual dates, transfers, source reports, tax limits and carry | Mixed business credit requires Form3800 integration; final 2026 forms/source qualification remain external. |
| Historical carry and income | 45bb211 Form8801; 2e3fa87 Form2555; 5604a87 Form8815; 6ef58a2 OID; a269a9f dated2210; 2b2c3f4 actual SSA PR/AS addbacks | IRA compensation/MAGI ordinary sources (c3fa9b4/fa37e8d) and regular investment-interest election (9e6d794) implemented; next: specialized IRA coordination, Schedule D special-gain source netting and Schedule J actual gain allocation. OID complex TIPS/pre-modern cases remain blocked. |
| Printed federal audits | d84d890 canonical6251; a6ebd97 estate deduction once; corrected1040/Schedule2/Schedule3 routes | W2G withholding verified at1040line25c; canonicalSchedule1/1040line8 and estate24k/25/26 completed below; actual6251 foreign/MFS/NOL/credit worksheets and remaining source-bound forms still unqualified. |

Other bounded unsupported branches found during source collection: rental
personal-use/280A carryovers and real-estate-professional treatment; retirement
special distribution/RMD/Roth basis source worksheets; qualified disaster loss
standard-deduction treatment; Schedule R actual credit-limit worksheet. They
must remain outside a qualified scenario until implemented and independently
reviewed. They are implementation gaps, not missing user authorization.

External evidence still required: independent tax review and independently
reviewed expected outputs; final year-specific forms and mappings; published
2027 first-quarter interest rate for 2026 Form2210 exposure extending into that
quarter. No missing source, reviewer or future rate has been invented. Parent
owns hosted/provider/staging evidence and selected-state qualification.


## 2026-10-25 — Actual possession exclusions in Social Security

- Refreshed Publication915 Worksheet1 line5. Consumed the actual Puerto Rico and American Samoa source contract from 0b29f28; missing amounts or source confirmation are rejected when supplied, and positive-benefit 2026 calculations require this source pair. Historical absent facts remain a legacy preview rather than an invented assertion of zero.
- Two regressions failed before the fix. The ordinary synthetic worksheet has10000 wages,20000 benefits and25000 actual exclusions: provisional income45000 produces13850 taxable benefits and23850 AGI. With4000 attributable to the actual prior year, the lump-sum method produces12150; the25000 aggregate replaces rather than duplicates the known exclusions. A contradictory smaller aggregate rejects.
-34 focused calculation/model tests pass; root types,3469 spec references and scoped lint/diff checks pass. Rule versions2025.22/2026.17 remain unqualified. Source confirmation establishes the exclusion amount already determined by the taxpayer; it does not implement or qualify a resident Form4563 return.
- Added to the bounded historical-source queue after facts audit: new 1099-G family-leave source box under Rev.Rul.2025-4 and actual unemployment repayment/contributory rules. Positive unsupported PFML/repayment paths remain gated by source collection until their calculation/routing is implemented.

## 2026-10-25 — Actual dependent-care benefits in the federal return

- Refreshed final Form2441 instructions lines12/24/26. Bound Part III to actual W2 Box10 and source owner, actual Schedule C/F owner/activity and already-deducted expense. Positive W2 benefits require matched source records; unknown Box10 remains unknown, with a strict2026 gate. Source IDs retain original array positions and no payer or owner is invented.
- The return calculates benefits before wages, business profit, self-employment tax and QBI. Additional taxable benefits enter1040line1e once. Schedule C14 and Schedule F15 add the actual allocated deduction and subtract actual already-deducted benefits. Independent source cases with0,2000or2500already recorded all produce the same2000allowed deduction and98000net profit from100000receipts. An amount above the actual reported expense rejects.
- Original validated Part III facts flow to Part II, whose net expense base is not reduced twice. The actual supported MFS living-apart exception works. Benefits-only results remain available in form2441Benefits without inventing a credit claim. Schedule E sources explicitly reject pending their actual SE/QBI/passive coordination.
- Spec preceded five new integration regressions and a failing physical-PDF regression. The Schedule C mapper now copies and reconciles audited line14; tampered audits reject. Rendered first page visually confirms2000at14/28 and98000at31 (`.local/upgrade-evidence/care-benefits-review/schedule-c.pdf`).
-224 focused and522 adjacent federal/PDF tests pass; root types and all3480 current spec references pass. Scoped lint has zero errors and16 existing non-null warnings; diff/whitespace reviewed. Care-agent omission regression now explicitly omits Box10 rather than relying on the shared complete synthetic fixture. Metadata2025.23/2026.18 remains unqualified and independently unreviewed. Commit reference: this entry's package commit.

## 2026-10-25 — Immutable99fc4c2 Tax Table regression reconciliation

- Parent's immutable full run exposed16 assigned historical expectations still using exact-dollar brackets or the old special-gain component semantics. Reconciled all16 against the already verified final2025 source rows, including single69250→10155,59250→7955,66250→9495,34250→3875 and MFJ23500→2353,51500→5706. Child worksheet2700uses271 and zero-parent2300uses231. Credit limits/carry amounts now follow those source taxes; all credit conservation and penalty assertions remain explicit.
- Corrected the complex section1250 assertion to compare total income tax. The actual2000gain moves from15percent to the applicable24percent ordinary rate, raising total tax180 (43741→43921), while the separately reported preferential component decreases300. Added exact totals and component assertions rather than weakening the old comparison.
-342 tests across all six assigned files pass. The late-payment penalty remains268 with the table-derived2285quarterly requirement. Parent owns the remaining state/PDF timeout diagnostics; facts owner handles workspace previews. This is a fixture/source reconciliation for99fc4c2, with no further production calculation or readiness change.

## 2026-10-25 — IRA compensation, excess contributions and source summary

- Refreshed official Publication590-A Worksheets1-2 and AppendixB2 (https://www.irs.gov/publications/p590a). Corrected the IRS rounding direction: round the remaining phaseout deduction upward to the next10, rather than rounding the reduction upward. Actual compensation and section501(c)(18) contributions cap allowable contributions; excess contributions remain separate from valid nondeductible basis. The200 minimum cannot exceed actual eligible contributions. A nonparticipant QSS is not treated as a current joint filer for the spouse-active rule.
- Three source-boundary tests failed before implementation. Independent examples include2025MAGI79001→7000 and80001→6300;2026age50MAGI86000→4300;2000compensation/7000contribution produces2000deduction and5000excess, rather than adding excess to Form8606basis. Strict2026 requires actual compensation/plan facts and applicable MFS living arrangement; historical missing sources remain explicitly unverified.
- The reference PDF copies unique reconciled worksheet audits, displays actual compensation or Unknown, and separates valid nondeductible contributions from excess. A contradictory result rejects. Rendered and inspected the one-page2000compensation/5000excess example at `.local/upgrade-evidence/ira-source-review/ira-deduction-worksheet-reference-filled.pdf`; no filing template or independent-review claim was added.
-150 focused core/Schedule1/PDF tests pass. Root types and scoped lint pass with three existing non-null warnings. Adjacent457-case run has453passes and four known parent Form4952 audit-label transitions, assigned to the following integration package; the single current spec mismatch is the parent-owned ScheduleA→4952canonical-line reference. Metadata2025.24/2026.19 remains unqualified. Full-return compensation and MAGI coordination is the next separate implementation, not claimed complete by this pure worksheet package.

## 2026-10-25 — Canonical IRA return income and compensation

- Four source-first integration regressions reproduced inconsistent Schedule1/result deductions, omitted Social Security and compensation, and unknown spouse contributions defaulting to zero. The return now computes IRA modified AGI once from all pre-bond income (including actual Treasury interest, farm income and other Schedule1 additions), actual non-IRA/non-student-loan adjustments and foreign/adoption addbacks. It computes AppendixB Social Security before IRA, then recomputes actual benefits using the allowed deduction. Schedule1 receives the same completed amount instead of recomputing from partial income.
- Added actual per-owner compensation after SE-tax/retirement adjustments, Roth and section501(c)(18) contributions, and source confirmation; omitted spouse contributions stay unknown. Joint lower-earner compensation subtracts the other spouse's actual traditional and Roth contributions. Actual dates of birth supply age; QSS cannot add a current-spouse contribution. Source-complete2026 and explicitly supplied current facts require the full source set. Historical incomplete sources remain unverified.
- Independent examples:79000wages+10000Treasury interest yields89000MAGI and no deduction;5000farm profit with printed SE half354 yields84646MAGI and3050deduction;118000joint wages+12000benefits yields128200IRA MAGI/7120deduction/121080AGI. At20000wages+20000benefits, IRA MAGI includes2500pre-deduction benefits, while actual taxable benefits after7000deduction are zero. Joint10000compensation less6000traditional/1000Roth supports only3000for the other spouse; the4000excess is not nondeductible basis.
-154 focused tests pass;450/454 broad federal tests pass, with only the four parent4952canonical-line transitions remaining for the next package. Root types,3499spec references and scoped lint pass (six existing non-null warnings). One printed Schedule1line20 exists and reconciles with the retained IRA result. SE retirement adjustments now reach Schedule1line16 consistently; Form8582 adds back the actual worksheet deduction.
- Explicit bounded limitations: IRA with NOL/passive losses, current IRA distributions or a lump-sum Social Security election rejects pending its specialized source coordination. Mixed traditional/Roth excess needs actual allocation. Excess contributions are separately exposed; their return/correction/remaining-excise facts and Form8606 basis persistence still require separate source treatment. Student-loan and remaining post-AGI interactions remain in the bounded matrix. Rule versions2025.25/2026.20 remain unqualified and independently unreviewed.

## 2026-10-25 — Actual investment-interest source and preferential election

- Refreshed official Schedule D/1040 instructions and K-1 Code B routing. Completed source-confirmed Form4952 amounts now retain the actual year and include partnership amounts once. Historical direct-only previews retain automatic interest/income aggregation; Box20B is informational until actual deductible expense classification. The final Form4952 line5 excludes nondeductible miscellaneous expenses, so source CodeB alone is not a deduction.
- Three red-first integration cases now pass. Electing10000qualified dividends into investment income leaves80000ordinary taxable income and12520published2025table tax. An8000election allocated4000to gains leaves6000dividends/6000gains preferential and produces7720tax from the published5920ordinary row plus1800preferential tax. The actual1040qualified-dividend amount remains unchanged.
- Foreign stacking uses the post-election ScheduleDline10 to compute capital-gain excess. With20000dividends,5000election,10000taxable income and80000excluded earnings, excess5000reduces worksheetline6to10000while actual electionline3stays5000; stacked14020less12520on excluded income yields1500tax. Current-year missing/wrong-year sources reject. ScheduleJ/Form8615 election combinations explicitly reject pending their separate source worksheets.
-532 focused tests pass, including the complete federal suite and adjacent FEI/4952/reference PDF tests. Root types and3512current spec references pass; scoped lint reports zero errors and202 existing non-null warnings. Diff and source formulas reviewed. The next separate package supplies actual AMT Form4952 rather than assuming regular-tax values also apply. Rule versions2025.26/2026.21 remain unqualified; the preceding IRA ledger's2026.20 was a documentation version label and the actual prior metadata still read2026.19, now advanced explicitly.

## 2026-10-25 — Separate AMT investment sources and actual Part III

- Official Form6251 instructions require a separate AMT4952 with its own current interest, prior AMT carryover, income, gains and expenses. Added actual form4952Amt and confirmed amtCapitalGains source contracts; no defaults turn missing sources into zero. The AMT election reconciles to min(regular4952line4g,AMT4b+4e). 2026regular4952 requires this separate worksheet; actual preferential sources require completed AMT basis/gain values.
- New signed2c is regular deduction minus AMT deduction when itemizing. Independent5000regular/8000AMT and5000regular/2000AMT examples produce−3000/+3000 and77000/83000AMTI. The same source under the standard deduction creates no itemized adjustment. A different year, missing source or contradictory election rejects.
- Added a pure Decimal implementation of all29PartIII lines12–40, using AMT source13/14/15 and distinct regular source20/27. Actual election10000from20000dividends leaves10000preferential AMT income:71900AMTbase gives61900ordinary×26% plus1500, totaling17594. The independent special-rate line fixture produces47400; every printed intermediate is asserted. Historical absent AMT source worksheets remain unverified compatibility and do not emit fabricated PartIII audits.
- Five new calculation/integration regressions were red before implementation; a separate review-PDF tampering test failed before reconciliation.616focused/adjacent tests now pass; types,3557current spec references and scoped lint pass (six existing warnings). Rendered the three-page review at `.local/upgrade-evidence/amt-investment-review/form6251.pdf` and inspected actual PartIII fields; signed2c prints(3000), with actual17564line40in the second scenario. Unique complete PartIII audits must reconcile40to7 and12to6.
- This package implements actual supplied source arithmetic, not the creation of every AMT basis worksheet. Foreign AMT stacking/FTC, MFS additional AMTI, AMT NOL, ScheduleE interest allocation and other missing-source branches remain bounded implementation work. Filing and independent-review gates remain closed. Metadata2025.27/2026.22 records this source slice; package commit supplies the exact reference.

## 2026-10-25 — Actual energy filing status in return credit limits

- Forwarded actual filing status to both preliminary improvement and final clean-energy computations, preserving the source-qualified separate-main-home rule for joint filers. The source regression failed before the two call sites were corrected. Two actual spouse homes with10000qualified heat-pump cost each retain separate2000limits and a4000allowed improvement credit.
-29 focused tests pass, including the actual-home source suite and credit integration. Root types and all3561current spec references pass; the narrow diff was reviewed. This is a caller handoff for30fc3dd, with no filing or independent-review gate change.

## 2026-10-25 — Immutableff761dd IRA boundary expectations

- Refreshed Publication590-A Worksheet1-2 lines4/6/8 and Table1-3. Seven historical assertions still encoded the replaced reduction-rounding direction, a current-spouse phaseout for QSS nonparticipants, or excess contributions as valid basis. Corrected their independent source expectations:9999×0.80=7999.20 rounds to8000;19999×0.35=6999.65 and9999×0.70=6999.30 round to7000. QSS nonparticipants have no Table1-3 income phaseout.10000contributed with7000allowable yields3000excess and0nondeductible basis after7000deduction.
-43 focused tests and all3570current spec references pass. Existing failing assertions were retained as exact source boundaries, with explicit excess-contribution conservation added. No calculation, threshold or readiness gate was changed.

## 2026-10-25 — Canonical Schedule1 and1040 source totals

- Refreshed final Schedule1, beneficiary K1 instructions and Pub925. ScheduleD capital gains remain on1040line7; Schedule1line10 now includes only its own1–7/9. Finalization retains actual C/F/E, digital8v, taxable529/Coverdell8z, NOL8a and source components once. Estate finalBox11A is positive24k and reaches25/26. Housing24j reaches25 while its Pub970/590-A MAGI addback is preserved.
- The final source result is emitted once after passive/NOL worksheets. Result.otherIncome is now canonical1040line8, including business/farm/rental amounts. Suspended rental losses already excluded fromAGI now also correct totalIncome; final1040line9 minus10 equals11. Existing declared NOL/passive source limitations are unchanged.
- Five source regressions were red before fixes. Independent combined example:10000business+2000farm+3000royalties+400misc+200education+100digital=15700Schedule1;5000capitalgain stays separate.85000wages give105700income;700estate deduction joins848SE half for1548adjustments. At150000wages the10000rental loss is suspended, leaving150000income andAGI.85000wages+1000misc−5000NOL gives81000once. Housing5000at95000MAGI preserves833student-loan deduction.
- The review mapper copies unique canonical audits and reconciles them with retained results and1040; two tampered-audit boundaries reject. Rendered three-page source review at `.local/upgrade-evidence/schedule1-review/schedule1.pdf`; pages1/2 visually checked and allthreepages retain the review notice. Printed8v100/8z600/9=700/10=15700 and24k700/25=700/26=1548 match sources. Unclassified manual24totals are disclosed, not assigned a made-up category.
-887focused/adjacent tests, root types and3588spec references pass. Scoped lint has zeroerrors/sixexisting non-null warnings. Reviewed diff and source fixtures; two older rental assertions now preserve the allowed25000loss/2000carry rather than contradictingAGI. Metadata2025.28/2026.23 remains unqualified.
- Remaining classification branches in this slice: unclassified1099-MISC rents and K1otherportfolio components, section280Frecapture placement back to the originating business schedule, and crypto lending characterization. Their historical preview values remain explicitly unqualified; this finalizer does not invent their underlying tax facts or independent review.

## 2026-10-25 — Individual HSA excess forms and absorbed deduction

- Refreshed final i5329 joint-return instructions and PartVII42–49, plus i8889 excess/prior-contribution instructions. Added actual form5329HsaByOwner current/prior-year sources, prior line48/49, individual year-end value and correction facts. Omitted values remain unknown. Each owner uses only their8889 room, distributions and corrections; source-conflicting aggregate amounts reject.2026material exposure cannot silently disappear when the legacy aggregate form is absent.
- Separate600/700excess boundaries use indexed2026/2025limits. The independent2025two-owner example has700excess each but100/10000account values, producing6and42tax rather than an aggregate84. Primary1000prior excess cannot be absorbed by spouse3300unused room. Actual prior49zero does not create a line42carry. Each line48carry persists separately, with an aggregate display total only.
- Implemented the previously omitted same-owner prior-excess deduction beforeAGI:2000current contributions plus2300absorbed prior excess yields4300Form8889line13 and80700AGI on85000wages. Ordinary3600.10deductions retain cents; exact Decimal source amounts are retained and the final excise tax rounds to dollars.700confirmed amended-return relief affects only that owner;25earnings reachesSchedule1once.700employer excess with200already in actualW2wages adds500otherincome, even when excess is returned. Unknown employer-income reconciliation rejects.
- Refreshed final2025 i1099-SA page2 Boxes1/2 (https://www.irs.gov/pub/irs-prior/i1099sa--2025.pdf): gross Box1 includes Box2 earnings. A725gross/25earnings timely correction excludes725on8889line14b while reducing5329excess by700principal;25remains income. An omitted worksheet14a now receives actual source gross instead of a manufactured zero. Source-confirmed corrections require known Box2 and actual owner; contradictory gross exclusions reject. The historical900gross/30earnings regression now retains330excess from1200and19.80unrounded compatibility tax.
- Six source integration regressions, the physical mapper regression, a cents-review regression and source correction/reconciliation boundaries failed before their respective fixes.921focused/adjacent tests now pass, including two companion Form8889line21expectation corrections owned by the facts agent. Root types,3614current spec references and scoped lint pass (zero errors/eight existing warnings). Reviewed the scoped diff. The facts UI binding is a separate commit.
- Separate three-page review forms carry actual individual name/SSN and audited42–49; source/audit tampering rejects. The packet retains a required zero-tax form when prior excess is fully absorbed. Rendered `.local/upgrade-evidence/hsa-owner-review/primary.pdf` and spouse.pdf; primaryPartVIIvisually inspected, and all six pages preserve exactly one review notice. No final2026template or filing qualification is claimed.
- Bounded remaining source cases: corrections exceeding current-owner excess require actual origin-year attribution; qualified funding beyond the annual limit requires IRA treatment; positive non-HSA joint5329parts require their own owner allocation and are explicitly rejected when combined with this actual-source path. Mixed1099-SA disability/ordinary distributions require actual event-level medical and taxable-exception allocation; the current gross automatic exception cannot establish that allocation. These are internal source/integration work, not missing approval. Metadata2025.29/2026.24 remains independently unreviewed and unqualified.

## 2026-10-25 — Crypto property enters charitable limits before deduction

- Refreshed official digital-asset FAQ78/79 and Publication526 current-year Worksheet2. Crypto tentative property values now enter the combined charitable categories before ScheduleA caps/floor; the old post-calculation addition is removed. Short-term and ordinary property use min(FMV,basis); known unqualified recipients receive zero. A calendar-year anniversary remains short term even across a leap year. Long-term loss property has no avoided gain or capital-gain category; second-category capital property receives the required basis reduction and retains its20%category.
-2026 and source-confirmed gifts require actual recipient category, capital-asset status, complete ownership/no-benefit facts and substantiation/appraisal review. Missing qualification is no longer defaulttrue. Historical incomplete facts remain an explicitly unverified preview. Donation transfer costs are not added to value. Actual similar-property appraisal requirement is retained, and an individual value above5000cannot claim no appraisal requirement.
- Four source integration tests were red before implementation. At100000AGI,40000public capital crypto yields29500deduction and10500category carry after the2026floor; direct20000pluscrypto20000shares the same limit. A40000FMV/25000basis gift to a second-category foundation yields19500deduction and5500carry. A short-term12000basis/8000FMV gift uses8000. Crypto never supplies the nonitemizer cash deduction.
- Final2025 current-year categories use published Worksheet2 rather than the2026floor or cash adjustment. The official50000AGI example with2000publiccash/28000publiccapital/5000privatecash yields17000deduction,13000capital carry and5000private carry. The return-level100000AGI/30000cash/40000crypto example yields50000deduction and20000carry.
-759 focused and adjacent tests pass, including the full federal suite; root types,3635current spec references and scoped diff review pass; scoped lint has zero errors and five existing warnings. Source-preserving metadata2025.30/2026.25 stays unqualified. This implements current contributions; historical category carry coordination, public-property50% election, special bargain/partial gifts and Form8283 source pages remain separate bounded work. HSA package reference:104bca4; the actual contribution UI binding ised5cae9.


## 2026-10-25 — Form461 employee exclusion, actual classifications and attachment

- Immutable10be1de exposed an old otherIncome assertion, but refreshed final2025 Form461 and instructions established a substantive error: employee wages and employee deductions are excluded under §461(l), and official lines1/7 are reserved. Replaced invented printed identities with actual lines2–6/8–16. Capital losses are removed in PartII; business capital gains are capped by the lesser of business capital gain net income and total capital gain net income. Actual separate business adjustments enter8; statutory164(f)(2) supports SE-tax business attribution. OBBBA permanence and indexed2026 threshold256000/512000 are recorded in the spec.
- Five initial source tests failed before implementation. At50000wages and550000ScheduleC loss, EBL is237000; Schedule1line10 is−313000 and1040income/AGI−263000. Wages stay on1040line1z and cannot absorb business loss. The full official-line example independently yields−383000business net, signed16−70000 and positive8p70000. Original historical source amounts remain intact; stale wage-offset oracles were corrected with explicit arithmetic.
- Added optional source worksheet with actual year/reference, capital and noncapital classifications and completed prior at-risk/passive limitations. Missing source remains unknown; other receipts/deductions must reconcile to reported amounts. Material supplemental-loss cases require actual post-passive classification; source-confirmed interactions use the actual completed8582MAGI worksheet and reconcile final allowedE. The separate passive regression was red first:550000C loss plus25000allowed business rental loss produces262000addback and−313000netSchedule1. This supports actual completed worksheets; automatic source classification and coupled upstream worksheets remain separate internal work.
- Attachment requirement now includes any PartI line loss above half the single-filer threshold, even on a joint return with no addback. The source reference copies unique official audited values and rejects missing/duplicate/tampered lines. Three new PDF checks were red first. A200000line loss retains its required reference attachment with zeroaddback. Both rendered pages at `.local/upgrade-evidence/form461-review/` were visually inspected and carry the reference-only notice; no filing qualification is inferred.
-608 focused/adjacent tests across8files pass, including full federal, canonicalSchedule1, workspace preview and saved-storage tests. Root types pass. All3665working-tree spec references resolve; the isolated exact staged package also passes608tests, root types and3659committed spec references without adjacent educator edits. Scoped lint has zero errors with existing non-null warnings. Restored the established AGI audit formula presentation. Parent independent code review identified an invalid net-sign bound: a net−100000ScheduleE can contain+100000business and−200000nonbusiness, or−300000business and+200000nonbusiness. A red-first regression now requires actual noncapital business net and reconciles the signed source components, accepting both cases and rejecting a one-dollar discrepancy. Parent re-review found no remaining actionable issues in this slice and independently ran13source/PDF tests successfully. This is agent code review, not independent professional tax qualification. Scoped diff reviewed; metadata2025.31/2026.26 remains unqualified. Crypto prerequisite isca323c5; this package does not alter its law or inputs.


## 2026-10-25 — Preserve unknown qualified-stock facts

- Remote CI054cd59 exposed a regression after the common crypto category integration: missing qualified-appreciated-stock status was treated as false for a2026 private-foundation gift. Refreshed Pub526 capital-gain-property exceptions and restored unknown rejection while retaining knownfalse basis reduction. At100000AGI,2000FMV/1000basis yields1500deduction when qualified and500when explicitly unqualified, after the500floor. Unknown basis on the false branch also rejects.
- Existing failing assertion reproduced before implementation, spec updated first, and explicit true/false/unknown boundaries retained.142focused tests, root types and3676working-tree spec refs pass; lint has zero errors/one existing warning. Narrow diff reviewed. Rule2026.27 remains incomplete/unqualified. Form461 predecessor9d814f9 contains the independent agent-review correction.


## 2026-10-25 — Actual education distribution return handoff

- Integrated eaaeb04 source calculator with actual return year and actual credit-student inputs; an explicit empty list means no credit is claimed.2026cannot silently use the legacy2025 fallback. Own recipient earnings enter canonical Schedule1once; other recipients remain in source output without entering this return's income or tax. A spouse recipient requires an actual joint-return spouse.
- Added per-student eligible LLC expenses to the retained8863result and validate the linked actual student after phaseout and tax limits. A credit allocation that creates taxable529earnings cannot rely on an absent/ineligible/zero-allowed credit or another student's positive credit. No automatic expense reallocation is performed. The published5300distribution/950earnings/1200AQEE example yields735taxable,717credit-related exception and2additional tax; another recipient's200earnings remains outside this return. The2026K12case uses20000qualified expenses.
- Four initial source-integration regressions and the separate duplicate-PartII regression were red before fixes. Draft2026constants are injected only inside isolated tests; production readiness is unchanged.733focused/adjacent tests, root types,3679working-tree spec refs and diff review pass; lint has zero errors/four existing warnings. Unknown actual loan coordination cannot silently double-deduct tax-free529earnings: a positive legacy student-loan claim with a calculated exclusion is temporarily rejected pending the actual loan-source helper now owned by the facts agent. Positive legacy aggregate5329PartII with verified recipient sources likewise requires reconciliation rather than being added twice; actual per-recipient PDF integration is owned by the529agent. These are internal integration items, not external approval blockers.
- Rule versions2025.32/2026.28remain unqualified. Prior tax fixes: Form4619d814f9 and unknown private-stock status758b024.

## 2026-10-25 — Actual mortgage debt, interest, points and recovery sources

- Refreshed final Publication 936 Table 1, average-balance methods, points and recovery instructions (https://www.irs.gov/publications/p936). Replaced the verified path's raw Form 1098 Box 2 proxy with actual highest/lender/first-last/monthly/interest-rate balance sources or a completed mixed-category worksheet. December 15, 2017 remains older acquisition debt; genuine pre-October 14, 1987 debt retains the separate uncapped category. The combined worksheet applies the printed three-decimal ratio to both qualified interest and allowed points.
- Source records bind actual year, payer shares, lender, qualification, current refunds, points and all debt sources. Unknown 2026 facts cannot become qualification. Current-purchase point tests, the published 4,800/240-month/3-payment example (60 deductible points), ratable prior points and actual completed amortization sources are supported. Historical aggregate calculations remain explicitly unverified. Known ineligible ownership produces zero; omitted qualification rejects.
- Parent agent review identified an understated interest-rate numerator that could unlock a larger deduction. The regression was red before correction: 100 numerator cannot coexist with 40,000 actual paid interest. Actual current-year interest prepaid in an earlier year is attributed separately to each payer; only this return's share enters its deduction. Independent 45,000/4% gives 1,125,000 average debt, and 38,000 own interest times .667 gives 25,346. Excess other-person refunds reject. Printed Table 1 line 13 rounds before multiplication: 1,000.51 at a .5 ratio yields 501.
- Current-year refunds reduce current interest. Actual prior-year Box 4 recoveries instead use the supplied origin-year tax-benefit worksheet and reach Schedule 1 line 8z once. A 2,000 refund with 600 actual taxable recovery raises 85,000 income to 85,600; an already-reported 600 must bind to an actual 1099-MISC Box 3 source and does not add income twice. Unknown or overallocated recovery sources reject.
- Canonical Schedule A lines 8a/8b/8c/8e/10 now separate reported interest/current points, unreported interest and amortized/unreported points. The reference mapper copies unique reconciled audits instead of adding raw Box 6 again, and uses the actual nested lender-description field. A 1.1 million combined debt example yields 29,326/1,364/273 on 8a/8b/8c and 30,963 on 8e. Tampered source/audit cases reject. Rendered and visually inspected the one-page review at `.local/upgrade-evidence/mortgage-review/schedule-a.pdf`; lender details and all amounts fit, and the review-only notice remains present.
- All 693 focused/adjacent tests across eight files pass, including the complete federal suite. Root types and production lint pass (zero errors, five existing non-null warnings); new tests no longer introduce non-null assertions. Relevant red/green logs include `mortgage-rate-source-red.log`, `mortgage-rate-source-green.log`, `mortgage-final-adjacent.log`, `mortgage-types.log` and `mortgage-production-lint.log` under `.local/upgrade-evidence/`. Rule versions 2025.33/2026.29 remain unqualified and independently unreviewed. The isolated staged tree 9df0d03 passes the same 693 tests, root types and all 3,703 committed spec references. Parent independent bounded re-review found no remaining actionable issue and ran 21 adjacent source/PDF tests successfully; this is agent code review, not professional tax qualification.
- Bounded remaining implementation: guided binding of its already-collected ordinary mortgage facts (facts owner), automatic mixed/refinanced debt tracing beyond an actual completed category worksheet, and specialized mortgage-credit/assistance/prepaid allocations outside the represented methods. These source branches remain separate internal work, not a claim that professional review or final-form qualification has occurred. Preceding 529 integration: 6b07529; actual student-loan helper now committed separately as d162f6c and is next for canonical return integration.

## 2026-10-25 — Canonical actual student-loan deduction

- Refreshed Publication 970 chapter 4 Worksheet 4-1 and its no-double-benefit rule (https://www.irs.gov/publications/p970). Integrated d162f6c actual borrower/loan sources with canonical full income after taxable Social Security, savings-bond exclusion and allowed passive losses. Net Form2555 exclusion, housing deduction and actual Puerto Rico/American Samoa exclusions enter MAGI. Actual 529 per-expense tax-free earnings reduce only the linked interest claim; basis-funded payments remain eligible. Omitted facts cannot become favorable eligibility, and positive 2026 raw claims require actual sources.
- Five initial integration regressions were red before implementation. Actual lender interest 1,200.15 gives a 1,200 deduction and 48,800 AGI on 50,000 wages. At 85,000 wages plus 8,000 Treasury interest and 1,000 actual possession exclusion, MAGI is 94,000 and the deduction is 1,000. A 30,000 rental loss with 120,000 wages allows only 15,000, leaving 105,000 MAGI and no deduction. A 1,000 interest payment funded by a 529 distribution with 200 excluded earnings retains an 800 deduction.
- Added independent ordering boundaries: 80,000 wages plus 8,500 taxable Social Security gives 88,500 MAGI, a rounded 1,917 deduction and 86,583 AGI. The existing benefit calculation excludes loan interest; a separately reproduced audit regression now retains the final 1,917 as the excluded-source metadata without changing benefits. At 97,000 wages plus 4,000 bond interest, Form8815 MAGI is 101,000 and its exclusion 3,600; loan MAGI is 97,400, the deduction 433 and AGI 96,967. The final Schedule1 and Form1040 adjustments reconcile once.
- All 720 focused and adjacent tests across 11 files pass, including the complete federal suite, historical student-loan edges, source helpers and reference PDF tests. Root types and 3,731 working-tree spec references pass; scoped lint has zero errors and four existing non-null warnings. Logs are `.local/upgrade-evidence/student-loan-audit-red.log`, `student-loan-return-final-adjacent.log`, `student-loan-return-final-types.log`, `student-loan-return-final-spec.log` and `student-loan-return-final-lint.log`. Parent independently reviewed the bounded ordering/audit changes and ran 15 core/helper/DOM tests with no actionable findings; this is agent review, not professional tax qualification.
- Positive actual source-qualified loan claims with prior NOL remain explicitly blocked until the coupled NOL/deduction computation is implemented; no pre-NOL MAGI is called final. Historical source-incomplete previews remain unqualified. Exact staged tree 3e63075 passes the same 720 tests, root types and all 3,715 committed spec references. Rule versions 2025.34/2026.30 retain the existing incomplete/independent-review/filing gates. The guided source handoff is a separate facts-owner package, with its actual-source regression already passing against this core.
