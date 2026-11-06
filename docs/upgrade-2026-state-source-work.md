# State source integration

## Ohio original issue discount — 2026-10-25

Sources refreshed from the final 2025
[Ohio IT1040 booklet](https://dam.assets.ohio.gov/image/upload/v1767095693/tax.ohio.gov/forms/ohio_individual/individual/2025/it1040-booklet.pdf),
Schedule of Adjustments line26 and IT1040 line14, and the continuous-use
[IRS1099-OID](https://www.irs.gov/pub/irs-pdf/f1099oid.pdf), January2024
boxes12–14. Actual reconciled Treasury OID/coupon interest is deducted once;
market discount remains taxable. Municipal OID requires an explicit non-Ohio
issuer allocation, including actual zero. Unverified legacy classification
cannot establish an Ohio source exemption.

Actual Ohio withholding rows now reach the calculation, adapter and reference
PDF; other-state rows are excluded. Decimal aggregation preserves cents and
amounts above Number's exact integer range. Invalid amounts and duplicate rows
reject. The three initial source regressions failed before implementation.
All 132 focused state/PDF checks pass, followed by 12 PDF checks after adding
the OID source to the existing packet assertion. Root types, all 3,448 current
spec references and scoped lint pass (zero errors, fifteen non-null warnings).
The generated reference summary was rendered and inspected with its actual
10.11 source and total. No filing qualification is implied.

Evidence under `.local/upgrade-evidence/`: `oh-oid-red.log`, `oh-oid-green.log`,
`oh-oid-pdf-final.log`, `oh-oid-types.log`, `oh-oid-spec.log`, `oh-oid-lint.log`,
`oh-oid-pdf/` and `oh-oid-withholding-review.png`.

Remaining: Ohio deductions must use only amounts actually included in federal
AGI, including bond education exclusions and taxable refunds. Care-credit
forwarding must use actual printed line9c. PA OID requires its distinct premium
and exemption reconciliation, and rental records must apply actual ownership
once before owner-separated loss limits. State launch demand, final2026 forms
and independent human review remain external prerequisites.

## Ohio federal inclusion limits — 2026-10-25

The same final booklet's Schedule of Adjustments lines26/28 limit deductions
to income included in federal AGI, and the care worksheet on page45 uses
Form2441 line9c. The adapter now subtracts actual prior-reported bond interest
and the education exclusion before taking the Treasury deduction, uses the
calculated taxable refund, and forwards the unique actual care audit entry.
Missing, duplicate, nonfinite or negative care audit values reject; an explicit
reconciled override, including zero, is preserved.

All three new regression cases failed before implementation. All 128 focused
state/packet/PDF checks now pass, root types pass and lint has zero errors
(113 existing non-null warnings in the large adapter fixture file). Two legacy
fixtures now supply actual synthetic federal worksheet facts: the refund
expectation remains1,000, and the incorrect care expense expectation is corrected
from3,000 to the official line9c credit600. Tests also cover partial/zero taxable
refunds, a fully excluded savings bond, actual prior-year care credit and audit
failure paths. Evidence: `oh-inclusions-{red,green,types,lint,spec}.log` under
`.local/upgrade-evidence/`. This remains local synthetic evidence.

## Pennsylvania rental ownership — 2026-10-25

The final [2025 PA Schedule E instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40e.pdf),
Section II line a and line 25, require actual ownership and separately computed
spouse income/loss. Whole-property rents and expenses now receive their actual
ownership fraction once. The taxpayer's loss no longer offsets a separately
owned spouse property merely because the old adapter grouped all direct rents
as joint. The existing short-rental business path also receives actual owner
and share before Class 4 loss limits.

All three new tests failed first. The initial 290-test package run passed all
289 surrounding assertions and exposed a test setup that exercised the schema
instead of the intended nonfinite calculation guard. The corrected three-case
source run passes; root types and scoped lint pass. Historical unconfirmed
preview assumptions remain explicitly unqualified; confirmed joint records
require separate supported allocations. Exact sub-cent shares and amounts over
Number's exact range are covered without changing monetary assertions.

Evidence: `pa-rental-{red,green,types,lint,spec}.log` and
`pa-rental-source-final.log` under `.local/upgrade-evidence/`.
Remaining software work includes actual PA rental/business classification:
annual rental days cannot establish average customer stay for a year-round
property. That is separate from this ownership correction. Personal-use
allocation, PA depreciation differences, joint allocation records and complete
state-specific source qualification remain bounded gaps.

## Pennsylvania OID source reconciliation — 2026-10-25

Refreshed the official [PA PIT Guide interest chapter](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/interest)
and [final 2025 PA Schedule A](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40a.pdf).
The state adapter now includes verified federal OID and actual PA withholding
once. A source-linked PA worksheet identifies issuer treatment, stripped-bond
allocation and the actual PA premium method. Federal coupon premium reductions
are tracked separately from excess premium deductions; actual premium already
netted on the statement is an explicit additional source fact. Federal premiums
are added back before applying the PA amount. Current market discount stays
taxable, including for direct obligations. Exempt amounts reach Schedule SP.

Missing, duplicate, unmatched or contradictory worksheets reject; zero remains
zero. Same-account forfeited interest cannot consume another source's income.
An excess forfeiture requires a disposition worksheet and remains unsupported
in this bounded path. The guided state worksheet UI, owner-separated Schedule A
filing output, final 2026 forms and independent human review remain unqualified.
No exemption is inferred merely from a federal Treasury label.

The first run reproduced three missing source behaviors and caught one test
accessor error. Initial integration exposed older fixtures with absent OID arrays;
the historical no-document path is preserved. Final verification passes all
314 focused federal/state/PDF tests, root types, all 3,469 spec references and
scoped lint with no warnings/errors. The diff was reviewed. Evidence lives in
`.local/upgrade-evidence/pa-oid-{red,green,types,spec,lint}.log`. These are local
synthetic checks, not final-form or staging qualification.

## Pennsylvania actual rental classification — 2026-10-25

The official PA rental-income guide's commercial-enterprise test uses actual
customer-use periods and activity facts. A year-round seven-day booking activity
now reaches Class 4; annual occupancy no longer substitutes for customer use in
confirmed sources. The 30-day boundary, public offering, continuity, business
hours/services/operating expenses, real-estate sales/dealer facts and related
party restriction are explicit. An activity without profit intent needs its
separate deduction rules. Source-confirmed/current-year unknowns reject. Legacy
unconfirmed previews retain historical amounts with an explicit unverified
audit; they do not establish current support. Ownership is applied once before
the separate spouse loss limits.

The PA interview collects these facts without defaults and preserves the actual
source reference. Edits clear classification and source confirmation. Existing
profit-intent/services facts feed the state classifier; separate unsupported
federal rental worksheets remain gated. No hotel occupancy-tax filing or local
license registration is added.

Both new calculation cases and the new DOM interaction failed first. Final
checks pass 292 focused state/source/DOM/PDF tests and 381 adjacent guided tests;
root and web typechecks pass. Scoped lint has zero errors and six existing
non-null warnings in the shared bridge. The diff was reviewed. Current global
spec validation resolves this package but initially sees the concurrently
unfinished care-benefits DOM test; that is separate from these passing checks.
Evidence: `.local/upgrade-evidence/pa-rental-class-{red,ui-red,green,guided,types,web-types,lint,spec}.log`.

Remaining: PA-specific depreciation, personal-use and joint owner allocations,
OID guided worksheet controls and separate-owner final filing output still need
implementation/qualification. State demand, final 2026 forms and independent
human review remain external requirements.

### Ohio care audit fixture correction

`tests/engine/state/oh-engine.test.ts` now obtains the actual Form2441 audit from
its calculation rather than constructing a result with no lines and a mismatched
20% rate. At2025 AGI$30,000, $2,000 expense x27% gives line9c$540; the supplied
$400 federal tax-liability limit gives line11$400. Ohio retains25% of line11=$100
and total credits$120. Seven focused Ohio and self-employed-health PDF tests
pass; the latter's prior full-run timeout did not recur and no timeout changed.
Evidence:`.local/upgrade-evidence/oh-care-and-se-pdf-recheck.log`.

## Actual Pennsylvania rental income and expense worksheets — 2026-10-25

Official sources refreshed: [final2025 PA40 ScheduleE instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40e.pdf),
SectionII lines1 and3–21, and the PA PIT Guide's allowable-expense and
[depreciation sections](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/net-income-loss-from-rents,-royalties,-copyrights-and-patents).

Confirmed-source and2026 property calculations now require a separate actual PA
worksheet. They no longer reuse federal depreciation, interest or expense
amounts. Every category, including zero, has to be supplied with its actual year,
reference and confirmations. The source amounts exclude personal use and remain
before ownership allocation. Each allocated printed line is rounded to whole
dollars; expense lines are then summed. Both Class4 and Class6 use these results.
Per-property audit records include printed lines1–21 and source verification;
historical unconfirmed2025 previews remain explicitly unverified.

Positive depreciation requires the actual PA depreciation worksheet reference;
positive other expenses need itemization; personal-use records need an actual
allocation reference. PA bonus-depreciation and different-basis rules are
identified in the interface. This source-entry package does not independently
compute asset basis or certify a supplied worksheet. Federal personal-use,
royalty/mineral expenses, special joint-owner and filing qualification remain
separate boundaries. It does not enable a2026 export or a filing-ready state.

The guided interface preserves unknown and zero values, accepts state amounts
that differ from federal values, and invalidates source confirmation after
edits. A PA-only partial record survives conversion. No source values are copied
from federal defaults. Existing ownership tests now check the official printed
whole-dollar rule rather than retaining fractional printed-line expectations.

Validation: four new core tests and one DOM interaction failed before their
implementations. The expanded state, PA PDF, all-guided and DOM run passes
**1,450 tests in84files**. Root, contract and web typechecks pass. Evidence is
`.local/upgrade-evidence/pa-rental-expenses-{red,ui-red,focused,expanded,types,contract-types,web-types,lint}.log`.
The reviewed diff retains the separate historical preview and all readiness gates.
Exact staged-tree verification (`90e27e7c9791c955980724cd7ddfcd07dd02fb5b`)
also passes the same1,450 tests and root types. All3,504 staged spec references
resolve, scoped lint reports zero errors/warnings, and staged diff checks pass.
The worktree's concurrent HSA/energy/AMT changes were excluded from this snapshot.

## Ohio withholding jurisdiction — 2026-10-25

The final Ohio booklet's line14 and source examples require an actual Ohio
state attribution. Previously, positive W2/W2G/1099 withholding with no source
state silently disappeared from the Ohio total. The withholding module now
rejects nonzero amounts without an actual two-letter jurisdiction. Actual
other-state amounts are still excluded, actual Ohio amounts are retained, and
explicit zero does not require an invented state. All supplied source amounts
must be finite and nonnegative, including other-state records. OID rows retain
their separate source and duplicate-row checks.

The spec preceded two failing regressions across all ten ordinary document
types; the first fixture run exposed three incorrect fixture field names,
which were fixed before demonstrating the intended failures. All122focused
checks now pass. Earlier fixtures that asserted silent omission now first prove
the missing-source error and then supply an actual other-state jurisdiction;
existing amount expectations remain unchanged. Root/state/PDF staged checks
are recorded in the subsequent evidence entry. No tax year or filing gate is
opened. Evidence: `.local/upgrade-evidence/oh-withholding-source-{red,green}.log`.

Exact staged tree `f6f0f40069e929b651eef7796f63be74f08acf30` passes741tests
in24files (all Ohio core, review PDF, workspace download and source routing),
root types and all3,629spec references. Scoped lint reports zero errors and
111pre-existing warnings in the large adapter fixture. The full scoped diff
was reviewed. Evidence: `oh-withholding-source-staged-tests.log`; type/spec/lint
output is retained in the task transcript. Independent human review is pending.

## Pennsylvania withholding source validation — 2026-10-25

Refreshed the [2025 PA-40 instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40in.pdf),
printed page 21, line 13. Every nonzero ordinary withholding source now needs a
two-letter source jurisdiction. Previously a spelled-out state silently disappeared
from the PA total. Every supplied amount must also be finite and nonnegative before
the jurisdiction filter, including amounts attributed to another state. Decimal
preserves cents; explicit zero does not require an invented state. Separate OID
and additional-withholding validations remain in place. The spec's W-2G source
reference now correctly names Box 15.

The spec preceded regressions across all ten ordinary statement categories.
The first run had 19 failures and two passes; the focused repair run passed all
297 tests. The expanded PA core, full-return and PA-40 PDF run passed 939 tests
in 35 files. Root types, all 384 PA spec references and scoped lint pass with no
errors or warnings. Logs: `.local/upgrade-evidence/pa-withholding-source-{red,green,expanded}.log`.
The diff was reviewed. Final 2026 form qualification and independent human review
remain outstanding; this change does not open a filing or tax-year gate.

## Ohio historical exemptions and exact MAGI ceilings — 2026-10-25

The [2024 Ohio booklet](https://dam.assets.ohio.gov/image/upload/v1735920104/tax.ohio.gov/forms/ohio_individual/individual/2024/it1040-booklet.pdf),
printed pages 17 and 29, has no upper-MAGI ceiling on exemptions or the joint
filing credit. The [2025 booklet](https://dam.assets.ohio.gov/image/upload/v1767095693/tax.ohio.gov/forms/ohio_individual/individual/2025/it1040-booklet.pdf)
adds a $750,000 exclusive ceiling to both. [R.C. 5747.025](https://codes.ohio.gov/ohio-revised-code/section-5747.025)
and [R.C. 5747.05(E)](https://codes.ohio.gov/ohio-revised-code/section-5747.05)
use actual MAGI before exemptions for eligibility; the joint-credit percentage
continues to use MAGI less exemptions. Sources were refreshed on October 25.

The constants now separate the exclusive ceiling from exemption and credit
tiers. This preserves the 2024 high-income rules, accepts actual 2025 cents
immediately below $750,000, and prevents exemptions from moving an ineligible
MAGI below the credit ceiling. Audits identify the actual tax year and MAGI.
No 2026 return or filing gate is enabled.

Specs preceded 12 new boundary and complete-return cases: eight failed before
the implementation. The expanded Ohio core, edge-case and reference-PDF run
passes all 728 tests in 22 files. Root types and all 262 Ohio spec references
pass; scoped lint reports zero errors and one existing non-null warning. Two
older fixtures were corrected to supply actual MAGI and assert the new separate
ceiling. Their tax expectations were retained.

An independent agent reopened both official booklets and the statute, reviewed
the scoped diff and ran the 12 new cases successfully, with no actionable
findings. This is code review, not the required human tax qualification. Logs:
`.local/upgrade-evidence/oh-year-ceilings-{red,expanded,types,spec,lint}.log`
and `oh-exemption-independent-review.log`. Exact staged verification is recorded
with the package commit in the durable checklist.

## Ohio government-payment qualifying income — 2026-10-25

The refreshed [R.C. 5747.05(E)](https://codes.ohio.gov/ohio-revised-code/section-5747.05/9-30-2025)
and [2025 Ohio booklet](https://dam.assets.ohio.gov/image/upload/v1767095693/tax.ohio.gov/forms/ohio_individual/individual/2025/it1040-booklet.pdf),
Schedule of Credits line 12, require at least $500 of qualifying income included
in Ohio AGI for each spouse. The adapter previously counted gross unemployment
before repayments and contribution recovery, and omitted other actual taxable
government payments. It now consumes the canonical Form 1099-G source result
for the return's actual year and owner. Linked program contributions are
recovered once; actual RTAA, nonbusiness grants and state family-leave income
remain distinct from withholding and refunds. An explicit reconciled zero
qualifying-income overlay remains zero.

The spec preceded three failing cases, covering $499/$500 boundaries, gross and
already-netted repayment reporting, linked source cents, owner conservation,
other government income and actual 2026 family leave. The initial expanded run
passes 112 tests; the final combined federal/guided/Ohio review passes 175 tests.
An independent agent reopened the official statute and booklet and reran the
three new cases, with no actionable findings. Exact isolated package checks and
the commit are recorded in the checklist. This is bounded code review and
synthetic evidence, not state/form or independent human qualification. Evidence:
`.local/upgrade-evidence/oh-government-{red,green}.log`,
`parent-government-final-review.log` and `ai-oh-government-review.log`.

## Isolated Ohio 2026 enacted baseline — 2026-10-25

Refreshed [R.C.5747.02(A)(3)(c)/(4)](https://codes.ohio.gov/ohio-revised-code/section-5747.02/9-30-2025),
[5747.025](https://codes.ohio.gov/ohio-revised-code/section-5747.025/9-30-2025),
[5747.05(E)](https://codes.ohio.gov/ohio-revised-code/section-5747.05/9-30-2025),
the [enacted HB96 comparison](https://www.lsc.ohio.gov/assets/legislation/136/hb96/en0/files/hb96-tax-comparison-document-as-enacted-136th-general-assembly.pdf)
page8 (uncodified757.120), and the final2025 booklet pages17/29. The separately
declared immutable candidate retains the published indexed exemption amounts
because HB96 suspends2025/2026 indexing. The enacted2026 nonbusiness rate is
2.75% above$26,050 with$332 base tax; both exemption and joint-credit MAGI
ceilings are exclusive$500,000. The statutory text controls that exclusivity.

The pure Decimal calculation takes completed actual Ohio income, business
deduction, eligible-person count, qualifying incomes and preceding credits.
It applies unused exemptions to business income once under5747.02(A)(4)(b).
The spec preceded missing-module red tests, then separate red regressions for
unused business exemptions and a jointly filing dependent's eligible spouse.
Eligibility is assessed per person outside this bounded calculator; a claimable
primary does not eliminate the independently eligible spouse's exemption.
All181 candidate and historical tests pass, including cents around every rate,
exemption and joint-credit boundary; root types and scoped lint pass. Independent
agent source/software review reran all7 candidate tests and found no remaining
actionable issue after those two corrections. Human tax review is still pending.

No2026 state registry, full return, map, export or filing gate is enabled. Actual
launch demand, conformity/residency/other source calculations and qualified final
2026 forms remain separate requirements. Evidence is in
`.local/upgrade-evidence/oh-2026-baseline-{red,expanded,final-green}.log`,
`oh-2026-baseline-unused-exemptions-red.log`, `oh-2026-joint-spouse-red.log`,
`oh-2026-{typecheck,lint}.log` and `ai-oh2026-final-review.log`.
