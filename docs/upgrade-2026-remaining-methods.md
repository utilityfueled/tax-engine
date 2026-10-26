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
  ordinary marriage/two-owner Marketplace methods documented in the ledger. The pure marriage worksheet prerequisite is `dd1ef96`; actual source prerequisite is `b2f3796`; canonical election/review is `55acc15` and actual guide is `31a1c4a`; ordinary two-owner health remains active.
- Full in-kind educator coordination is `08214b9`; credit-reduced tuition/actual
  recipient reconciliation is `ec05989`. The actual QTP expense cap is `51b7182`.
  The school-limited room-and-board extension is `c864287`; actual student
  and rendering-taxpayer aliases reject before PDF I/O, with 200 package cases
  and 73 separate review cases passing. Actual assistance is `b56402c`; combined assistance/credit and actual single-expense ESA allocation is `0517691`. The actual K12 cash-only cap/program source and furnished-date correction is `6e58929`; broader category/group methods stay explicit in the ledger.
- Pure QBI loss-character helpers are `2d1b9bb`; actual K1 basis/at-risk/passive, source character and canonical integration are `266aee3`. Source-derived ordinary Form461/SE classification is `3e9164`; the actual guided collector is `e586f87` and original-source/zero-deduction8995 review is `d777a68`. Prior basis/at-risk/SE releases, other K1 source methods and multi-pool positive461 remain explicitly excluded methods.
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


Latest bounded delivery is `3b93d69`. Current public/other-recipient cash is
`b153a91`; current five-category direct receipts are `0b5e881` and the separate
K1 semantic source-label repair is `3b93d69`. The existing verified crypto
category vector has a reproduced current-candidate handoff gap; its repair will
reuse actual-year valuation and source records, with no new election. The finite
charity endpoint and ordinary two-owner health remain active implementation.
All later full checks, final image/recovery evidence and external qualification
requirements remain open; the older audit findings above are historical where a
specific delivered follow-through supersedes them.


## Source and implementation follow-through at01c98e3

The crypto handoff is delivered in `d1d1ff0`, including crypto-only C/D/B-noncash
selection under explicit nonitemization. Nonbinding two-owner health is
`01c98e3`; binding owner earned-income limits and joint2025 capped-repayment
attribution remain internal method work. Official source refresh `5a9cf6b`
retains55 hashes and distinguishes the prospective Schedule3-A proposal from
current law. It does not enable forms or model routes.

A fresh current-law EIC check reproduced ignored explicit invalid/late work
SSNs, ignored known nonresident status, and a childless joint return rejected
when only the spouse meets the age requirement. `complete_facts` owns the
spec-first correction and actual guided eligibility sources. The charity agent
reproduced prior-B capacity incorrectly reserving the allowed public-capital
amount instead of the current contribution; that prerequisite correction is
separate from the broader2026nonitemized ledger. Parent owns K1 history DOM
coverage after full9bcf47b coverage failed89.96% functions despite86.97% branches.
These are active software tasks, not external-review excuses. All final current
checks, image scans and recovery still follow the finite implementation work.

## Current follow-through at994d92d

The current checklist supersedes earlier work-in-progress labels above. Actual
investment-only distribution gains and guide (`be0b6be`,`bb731b1`), direct royalty
properties and guide (`848e1fc`,`bc5c837`), separate-business health ordering
(`4fcff15`) and corrected ScheduleE physical review (`994d92d`) are delivered.
The positive federal royalty method does not yet supply actual PA classification
and expense evidence. Passive distribution coordination and full no-advance
coverage-family benchmark sources remain active implementation, along with
coverage interactions and the reproduced pending-upload Enter behavior. The
remaining charitable, education, EIC and historical health combinations in their
ledgers remain methods to implement; external interpretations are not invented.

## Follow-through through9eb32ba — October26

The actual single-passive-business distribution core is2669c37 and its complete
guided records are9eb32ba. Physical Schedule E and full-packet transfer are in
parent review candidate5772f719; do not count the candidate as delivered. PA
actual royalty property/owner/receipt treatment and references areb334f19; its
actual guide is parent candidate dda311af. Full-family benchmarks for overlapping
no-advance Marketplace policies are35b862c, with source, guide and physical trace.
Their software evidence and exclusions are in their package ledgers.

`federal_law` is implementing the next ordinary Situation4 shared-policy/health
source binder from original covered persons and payment records; allocation
agreement alone does not establish who paid an eligible deductible premium.
`complete_facts` owns actual EIC denial/assessment/recertification chronology for
each required filer. `ai_billing` reviews these finite deliveries and resumes
remaining charitable floor/regular-AMT NOL and partial mixed-media methods.
Parent owns the PA guide and passive PDF follow-through plus integrated evidence.
Coverage-only investment interaction work is separately reviewed; its exact full
rerun is pending after an environment-only localhost failure.

These deliveries do not erase the existing named source combinations, independent
human interpretations, final2026 forms, live-provider evaluation or staging gates.

## Follow-through through63b4c4f — October26

PA actual royalty intake is9173d20; passive distribution Schedule E/private
source validation/full packet is63b4c4f. Their bounded guide and mapping queues
are delivered, while other named tax scenarios remain. Investment panel
behaviors are95e4276, with full unchanged-gate coverage passing on the exact
ee0132c-plus-candidate tree; later integrated source still needs its full run.

Federal continues shared-policy/health original payment ownership and actual
full-shell source reconfirmation. Complete facts continues actual EIC history,
current8862 and canonical/guided follow-through. AI/billing continues current
single-category regular/AMT charitable NOL sources before the remaining prior
floor and partial-media methods. Parent continues distinct in-kind tuition
benefits with actual assistance/credit sources and independent package review.
No inactive prerequisite completes its canonical, guide or physical output.


## Follow-through through374e117 — October26

The agreed shared-health/payment/person method and actual full-shell controls
are `0b65e34`; the existing default/no-advance allocation extension is separately
under review. Current single-category regular/AMT charitable NOL is `360f340`;
actual single-prior-vintage replay and collector/review follow-through remain
active. Distinct original tuition benefits with their own assistance/credit
records are `374e117`; actual multiple-expense ESA coordination is the next
bounded source-group extension. Other interpretations remain in the education
method ledger.

Actual EIC history prerequisite is `60611f3`. Its private canonical review
reproduced a conflicting child-status answer; the correction passes all four
unchanged reviewer controls. Actual guided history, current Form8862 sources
and original-source physical/review output are still unfinished software work.
The full immutable `d898091` run passes all required local checks and coverage
gates, but excludes these four later packages and all private candidates.
Final integrated, remote, image and recovery evidence remains due.

## Follow-through throughb0de955 — October26

Default/no-advance shared-health payment binding is `15549f8`; actual shared and
household-only originals in one health plan are `827b399`. The next ordinary
method is independent actual plans/businesses and multiple specified owners,
with complete person/payment attachments on every linked plan. Other payment
and marriage combinations remain methods, while binding joint2025 repayment
attribution still requires a controlling interpretation.

Actual EIC history canonical restrictions and its complete guide are `b41f628`.
Current Form8862 original facts, canonical eligibility, actual collection and
review/output remain active software work; the prior history prerequisite is
no longer the only delivered part. Single-prior-vintage regular/AMT charitable
NOL replay and collector/review remain private; mixed/floor and partial B methods
follow without invented attribution or copied AMT sources.

Multiple tuition expenses with actual one-QTP/one-ESA allocation are `b0de955`,
including canonical/guide/workspace/review/browser paths. The next bounded
extension is multiple distinct original prepaid QTP statements with one ordinary
ESA. Each statement must retain its own original earnings ratio and actual
expense/credit allocations. Qualified mixed-owner bond and broader code6
interpretations remain separate questions in the education method ledger.

The immutable `d898091` full run passes every required local check and unchanged
coverage gates but excludes these eight later source packages. Current b0de955
remote CI/Web were observed in progress, not completed. Final integrated checks,
images, scans, recovery, support reconciliation and external qualification
remain required. Every delivered package and exact evidence is recorded in the
current checklist and checkpoint; no blocked method is counted as implementation.

## Follow-through through603fc1b — October26

The ordinary separate-health-plan/multiple-owner group is delivered in9eafb45.
Current Form8862 actual sources, canonical eligibility, guide and physical review
are delivered in603fc1b. One prior original charitable category/vintage with
independent regular/AMT NOL histories is405d914. Distinct prepaid QTP sources
with one ESA arec6df682; multiple ordinary ESA accounts sharing original tuition
are74bf948. These close the corresponding earlier queue items, including their
actual saved review paths; their package ledgers retain bounded evidence.

The remaining finite queue is actual partial-coverage-family health and ordinary
payment/marriage sources; deceased-claimant short-year residence; current K1 and
crypto charitable NOL sources, crypto donation intake, current-loss-origin charity
and determined floor/current-prior methods; and the explicitly remaining partial
cash/category education methods. Named interpretation questions are not replaced
with arbitrary allocations. Support/inventory mapping and final checks, native
images, recovery and external qualification remain due. The603fc1b immutable full
run is active; its results must not be inferred from the earlier d898091 pass.

## Follow-through throughe91d7d7 — October26

Actual deceased-claimant numeric short periods and current8862review are now
5702c78. Original current K1/crypto charitable NOL sources are8d97c0f. The actual
crypto donation guide, saved review and independent NOL-history presence are
e91d7d7; the known same-asset appraisal-group correction isc078ce0. These close
the named corresponding source/guide tasks. Their ledgers retain exact bounds.

Remaining internal work is actual coverage-family health premiums and ordinary
payment/marriage combinations, current-loss-origin charity and determined
floor/current-prior methods, and remaining bounded cash/category education
methods. A read-only education inventory is active. Explicit shared-implementation
links, current integrated/remote verification, final images/scans and recovery
remain due. The603fc1b full run finished with18992pass/one stale template count
failure in both unit and coverage; eca2e6a fixes it without changing byte checks.
Its422browserpasses/fivehostedskips do not establish hosted readiness. Current
source requires another complete run. External interpretation, final-form,
human-review, provider, staging and advisory decisions remain unresolved.
