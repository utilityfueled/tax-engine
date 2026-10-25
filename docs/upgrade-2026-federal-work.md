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
