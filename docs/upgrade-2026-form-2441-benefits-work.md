# Form 2441 dependent-care benefits

Sources checked October 25, 2026. This work calculates Part III from actual
source facts. It does not establish independent tax approval or qualify a
2026 filing form.

- [x] Write the line-by-line spec before implementation.
- [x] Record 15 failing source/formula tests before the calculation, then pass
  them. Logs: `.local/upgrade-evidence/form-2441-benefits-red.log` and
  `form-2441-benefits-focused.log`.
- [x] Preserve unknown facts in a dedicated `dependentCareBenefits` schema;
  neither a missing amount nor a missing source array becomes zero.
- [x] Use Decimal and audit printed lines 12–31, retaining exact source cents.
  Apply the 2025 $5,000/$2,500 and 2026 $7,500/$3,750 caps together with the
  actual plan limit. A statutory increase does not prove a plan was amended.
- [x] Keep amounts already included in W-2 wages out of additional taxable
  benefits, and keep business deductions attached to actual source IDs,
  owners and schedules. Reject duplicate sources and mismatched allocations.
- [x] Exercise IRS examples, signed separate earned income, the surviving
  spouse election, actual MFS living-apart facts, grace-period use,
  forfeiture/carryforward, known ineligibility and benefits-only returns.
- [x] Check source rounding before assigning an amount to employee wages.
  The additional regression failed first in
  `form-2441-benefits-rounding-red.log`.
- [x] Final scoped validation: 207 tests in seven care/credit/PDF files pass
  (`form-2441-benefits-final.log`), along with root typecheck, scoped ESLint,
  diff review and all 3,452 spec references. Core commit: `812fc61`.
- [x] Add the validated Part II handoff after four recorded failing tests
  (`form-2441-benefits-handoff-red.log`). The combined eight-file suite passes
  211 tests. The same source facts are validated again for the requested year
  and filing status, then line 31 becomes line 3. Legacy benefit amounts,
  qualifying-person count and net paid expenses must reconcile; gross paid
  expenses and separate earned-income worksheets remain visible. Actual prior
  Worksheet A credit survives a zero current-year expense base. Actual MFS
  living-apart facts can establish the considered-unmarried path.
  Handoff commit: `a413fd6`.
- [x] Add actual W-2 box 10 and per-business `alreadyDeducted` source values
  after a source-preservation regression failed. An omitted box remains
  unknown; a business source must state the existing deduction, including
  zero. Federal integration applies allocated line 24 less that actual prior
  deduction, retaining an addback when books over-deducted the benefits.
  Optional provider records and deemed-income status support benefits-only
  Part I without manufacturing a Part II credit claim.
- [ ] Federal source binding, line 1e, activity deductions, QBI and credit
  coordination: federal agent owns orchestration after the stable core commit.
- [ ] Guided actual-source collection, source-to-document/activity links and
  Part III review PDF mapping, with a benefits-only attachment path.
- [ ] Final 2026 forms and independent qualification evidence.

## Sources and decisions

The [final 2025 instructions](https://www.irs.gov/instructions/i2441) and
[physical form](https://www.irs.gov/pub/irs-pdf/f2441.pdf) define Part III.
[Publication 503](https://www.irs.gov/publications/p503) explains expense
coordination and the surviving-spouse earned-income election.
[IRC 129](https://uscode.house.gov/us/usc/119-118/t26/s129/) contains the
amended exclusion caps, effective after 2025 under Public Law 119-21 section
70404. The [2026 draft instructions](https://www.irs.gov/pub/irs-dft/i2441--dft.pdf)
corroborate the increased cap; their draft status is retained.

The tests independently derive $4,950 excluded/$50 forfeited and $900
excluded/$1,100 taxable from the IRS examples. Another example uses $1,000
excluded benefits and $2,900 other paid expenses: the $3,000 expense cap
becomes $2,000, so the credit expense base is $2,000. Subtracting the benefits
again from the already-net paid expenses would be wrong.

Part III earned income is a signed, completed worksheet amount for each
person. It excludes the line 12 benefits and reflects applicable foreign
exclusions, self-employment adjustments, student/disability monthly rules
and actual combat-pay elections. This package does not manufacture those
facts from combined household wages. Separate Part II worksheet amounts
remain separate inputs.

Employee forfeitures and next-year carryforward must have been included in
line 12. Self-employed sources instead identify benefits actually received
and actual prior grace-period amounts used. The calculator does not invent
a self-employed salary set-aside or an unused forfeiture.

Every amount is aggregated with cents before its physical-line rounding.
When business and employee source groupings produce a different rounded
line 23 from the actual net employee sources, calculation stops with a
source-rounding error. For example, business-only $2,500.25 current benefits
and $0.25 prior carryover would round lines 12/13 to $2,500/$0 but line 22
to $2,501. Assigning the difference to an employee would invent source
attribution. These uncommon combinations need a supported, consistently
rounded source/form allocation; no owner is silently adjusted.

## Integration contract

`calculateForm2441Benefits({ taxYear, filingStatus, facts })` accepts the
dedicated nested source object. All three source/worksheet/expense
confirmations must be true, while known exclusion ineligibility computes
zero allowed benefits. Employee, business and deduction arrays must be
explicit, including actual empty arrays. MFJ requires actual spouse-death
status and, if applicable, the surviving-spouse election. MFS requires
all three living-apart facts before applying the appropriate income limit.

The result supplies additional taxable employee benefits for 1040 line 1e,
deductible benefits with explicit activity allocations, excluded benefits,
line 28 and line 31, and official Part III audit lines. The output named
`sourceFactsVerified` means the complete confirmed contract passed local
validation; it is not an independent review attestation. Source IDs and
owners must still match real W-2/benefit statements and activities in the
orchestrator. Deductions already included in business expenses must not be
deducted again.

`calculateForm2441` accepts `dependentCareBenefits` with the same nested
facts. Its optional `benefits` result retains the recalculated Part III
result. Its own `lines` remain Part II plus gross-expense source evidence;
federal orchestration should merge the earlier Part III result's lines once.
The prior `excludedDependentCareBenefits` alias may be omitted on this
verified source path, but a supplied alias must equal actual line 28.

Business deductions belong on the applicable Schedule C, E or F line,
including the correct QBI and self-employment consequences. Benefits-only
returns must preserve Part III even when no credit can be claimed. The
Part II handoff must use the validated line 31 without subtracting benefits
a second time, while retaining gross expense evidence and the independently
completed prior-year Worksheet A credit.
