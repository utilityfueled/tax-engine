# Named federal requirements: remaining implementation audit

Read-only audit, October 25, 2026, committed base `907b6dbb431767cfa64452bfb75151179ff818e2`. The uncommitted charity work is excluded. Scope is section 3 of `docs/upgrade-2026-execution-brief.md` and the actual-facts requirement that makes its ordinary calculations usable. This is a code/spec reachability assessment, not fresh numerical qualification of every formula.

The brief is not fully implemented merely because unsupported paths throw. Two ordinary guided-source omissions are confirmed, and several named forms still have explicitly unfinished methods. Conversely, a named form does not imply implementing every specialized IRS election before its bounded ordinary scenario can be qualified.

## Immediate ordinary source gaps

1. **Taxable state/local income-tax refunds.** The historical core exists, including actual paid/deducted expense year distinct from Box 3, historical SALT cap and tax-benefit limits (`src/engine/forms/taxable-refund-worksheet.ts:60`; `spec/federal/taxable-refund-worksheet.yaml`). The guide rejects every positive Box 2 (`apps/web/src/lib/guided-unemployment-facts.ts:99`). Its converter carries `refundTaxYear` but does not carry `refundExpenseTaxYear` or the actual historical worksheet (`guided-government-payment-inputs.ts:24`). This is missing ordinary intake/validation/handoff, not an absent tax formula or external qualification issue. Federal-law agent owns the next bounded collector after this report and the requested charity source research.
2. **Wagering expenses.** The engine already computes `min(90% * (losses + otherwise deductible wagering expenses), winnings)` for 2026 (`src/engine/schedules/schedule-a.ts:565`; canonical handoff `src/engine/federal.ts:2368`). The guided type, bridge and deductions screen expose winnings and losses, but no `gamblingExpenses` (`guided-interview-flow.ts:935`, `guided-interview-bridge.ts:358`, `section-deductions.tsx:108,155`). Parent now owns this narrow intake/handoff package; no arithmetic change is needed to expose the existing source amount.

## Named ordinary method gaps beyond charity

These are implementation work. They are not closed by the global 2026 gate and are not automatically external blockers.

| Named requirement | Implemented ordinary route | Exact unfinished route and evidence |
| --- | --- | --- |
| Schedule 1-A vehicle interest | Actual owner/year/loan/vehicle qualification, source interest, limits and phase-down | Any `loan.refinanced` throws at `src/engine/schedules/schedule-1-a.ts:76`. A qualified refinancing needs original-loan/balance/payment sources and a calculation; the flag alone is not sufficient. This is a direct ordinary extension of a named deduction. |
| Tips and QBI coordination | Actual W-2/4137/NEC reporting, Schedule C net-income limit and once-only business QBI reduction | Source-bound business tips are restricted to the actual Schedule C/NEC route (`schedule-1-a-return.ts:143,159`). Mixed employee/business tips with a shared cap or MAGI reduction throw (`:184`). `spec/federal/schedule-1-a-return.yaml` records that no controlling shared-allocation method was located. This requires further source-method work; no invented pro-rata split. |
| PTC/APTC and SE-health | Actual monthly 8962, ordinary QSEHRA, full 2026 excess repayment, supported 2025 W/X and 2026 simplified method, ordered IRA/bond/loan/passive and actual NOL replays | Shared-policy allocation, alternative marriage calculation and lawful-presence reconciliation lack completed worksheets (`form-8962.ts:122`). SE-health coupling additionally gates QSEHRA/shared allocations, coverage outside the family and outside payers (`marketplace-health-premiums.ts:30,36,66`), multiple owners (`form-7206-return.ts:164`), ordinary-no-PTC renewed eligibility (`federal.ts:239`), and 2025 ineligible coverage with capped advance repayment (`marketplace-health-deduction.ts:34`). The ordinary shared-policy/marriage/two-owner and re-entry routes are named internal methods; the existing single-owner/source-complete route is implemented. |
| Adoption and historical eligibility | Actual current domestic/foreign expenses/finality, separate employer exclusion and credit, refundable amount, existing carry | Positive prior-year foreign employer benefits throw at `form-8839.ts:128`; `spec/federal/form-8839.yaml:23` identifies the missing historical exclusion worksheet. Ordinary current-year adoption is not missing; this particular historical branch is. |
| Education/529 | Actual cash distributions, recipient ownership, education/credit elections, revised K-12/credential categories and limits, basis/rollovers, bounded full in-kind benefits | Partial or credit-reduced in-kind allocations throw at `form-1099-q.ts:673,720`; `spec/federal/form-1099-q-in-kind.yaml` explicitly retains the method gap. Educator coordination cannot yet consume positive in-kind QTP exclusions (`educator-education-exclusions.ts:72`) or partially excluded mixed-owner bonds (`:121`). These are specific combinations, not absence of ordinary cash529 support. |
| QBI and historical loss character | 2026 threshold/minimum rules, business deductions, current SSTB and prior-loss order, actual rental vintages/FIFO | Actual suspended partnership QBI character is not represented by the rental-only release method (`federal.ts:2485`); released rental QBI plus a later excess-business-loss limitation needs source allocation (`:2504`). Do not infer a defect in supported rental-only calculations or claim every PTP disposition is absent; separate disposition routing exists. |

No implementation ownership has been silently assigned for these method extensions. Parent can select coherent packages after the two confirmed ordinary intake omissions and current charity queue. The mixed-tip and mixed-bond allocation questions remain research gaps; only the separately documented negative-net section1202/Form172 printed/statutory disagreement has already been escalated for qualified tax interpretation.

## Implemented named boundaries that still require final qualification

| Brief item | Committed implementation/spec evidence | Audit conclusion |
| --- | --- | --- |
| Immutable indexed/payroll data | `src/models/federal-2026-indexed.ts:31,75`; `spec/federal/indexed-2026.yaml`; rule-pack metadata at 2026.71 | Independent frozen shape and authoritative provenance exist. This audit did not freshly rederive every parameter. The runtime gate remains explicit in `src/models/constants.ts:2112`. |
| SALT MAGI phase-down | `schedule-a.ts:254`; `calculateSALTLimit`; `spec/federal/schedule-a-2026.yaml` | Canonical foreign-income addbacks and year/status limit are implemented. No new ordinary omission found in this pass. |
| CTC eligibility/refundability | `forms/form-8812.ts`; `spec/federal/form-8812.yaml`; federal call `federal.ts:3651` | Actual household, employment-valid SSN and payroll-alternative facts are required. No new ordinary formula gap identified here. |
| Overtime/senior | `schedules/schedule-1-a.ts:67,85`; source resolver and guided spec | Actual premium/source conservation and senior age/death/SSN branches are implemented. Vehicle refinancing and mixed tips remain separately listed above. |
| Charity/floors | Committed `schedule-a-2026`, reporting and current-public-cash regular/AMT NOL specs; pending AI history source package | AI owns actual prior/mixed categories, qualification and 2026 nonitemizer/floor carry coordination. Pending work is not counted as complete. Current no-history category/basis bugs discovered by parent are also assigned to AI. |
| High-income itemized limit | `forms/itemized-deduction-limit.ts`; `spec/federal/itemized-deduction-limit.yaml`; `federal.ts:2669` | Canonical post-deduction reduction and downstream allocation are implemented. No new ordinary gap found in this pass. |
| Dependent care | `forms/form-2441.ts`, `form-2441-benefits.ts`; corresponding return-integration specs | Actual qualifying person, separate-owner earned income/benefits and prior-year expense credit are represented. No new ordinary missing method found. |
| Energy/vehicle transition and carry | `forms/form-5695.ts`, `form-8936.ts`; energy-source and vehicle specs | Actual acquisition/service/contract/payment/transfer/return and carry facts are handled in the bounded paths. No new ordinary gap found in this pass. Source verification and final-form qualification remain required. |
| Historical NOL/current origin/COD | Actual regular/AMT/1411 vintages, modified absorption, current active-business origin, ordinary capital/clear1202 origin, source-bound COD core and guided intake | The delivered ordinary methods have calculations, sources and review output. Farming/estate/other origin methods, later COD attributes and distinct modified-absorption COD coordination remain deliberately unsupported internal methods, not ordinary-source completion claims. |

## Finite next-step recommendation

Complete (1) refund intake, (2) wagering-expense intake, and (3) the assigned charity corrections/history/nonitemizer package first. Then select explicit source-complete packages for qualified vehicle refinancing and the ordinary Marketplace/shared-policy or re-entry cases, since those are direct branches of named brief requirements. Keep adoption historical benefits, partial in-kind education and non-rental QBI loss character as separately named remaining methods with owners and support exclusions; do not silently count them as completed, or expand every other IRS election by implication.

Final 2026 enablement still needs the complete parameter/rule review, final physical forms, independent human qualification and integrated release evidence. Those are distinct from the software gaps above. The current global gate is protective behavior, not evidence that the brief is finished.

## Current ownership and delivered follow-through

The original audit above is dated to `907b6db`; these subsequent deliveries
supersede its specific missing-route observations, not its qualification limits.

- Actual refund intake is committed in `2c4ddfe` with strict-spec repair
  `cd08895`: 903 adjacent cases, two browser flows and corrected 11-case
  independent review pass. Actual wagering intake is committed in `fcedf57`.
- Actual 2025 charity histories and their collector are committed in
  `ea2f422`/`4332623`, with cash ordering `9ce1686`, bounded cash/property
  histories `6cf0463`, explicit 2026 nonitemization `6029f70` and public-cash carry
  under nonitemization `f2d0faa`. Empty-history cash candidates are `36cd922`; current public cash/ordinary-property candidates are `b18e8e9`.
  The bounded prior-G/current-A route is `c89c81c`; broader positive prior-floor/mixed-NOL and partial mixed-media methods remain with
  `ai_billing`.
- Ordinary vehicle refinancing and actual intake are committed in
  `2baa03c`/`da7fc1c`; historical foreign-adoption benefits/intake/review are
  `998d55a`/`d153020`/`6f2b577`.
- Marketplace ordinary re-entry is `0ffaa3d`; actual shared-policy core and
  physical review are `d9cccd5`. The actual guided collector is `675f5ba`. `federal_law` owns the remaining
  ordinary marriage/two-owner Marketplace methods documented in the ledger. The pure marriage worksheet prerequisite is `dd1ef96`; actual source prerequisite is `b2f3796`; canonical election, guide and ordinary two-owner health remain active.
- Full in-kind educator coordination is `08214b9`; credit-reduced tuition/actual
  recipient reconciliation is `ec05989`. The actual QTP expense cap is `51b7182`.
  The school-limited room-and-board extension is `c864287`; actual student
  and rendering-taxpayer aliases reject before PDF I/O, with 200 package cases
  and 73 separate review cases passing. Actual assistance is `b56402c`; combined assistance/credit and actual single-expense ESA allocation is `0517691`. The K12 cash-only cap/source correction is active; broader category/group methods stay explicit in the ledger.
- Pure QBI loss-character helpers are `2d1b9bb`; actual K1 basis/at-risk/passive, source character and canonical integration are `266aee3`. Source-derived ordinary Form461/SE classification is `3e9164`; `complete_facts` continues the actual guided collector and original-source/negative8995 review integration.
- Fresh official mixed-tip research did not locate a controlling allocation of
  the final reduced deduction between employee and business tips for QBI. The
  [source decision](upgrade-2026-mixed-tips-method-decision.md) identifies the
  precise qualified interpretation needed; no pro-rata election is invented.
- Full coverage on `7523384` passes 17,934 tests/975 files at 87.01% branches.
  The subsequent exact `095d5bd` unit run passes 17,960 tests/987 files; its full
  browser run passes 362 cases with zero retries and five hosted-only skips.
  Final current verification remains required. Human review, staging, provider
  qualification, selected-state demand and final forms remain external
  requirements; guards and agent reviews do not complete them.

The recipient source prerequisite is `6a90c81`. The finite ordinary charitable
endpoint is: current five-category candidates; actual prior-vintage/floor and
nonitemized coordination; regular/AMT NOL with actual prior/mixed histories; and
partial same-category B cash/property allocation. Specialized conservation, food,
inventory, partial-interest and appreciation-basis elections remain explicitly
excluded methods; no guard is counted as their implementation.
