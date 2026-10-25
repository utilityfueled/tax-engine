# Complete taxpayer facts: implementation evidence

This package remains subject to independent tax review and the repository release
gates. Local synthetic tests do not qualify a tax year, state, form or deployment.

## Source-fact corrections

- Removed representative mortgage lender/principal, charity recipient/type/date,
  estimated-payment date, retirement distribution-code and AOTC-history defaults.
- Added per-mortgage and per-donation entry controls; old aggregate amounts remain
  visible and require source details. Reconciliation rejects differing totals.
- Actual dates are calendar-validated and checked against the selected year.
  Estimated payments can occur in the following year; no quarter date is inferred.
- Unknown retirement taxable amounts stay absent in the adapter and block guided
  calculation. Explicit zero taxable amounts, principal and payments survive.
- Started incomplete entries block section completion and calculation. Duplicate
  family taxpayer identifiers, invalid ZIP and state values are rejected.
- Updated prior tests that asserted invented defaults to assert missing-fact
  rejection, while preserving the complete-data calculation regression.

Sources refreshed 2026-10-25 (UTC): official [Form 1098 instructions](https://www.irs.gov/instructions/i1098),
[2026 Form 1099-R instructions](https://www.irs.gov/instructions/i1099r),
[2026 Publication 505](https://www.irs.gov/publications/p505),
[2025 Publication 970](https://www.irs.gov/publications/p970) and
[2025 Publication 526](https://www.irs.gov/publications/p526).
The source pages describe mortgage box facts, taxable-amount/code reporting,
contribution records, payment dates and prior AOTC claims; they do not themselves
qualify the 2026 implementation. The 1098 live page identifies a December 2026
revision, later than the execution date, so it is not treated as contemporaneous
final-form qualification.

Verification with pinned Node 24.22.1:

- Spec entry updated first; six new required-fact tests all failed before changes.
- `pnpm test tests/guided-interview tests/apps/web/guided-interview-flow.test.ts`:
  428 tests pass in six files.
- `pnpm typecheck:web`: passes.
- Scoped ESLint: zero errors (177 existing/test-style warnings).
- `git diff --check`: passes.
- Reviewed React changes for pure updates, serializable stored facts, explicit
  input labels and no mount-time workspace rewriting. No provider calls.

## Remaining work in this package

- Decimal UI totals/formatting and audit of adapter source validation.
- Cross-document/year/household validation and preservation of residency facts.
- Legacy guided-fact confirmation for values formerly prefilled automatically.
- Integrate additional eligibility requirements from the federal-law package.
- Broader unit/browser checks and independent expected-output review.

## Decimal presentation package

- Replaced remaining monetary `Number` conversions and arithmetic in guided
  review, payment, self-employment, state and W-2 presentation. Numeric conversion
  remains only for counts, months and years.
- Deduction comparisons retain decimal-string totals; exact cents survive beyond
  JavaScript's safe integer range. Malformed display inputs propagate unknown
  rather than being dropped from a total as zero.
- Other-tax indicators now display the verified engine SE, Additional Medicare
  and NIIT amounts. Missing calculation is distinct from a zero result.
- Primary/spouse residency months and state residency now pass through the guided
  adapter into the coordinated input schema additions.
- The two new money tests failed before implementation; all 432 focused tests in
  eight files now pass, including rendered payment precision and tax indicators.
- Web typecheck passed before concurrent AI responder changes, then reported only
  the responder's in-progress contract properties (`optedOut`, `sourceIds`). These
  are outside this package and have been reported to its owner for integration.
- Source-facts package commit: `5d09daf`.

## Eligibility and legacy facts

- Guided AOTC records now collect and forward prior-study, enrollment, credential,
  conviction and refundable-eligibility answers. Missing answers block calculation.
- Guided fact schema version 2 preserves saved values and years. A legacy
  distribution code 7 or AOTC-history 0 is marked for reconfirmation; the app cannot
  distinguish a previously chosen value from its former automatic default.
- Donations survive standard-deduction selection, and the 2026 standard-deduction
  screen accepts donation facts. The 2026 law/readiness gate is still closed.
- Source-entry editing preserves malformed/in-progress input for correction rather
  than throwing during a keystroke or converting it to a monetary zero.
- 434 focused tests pass, web typecheck passes after the AI owner's contract
  integration, scoped lint and diff checks pass. Eligibility test cases were red
  before implementation. No live provider or taxpayer data used.
- Decimal presentation commit: `f312c2f`.

## Source years and document fidelity

- Source document contracts now store an actual year, explicit unknown (`null`),
  or legacy absence. Detection uses explicit form-year text, never a filename or
  a transaction date. Guided source records carry their selected year.
- New year-confirmation controls persist the source year and reopen affected
  answers. Legacy saved return years remain stored while missing source years
  keep calculation blocked. Invalid/conflicting years cannot drive an adapter.
- Removed inferred W-2 Social Security wages and cross-box wage substitutions;
  known zero survives. Brokerage summary-only entries no longer get an invented
  December 31 sale date. Parser money formatting, comparisons and arithmetic use
  Decimal.
- Engine source validation rejects duplicate identities, mixed/unknown years,
  machine facts ambiguously attached to multiple documents, and spouse-owned
  sources without actual spouse facts. Repeated synthetic fixture documents now
  have distinct fact IDs; sample payroll facts are explicitly stated.
- Eight new source/year tests were introduced before their implementation;
  516 focused tests in 14 files pass. Web typecheck, scoped ESLint (zero errors)
  and diff whitespace checks pass. Tax totals in existing regressions unchanged.
- Eligibility/legacy package commit: `1d166e7`.

## Remaining implementation (updated)

- Resolve or explicitly gate ambiguous legacy IRA, alimony, casualty, other
  itemized and other-payment aggregates rather than dropping/misclassifying them.
- Audit sparse document-extraction optional fields and remaining household facts.
- Independent expected-output and required human readiness review remain pending.

## Independent agent review: local recovery integration

Reviewed parent recovery commit `6bebb6d` separately from its implementation. This
is an independent agent review and does not satisfy a required human security or
privacy review. Three actionable integration findings were reproduced and fixed:

1. HTTP 401 on a hosted mutation was accepted by the read-oriented transport;
   deletion could remove the local copy after the server rejected the request.
   Non-successful mutations now reject before local writes/deletion. Tests cover
   expired authentication, forbidden responses and network failure.
2. Reset left scoped guided answers and private audit text/filename references.
   Reset now clears guided storage, the mode preference, displayed derived state,
   and private audit details while retaining generic lifecycle history.
3. Restored local returns disappeared from the hosted homepage after navigation.
   Imports now receive an explicit local-recovery marker. Hosted listing includes
   only those marked local returns beside the current owner's server list, labels
   them as local, and keeps them usable during cloud outages. Unmarked browser
   shell caches are excluded; local deletion sends no hosted mutation.

Rollback attempts each scoped-key cleanup even if another storage cleanup fails.
Nine new review regression cases cover these boundaries; six initially failed.
The combined recovery/cache/storage/persistence suites pass 84 tests in five files.
The fresh production build passes, and two Chromium recovery/reset flows pass:
exact private facts/original bytes survive restore and reload, local restore
labels remain visible, deleted/reset answers stay cleared, and captured requests
contain no synthetic SSN, source filename or PDF bytes. The first reset browser
attempt exposed a test navigation race; waiting for the actual created-return URL
resolved it. The root test wrapper ignored its file filter and began the full
browser suite; it was interrupted and the exact Playwright file was run directly.
Web typecheck, scoped lint (zero errors), and diff checks pass.

Source-year/document-fidelity package commit: `70f8d17`.

## 2026 organization and education identity facts

- Guided donation details now preserve qualified recipient, supporting organization,
  donor-advised-fund and qualified-appreciated-stock answers. Unknown facts gate
  the affected 2026 calculation; an explicit false remains false.
- Education details collect taxpayer/spouse/student SSN eligibility and institution
  EIN, without assuming eligibility from a name or amount. A positive 2026 LLC
  aggregate remains blocked because the engine contract lacks individual LLC
  student identity and eligibility; a zero aggregate is not a credit claim.
- Both new eligibility regressions were red before implementation. All 441 guided
  tests in nine files, web typecheck, scoped ESLint and diff checks pass.
- Recovery review hardening commit: `937f4bf`. No required human review is claimed.

## Classified payment facts

- Added distinct federal extension payments and prior-year applied refunds, with
  real dates/source years and Decimal amounts. Explicit zero survives. Legacy
  other-payment totals must reconcile to classified entries before calculation.
- Refreshed official [Form 1040 instructions](https://www.irs.gov/instructions/i1040gi),
  currently titled 2025, for payment category/source-year semantics. This does not
  qualify a 2026 filing form or bypass the existing year readiness gate.
- Three new regressions failed before implementation. All 444 guided tests in ten
  files pass; web typecheck, scoped lint and spec validation are checked with this
  package. Organization/education package commit: `a70b823`.

## IRA, alimony and individual household employees

- Added actual IRA contribution/owner/plan-coverage entries; legacy deduction
  estimates no longer substitute for contribution facts. Confirmed dates of birth
  supply age flags consistently to both existing engine worksheet paths.
- Added the original alimony instrument date, post-2018 modification answer,
  recipient tax ID and supported post-1984 eligibility answers. Unknown facts and
  pre-1985 treatment block calculation; known ineligible payments remain saved with
  a zero deductible amount. No blank recipient or agreement is fabricated.
- Household payroll now has real individual employees, wage/withholding amounts,
  exclusion answers and FUTA/credit facts. Legacy totals reconcile to individual
  wages, preserving cents and zero.
- Refreshed [Publication 590-A](https://www.irs.gov/publications/p590a),
  [Publication 504](https://www.irs.gov/publications/p504), and
  [Schedule H instructions](https://www.irs.gov/instructions/i1040sh); live pages
  are titled 2025. Four new integration tests were red before implementation.
- Existing household fixtures now explicitly supply employee facts. Corrected two
  source-preview fixtures for namespaced source IDs and actual SS/Medicare wages;
  their tax totals and exact large-integer assertions remain intact.
- The facts audit exposed independent Schedule H FUTA/withholding defects below
  the Social Security threshold; a separate tax-law correction is in progress.
- All 470 guided and source-preview tests in 12 files pass, together with root/web
  typechecks, scoped ESLint, spec validation and diff checks.
- Classified federal payment package commit: `2c1dfd9`.

## Schedule H correction discovered during the fact audit

- Refreshed [Publication 926 (2026)](https://www.irs.gov/publications/p926) and
  [Schedule H instructions, lines 7 and 15–24](https://www.irs.gov/instructions/i1040sh).
  Five new calculations failed before the correction; the published Mary Brown
  example independently fixes expected combined SS/Medicare amounts.
- Separated Social Security/Medicare eligibility from FUTA and actual income
  withholding. Below-threshold employees and unrelated minors retain applicable
  FUTA, and actual withholding is never lost because of payroll-tax exemptions.
- Added the explicit parent childcare exception; omitted eligibility answers stay
  unknown. Section B now requires real state/rate periods and payment timing,
  including experience-rate additional credit, the 90% late-contribution worksheet
  and supplied credit reduction. Negative, invalid and overlapping records fail.
- Guided payroll collects these facts. The federal owner forwards the fields in
  its separate routing commit. Full-return/PDF readiness remains unchanged.
- Actual IRA/alimony/employee facts package commit: `45f96c0`.
- 515 tests in 14 focused guided/payroll/PDF files, root/web typechecks, scoped
  ESLint, spec validation and diff checks pass. An additional source-preview run
  exposed three stale expectations from the concurrent federal penalty separation
  (line 24 excludes the penalty; line 37 still includes it); those are tracked
  separately and were not changed to mask a Schedule H failure.

## Deduction categories and state payment sources

- Refreshed [Schedule A instructions](https://www.irs.gov/instructions/i1040sca),
  currently titled 2025. Additional income taxes, real estate taxes and annual
  value-based personal property taxes now reach their distinct input fields.
  Investment interest and wagering losses no longer come from an ambiguous total.
  A saved casualty aggregate requires actual Form 4684 facts and is explicitly
  blocked; it is not silently discarded. Gambling winnings survive either method.
- State estimates retain their actual state/date/amount. Additional withholding
  requires payer, form, state and source year, with Decimal reconciliation of saved
  totals. Unknown or conflicting facts block previews and PDF exports. No W-2 is
  fabricated. Ohio review overlays preserve exact Decimal sums and explicit zero.
- Four new regressions failed before implementation. Malformed deduction editing
  now renders a correction prompt instead of crashing. Classified review totals
  remain visible; unclassified legacy withholding is labeled for confirmation.
- Checked the separate Form 2210 routing correction against the official
  [Form 1040 instructions](https://www.irs.gov/instructions/i1040gi), line 37. Updated
  the three stale source-preview assertions: total tax excludes the existing
  penalty; amount owed still includes it and remains unchanged.
- 477 tests in 14 guided, source-preview and Ohio packet files pass. Root/web
  typechecks, scoped ESLint, spec validation (3,022/3,022 references) and diff checks
  pass. Schedule H correction commit: `2fb8e5c`.
- The federal owner separately handles calendar-year SALT timing for the dated
  state payments. Final 2026 law/form qualification and human review stay pending.

## Care and business qualification facts

- Added separate primary/spouse Form 2441 earned-income amounts, excluded Part III
  benefits and explicit eligibility. Missing worksheet facts block a positive
  claim; confirmed zero and false survive. An MFS care claim is explicitly blocked
  until the separated-spouse exception is modeled. Provider/person identity for a
  complete Form 2441 remains a separate unresolved form contract.
- Added actual section 469 material-participation answers for guided Schedule C
  and rental records, preserving unknown rather than inheriting an active-business
  default. The engine owns the conditional 2026 QBI minimum test.
- Refreshed [Form 2441 instructions](https://www.irs.gov/instructions/i2441).
  Three new regressions were red before implementation. 462 guided and rendered
  credit/self-employment tests in 15 files pass, including exact large totals,
  explicit-zero spouse income and unknown/false eligibility rendering.
- State and deduction source package commit: `f5acf56`.

## Regression alignment with corrected federal routing

- Rechecked remaining Schedule H edge fixtures against the source-backed payroll
  rules in `2fb8e5c`. A $2,799 worker has no Social Security/Medicare wages but
  remains in an established FUTA base. Actual withholding from below-threshold
  workers remains on line 7. Unrelated minor wages remain subject to FUTA.
- Section B fixtures now supply independently explicit state/rate periods,
  contribution timing and credit reductions. A null assigned experience rate is
  a known absence of an assigned rate, not an inferred zero rate. Parent employee
  exemption fixtures explicitly answer the childcare exception.
- Updated workspace assertions for the independently corrected Form 1040 payment
  routing: line 24 excludes the existing Form 2210 penalty; line 37 still includes
  it. The single and double broker balances due remain $1,534 and $12,458, while
  total tax is $1,472 and $11,957. All source-trace assertions remain enforced.
- Both affected files pass: 61 tests. Care and QBI fact commit: `e5f3014`.

## Individual energy and carryforward interview

- Individual 25C improvements and 25D properties retain actual categories, net
  qualified costs, completion dates, qualification, applicable manufacturer ID,
  fuel-cell capacity and residence eligibility. Unknown and false are distinct.
  General roofing requires explicit ineligible treatment; qualified solar parts
  reconcile to actual solar records. Saved totals remain visible but never feed a
  second aggregate credit calculation.
- Prior-year carryforward retains actual source year, confirmation and explicit
  zero. A 2026 energy result requires the actual 2025 carryforward, including zero;
  new 2026 property records remain available for the calculator's disallowance.
- Review totals use detailed costs once and separately display the carryforward;
  extension payments and prior-year overpayments now appear in their own rows.
- Four new source-fact regressions failed before implementation. 468 guided and
  rendered-UI tests pass, with root/web typechecks, lint (zero errors), all 3,065
  spec references and whitespace review passing. Energy input contract commit:
  `b608522`; calculation/credit-limit orchestration is a separate federal package.
- The PDF energy fixture now supplies actual detailed solar facts. Its focused
  run passes 11/12; remaining failure is the federal orchestrator not yet passing
  the improvement credit-liability worksheet. The federal owner acknowledged and
  is implementing the actual ordering, without an unlimited placeholder.
- Fresh production-bundle Chromium interaction passes (1/1): business
  participation unknown→false→unknown, exact cents above the safe-integer range,
  individual energy category/date/QMID, false qualification and zero carryforward
  all survive reload. Captured requests contain neither the synthetic SSN nor the
  exact entered income. Initial selector failures were corrected without changing
  app behavior or weakening timeouts/readiness gates.

## Sparse source documents and confirmed zero

- Deterministic interest/dividend extraction now reads only the amount belonging
  to the labeled box in its actual form section. Missing boxes, conflicting copies,
  payer identities and ambiguous repeated statements remain unknown or partial.
  File names are not payer evidence. Digital asset rows keep their own asset name;
  absent acquisition dates, basis-reporting status, adjustments and wash-sale
  facts are no longer invented. Source contracts preserve those missing fields.
- The document-to-engine boundary rejects missing W-2 payroll boxes and incomplete
  interest/dividend/transaction facts before schema defaults can replace them.
  Legacy deterministic records need the new source-facts version and actual facts;
  unchanged original source records remain available for review. Explicit fixture
  payroll amounts are synthetic examples, not claims about blank IRS templates.
- W-2 and NEC copy controls preserve actual zero and leave absent amounts blank.
  W-2 values remain pending until confirmed; a manual change clears the source
  confirmation. Suggestion comparisons and large-number review copy now use
  Decimal, including cents beyond the JavaScript safe-integer range.
- Refreshed official [1099-INT instructions](https://www.irs.gov/instructions/i1099int),
  [1099-DIV instructions](https://www.irs.gov/instructions/i1099div) and
  [2026 1099-DA instructions](https://www.irs.gov/instructions/i1099da).
  New sparse, ambiguous and source-copy regressions failed before the fixes.
- 132 tests pass across nine parser, workspace, adapter, PDF and real DOM
  interaction files. Root, contracts and web types pass; scoped lint has zero
  errors and diff checks pass. The separate Schedule 3 rewrite temporarily has
  three stale spec references, reported to its owner; this package's reference
  resolves. The first direct Vitest PDF invocation lacked pypdf; `pnpm test` uses
  the pinned interpreter and all 12 filled-return tests now pass, including the
  actual energy worksheet integration in `968fa7b`. Prior energy UI: `c3f922f`.

## Child and dependent credit identification

- Either guided year now requires actual timely filer/spouse SSN/TIN and claimed
  child/dependent identification facts. A formatted number alone is insufficient.
  Known false remains false; it does not change a claimed CTC child into an ODC
  dependent. Joint-filer checks retain the other spouse's timely TIN requirement.
- Collected bona fide Puerto Rico residency, separate Puerto Rico and Form 4563
  income exclusions and an optional actual combat-pay election. Decimal totals
  reconcile a saved combined exclusion; a known zero can establish both zero
  components, while a positive legacy aggregate needs its actual split.
- Refreshed final [2025 Schedule 8812 instructions](https://www.irs.gov/instructions/i1040s8)
  for identification and worksheet facts. The 2026 draft is not form qualification.
  Federal input contract is `bc26ffe`; the federal owner retains explicitly
  unqualified historical API compatibility rather than inventing old identities.
- Three new source regressions failed before implementation. 490 tests pass in
  18 guided/DOM/PDF files, including actual user edits for identity, source
  confirmation, mortgage/noncash donation details and household Section B rate
  periods. Root/web types, scoped lint (zero errors), all 3,116 spec references and
  diff checks pass. Sparse source package: `81d6a37`.

## Individual clean-vehicle records

- Added guided new/used vehicle records with actual VIN, owner, acquisition and
  possession dates, binding contract/payment, accepted seller report, qualified
  amount, powertrain/component facts, personal use, transfer election/amount and
  resale/return history. Unknown values remain unanswered; known false is kept
  for the engine's disqualification or reconciliation logic.
- Prior-year AGI is omitted when unknown. A supplied zero requires actual prior
  filing status and confirmed adjustment amounts; an owner's separate prior MAGI
  is collected independently. Duplicate VINs, conflicting dates/year, impossible
  percentages and inconsistent transfer amounts block the adapter. All monetary
  comparisons and forwarding preserve Decimal cents.
- Refreshed [Form 8936 instructions](https://www.irs.gov/instructions/i8936) and
  [IRS seller-report requirements](https://www.irs.gov/credits-deductions/clean-vehicle-credit-seller-or-dealer-requirements).
  480 guided/DOM tests pass across 17 files, including model source-presence
  validation and real interactions for a transferred used vehicle, explicit zero
  prior AGI and switching to a new-vehicle category with unanswered price facts.
  Root/web types, scoped lint and diff checks pass. All guided references resolve;
  three in-progress Form 8863 references were reported to the federal owner.
  Child-credit identification package: `49e607c`. Filing qualification stays closed.

## Actual adoption records (2026-10-25)

- Source refresh: final 2025 [Form 8839 instructions](https://www.irs.gov/instructions/i8839) and [physical form](https://www.irs.gov/pub/irs-pdf/f8839.pdf), Part I identity and Parts II/III expense/benefit timing and carryforwards. No final-2026 form qualification is claimed.
- Guided collection now records actual child first/last name, birth year, SSN/ATIN/ITIN and disability; finality, foreign/special-needs classification, complete annual unreimbursed expenses, actual benefit/credit/exclusion usage, plan qualification, MAGI adjustments and carryforward origin years. Unknown answers do not become false or zero. Annual expense and carryforward edits require renewed history confirmation. Decimal strings survive adapter/model boundaries exactly.
- Child identity model fields are in federal shared contract commit `4fecf37`; physical Part I mapping is parent-owned and remains a distinct qualification task. Positive historical foreign-adoption benefits and MFS exceptions remain explicitly unsupported, without manufacturing worksheet evidence. A qualified special-needs plan or positive employer benefits requires the actual exclusion-MAGI worksheet value.
- Spec and red test written before implementation (missing adapter failed as expected). Final scoped run: 549 tests in 21 files passed, including all guided tests, actual DOM interactions, adoption calculation tests and 12 workspace PDF export regressions (`.local/upgrade-evidence/adoption-facts-tests.log`). Root/web type checks and scoped ESLint passed; all 3,146 spec references resolve. These are automated/synthetic checks, not an independent tax-professional review or release qualification.

## Business-document review cancellation (2026-10-25)

- Adoption guided package committed `a0a4e21` after the checks above.
- Added per-return explicit AI opt-in and cancellation for uploaded income, cached attached income and bank-statement review. Each request uses its own AbortSignal; cancellation, consent withdrawal, return changes and unmount suppress late success/failure updates. Cancelling while cached bytes load prevents provider dispatch. Responses merge into the latest facts so intervening manual edits and other completed analyses survive.
- The upload control now advertises PDF only, matching the existing local-redaction transport. Original files remain local; the parent-owned transport redacts text and enforces cancellation before parsing, after parsing, before fetch and after response JSON. No live provider call was made.
- Red DOM tests demonstrated all four original consent/lifecycle failures before implementation. Final focused suite: 55 tests in five files passed, including six real DOM cancellation/retry/manual-edit checks plus parent transport tests. Root/web type checks, scoped ESLint and all 3,148 spec references passed. No readiness or privacy gate was weakened.

## Individual education facts and source records (2026-10-25)

- Business-review consent/cancellation package committed `9c2fa0c`.
- Refreshed final 2025 [Form 8863 instructions](https://www.irs.gov/instructions/i8863), including Table 1, institution receipt exceptions, net adjusted expenses, prior disallowance and refundable claimant support. The new shared contracts are `2885753` and the claimed-dependent/timely-TIN correction `83b9e8f`.
- AOC and LLC now collect individual student tax IDs and actual household roles; qualification, paid-net-cost and 1098-T answers; actual institution name/address/EIN and receipt years. A saved LLC total must reconcile with actual student costs. Duplicate student credits, unmatched household IDs and conflicting taxpayer identity answers block input. Known false/zero answers survive; 2025 timely TIN and 2026 employment-SSN facts stay distinct.
- Claimable dependency and actually claimed dependency are separate. Actual claimant age comes from personal information; the interview collects full-time status, earned income, total support and living-parent answers for the under-24 refund test. Older aggregate/refund answers are preserved for reconciliation, not silently promoted. Education review displays actual individual costs once; vehicle reports and adoption source-year expenses are labeled as source amounts, not allowed credits.
- Spec/red tests preceded implementation. Final 507 tests in 21 files passed, including all guided tests, real DOM student/institution/history/support editing and parent review-PDF redaction integration (`.local/upgrade-evidence/education-final-tests.log`). Root/web type checks passed; scoped lint had zero errors (existing test warnings remain); 3,155 spec references resolve. Physical form qualification and professional review remain separate gates.

## Standard deduction actual eligibility and election (2026-10-25)

- Education source package committed `d1cc640`.
- Refreshed [Publication 501](https://www.irs.gov/publications/p501), standard-deduction eligibility, age/blindness additions, dependent worksheet and separate-return spouse rules. Shared federal model/module `7a2a95b` and election routing `cddec72` supply the calculation.
- Guided personal facts now require actual blindness, claimable dependency, death/alive status, residency and short-year answers for either supported guided year. Relevant joint/separate spouse answers stay separate. Actual death dates must be in the return year and follow birth. Dependent earned income is the actual signed worksheet amount, never a wage proxy. The supplied standard/itemized choice reaches the engine; an absent deductions section uses automatic selection.
- Education dependency/residency/election answers reconcile with the same actual personal facts. Unknown legacy personal answers stay incomplete. Synthetic unit/browser fixtures explicitly supply facts; no production default sets them. Parent's shared workspace PDF fixture received only the authorized standard-fact literal, included in its separate commit.
- Signed worksheet input now has an explicit CurrencyField option; ordinary monetary fields retain nonnegative validation. A red regression also caught negative fractional formatting changing -0.01 to +0.01; fixed while retaining exact Decimal cents.
- Spec/red tests preceded implementation. 550 focused tests in 24 files passed, including all guided, storage and workspace PDF paths; incremental new currency/cross-fact/DOM regressions passed. Root/web type checks and scoped lint passed. Our spec references resolve; global validation currently sees the other agent's unfinished Form 8801 references, so no global spec-success claim is made for this commit. Remaining full-suite and browser checks are coordinated with parent.

## Actual W-2 owner, payroll and source state (2026-10-25)

- Standard-deduction facts package committed `632452b`; optional W-2 state contract fields committed separately in `ee8d231` after contract type checks so parallel billing work can proceed without a shared-file conflict.
- Refreshed [General Instructions for Forms W-2 and W-3](https://www.irs.gov/instructions/iw2w3), actual employer identity and Boxes 1–6/15–17. Joint returns require the actual recipient. A missing payroll amount remains unknown; explicit zero records survive. The interview collects whether the source has no state section, one state or multiple states. A single source state is never borrowed from the mailing address, and multiple-state allocation remains explicitly unsupported by this single-state entry.
- Local parsing takes a state only from actual Box 15 text. Extracted owner/state values require the same confirmation as amounts. State previews and Ohio review-reference attachment now use the actual source state; an Illinois W-2 does not produce an Ohio withholding reference merely because the return is Ohio. Synthetic complete fixtures supply actual source answers separately from production defaults.
- Red DOM tests exposed late local parsing after a return change. Parsing now discards cancelled/stale results, and cancelling while cached bytes load prevents parsing from starting. Six real W-2 interaction tests cover manual blank/zero edits, source confirmation/correction, upload errors, missing source files, cancellation and return changes. A production-browser failure also exposed duplicate standard-deduction controls in the full personal section; a separate integrated DOM test failed before removing the duplicate and now passes.
- Focused source/adapter/DOM/storage/PDF run: 616 tests passed in 29 files (`.local/upgrade-evidence/w2-source-full.log`); the added personal-section regression and W-2 DOM suite passed 7/7. Root/contracts types and scoped lint pass (zero errors, test non-null assertion warnings remain). Fresh production build passes. All seven focused Chromium scenarios pass against that fresh build (`.local/upgrade-evidence/w2-browser-final.log`), covering source confirmation, an unknown estimate before confirmation, review and preserved advanced-mode output. Global spec validation passes at the package boundary; no professional review or filing qualification is implied.
- Remaining independent source work: manual NEC/investment/rental adapters still need unknown-versus-zero and actual ownership/classification coverage. Extra W-2 payroll/benefit/local boxes, multiple-state records and absent 1099 tax-adjustment fields remain incomplete capabilities and must not be treated as known zero. Federal owner is coordinating source-backed input contracts.

## Actual investment source records (2026-10-25)

- W-2 source package committed `1d3fd90`. Refreshed official [1099-INT instructions](https://www.irs.gov/instructions/i1099int), [1099-DIV instructions](https://www.irs.gov/instructions/i1099div) and [1099-B instructions](https://www.irs.gov/instructions/i1099b). Source amounts, included distribution categories, acquisition/sale dates, holding periods, basis reporting, wash-sale treatment and owners are distinct facts.
- Manual investment entries now collect those facts plus actual source-state reporting. Empty source boxes remain unknown until the taxpayer supplies zero or another amount. Started zero records survive the adapters, review and fact ledger. Payer/broker/property names have no representative fallback. Old short-term/basis/digital-asset defaults require fresh source confirmation; editing a sale invalidates its confirmation. Joint ownership and multiple-state allocation are explicitly unsupported until actual allocation facts are available.
- The adapter forwards supported Treasury, exempt-interest, capital-distribution, withholding and foreign-tax facts. Nonzero unsupported private-activity bond/bond-adjustment, return-of-capital, section 1202/897, other Form 8949 adjustment and broker-federal-withholding facts remain saved and block calculation. They are not discarded or treated as zero. Core non-W-2 SALT routing remains assigned to the federal owner; Ohio investment withholding extraction is separately assigned to the parent.
- State previews total only matching actual source-state withholding with Decimal and reject duplicate additional-source records. Review totals distinguish unknown, explicit zero and exact cents, including source cost basis and actual wash-sale disallowance. A failing ledger regression exposed a malformed-input crash; incomplete values now stay visible for source review.
- Spec and red tests preceded implementation. Final broad focused run passed 560 tests in 25 files, including guided/storage/review-PDF paths (`.local/upgrade-evidence/investment-final-focused.log`); added source-state and ledger tests pass 8/8, and real DOM input/review tests pass 4/4. Root/web types pass. Scoped lint has zero errors (169 existing test warnings); 3,278 global spec references resolve. The stale workspace-facts synthetic W-2 expectation now includes its explicit no-state-section fact. No filing or professional qualification is claimed.
- Remaining source work: NEC/Schedule C and rental owner/activity/expense facts, retirement and other-income source detail, extra W-2 benefit/local boxes, PMI allocation/qualification, and advanced foreign-income/carryover inputs. Unknown and unsupported paths remain gated while those independent packages continue.

## Actual NEC and single-business facts (2026-10-25)

- Investment sources committed `4679852`. Refreshed official [Schedule C instructions](https://www.irs.gov/instructions/i1040sc) and [Form 1099-NEC instructions](https://www.irs.gov/instructions/i1099mec): separate activities and owners, actual accounting method, source receipts and returns, cost of goods sold, other income, expense qualification and loss limitations. The currently served NEC instruction revision includes forthcoming changes; no final-2026 form qualification is claimed.
- The guided path now requires actual NEC payer/owner/federal withholding and state reporting. Missing amounts stay unknown, explicit zero records survive, and matching-state withholding is counted once. Attached source values copy only supplied fields. Receipt edits and copied source suggestions require renewed reconciliation against the records.
- One business now collects actual activity/code/EIN/accounting, receipts not already on NECs, returns, inventory cost, other income, each supported expense category, employee wages/property for QBI, participation, at-risk status, prior losses and worksheet qualifications. All money uses Decimal. Expense-only activities survive. Positive meals require the actual ordinary 50% qualification; vehicle and depreciation values require completed deductible worksheets. Review shows entered costs before tax limits instead of an inaccurate raw net-profit amount.
- Red source tests preceded implementation. The broad guided/storage/PDF run passed 566 tests in 27 files; the final source/adapter/DOM rerun passed 200 tests in three files, including seven source boundary tests for malformed/missing amounts, actual other income and matching/duplicate state withholding. Contracts/root/web types pass, scoped lint has zero errors, all global spec references resolve, and diff checks pass. These are synthetic automated checks; qualification reviews remain pending.

## Remaining facts software checklist (execution brief package 2)

Completed facts work is recorded above with sources, checks and commit references. The following are **implementation work**, not external-review blockers:

- [x] NEC document boundary: removed the legacy zero-expense preview assumption; source NECs now require the complete guided business path. Deterministic labeled-box parsing preserves unknown/zero and actual state identity, as recorded below.
- [ ] Other document adapters: audit reduced INT/DIV/B and other source schemas, actual owners/states, source versions and confirmation at the same boundary. Preserve unverified legacy source history explicitly; never use sparse imported source amounts as proof of eligibility.
- [x] Ordinary rentals: actual source use days, owner/percentage, participation/at-risk, all supported expense categories and QBI qualifications now reach the guided bridge. Zero-rent and expense-only properties survive; unknown fields remain incomplete.
- [ ] Special rental worksheets: implement actual personal-use/section 280A allocation and category carryovers, prior passive losses/credits, real-estate-professional/service/self-rental classification and Form 6198 limits. Joint interests need supported separate allocation records. These software gaps currently block the ordinary route instead of inventing facts.
- [ ] Retirement, SSA and unemployment: finish source payer/owner/state/withholding and special distribution/basis/rollover eligibility. Earlier work removed inferred taxable retirement amounts and distribution codes; that does not establish the remaining source qualifications.
- [ ] Deductions and adjustments: collect actual Form 1098 points/taxes/PMI allocation and qualification, SALT non-W-2 amounts deducted elsewhere, HSA/student-loan/self-employed-health/educator qualifications, and source-backed Schedule 1-A tip/overtime/vehicle-interest/senior facts. Earlier lender/principal/charity/date/IRA/alimony changes remain verified separately.
- [ ] Additional source forms: extra W-2 payroll/benefit/local boxes, multiple-state/owner allocation, actual unsupported investment adjustment branches, and 2026 NEC tip classifications need supported source contracts and routing. Until implemented, positive unsupported source facts must remain saved and calculation-incomplete.
- [ ] Advanced calculations: provide actual source input paths for 8801, 2555, 8815 and complete PTC; coordinate physical 5695 installation/occupancy/panel allocations and 2441 person/provider details with their form owners. Existing education, identity, adoption and vehicle controls do not imply these separate forms are complete.
- [ ] Recheck signed amounts where the source worksheet permits losses, cross-document owner/eligibility/duplicate validation, year-preserving legacy migrations and complete-flow browser cases after the remaining source packages land. Existing unknown-year, mixed-year and Decimal regressions must continue passing.

Federal calculation dependencies are coordinated separately: Schedule C line 6 and actual activity/at-risk/other-expense fields landed in `1a815e0`; the guided adapter forwards these and an independently calculated cents example verifies other income reaches profit once. Owner-separated Schedule SE landed in `c0871d3`; the guided spouse wage-base gate is now removed with an independent calculation regression, and actual Box 7 tips are required alongside Box 3 wages. The federal SALT `nonW2IncomeTaxesDeductedElsewhere` field is available for the next deduction-source package.

External completion evidence is distinct: final qualified forms/revisions, independent tax-professional expected-output review, independent security/privacy review, authorized hosted staging/recovery evidence and qualified live AI/provider results are maintained by the parent in the global checklist. Their absence does not stop the software tasks above.

## Deterministic NEC source parsing and legacy preview correction (2026-10-25)

- Business facts package committed `ea34d6b`. Added local deterministic parsing of actual labeled NEC compensation, payer/TIN, withholding and source-state boxes. Missing boxes stay omitted; supplied zero/cents/large values retain their exact source representation. Conflicting amounts stay unknown, and multiple forms require separate records. No recipient ownership is inferred and all parsed NECs remain partial until guided confirmation.
- Removed the document-only route that computed Schedule C using assumed zero expenses. Answering a free-text expense prompt cannot create actual business qualifications. Source records remain available to the guided controls from `ea34d6b`, which calculate only after actual income/expense/owner facts are supplied. The legacy fixture tests now assert that no fabricated preview is emitted; the guided path retains its independent positive calculation regression.
- Six new parser tests and two changed legacy-preview regressions failed before implementation. Final focused result: 115 tests in nine parser/adapter/ledger/storage/guided/DOM files passed (`.local/upgrade-evidence/nec-source-complete.log`). Root/contracts/web type checks and scoped lint pass. Guided spec references resolve; global validation encountered the federal owner's in-progress Schedule SE references, so this package does not claim a global spec pass. No readiness gate was weakened.
- The OID fixture expectation now explicitly preserves `sourceFactsComplete: false`, coordinated with the OID owner: its legacy imported amounts lack the actual source year, instrument and election history required by the new model. No missing OID facts were invented.

## Actual rental source facts (2026-10-25)

- NEC source boundary committed `94cc6bc`; optional rental owner/at-risk/source confirmation contract committed `6bddb79`. Refreshed official [Schedule E instructions](https://www.irs.gov/instructions/i1040se) and [Publication 527](https://www.irs.gov/publications/p527) for owner shares, actual rental/personal days, active-participation minimum ownership, expense categories and personal-use limitations.
- Ordinary rentals now collect actual property identity/type, owner and percentage, fair-rental/personal days, full-property amounts, all 15 supported expense categories, deductible vehicle/depreciation worksheets, passive/at-risk classification and QBI facts. Each edit invalidates source confirmation. No default property type, 365 rental days, zero personal use or active-participant status establishes eligibility. All monetary/percentage arithmetic uses Decimal; an independent source example verifies (100.30 minus 0.10) times 50% equals 50.10, with source amounts allocated once.
- Zero-rent and expense-only records survive adapters and review. Unknown totals remain unknown; review labels actual entered expenses before ownership allocation and tax limits. Duplicate property keys, unmatched spouse ownership, invalid days/percentages, unsupported personal use/special classifications and unresolved loss worksheets block calculation while preserving the saved facts. Parent owns Pennsylvania's corresponding owner/percentage routing.
- Six source tests failed before implementation. Final focused run passed 653 tests in 27 files, including four actual DOM interaction tests, all guided tests, workspace storage/review-PDF tests and Schedule E (`.local/upgrade-evidence/rental-focused-final.log`). The broad run exposed a malformed Schedule C source amount being swallowed by a display-only total helper; the adapter again strictly parses supplied amounts before preserving missing totals. Root/web type checks, scoped lint (zero errors, existing test warnings), all 3,321 spec references and diff checks pass. These are synthetic automated checks, not independent professional or filing qualification.

## W-2 Social Security tips and separate spouse wage bases (2026-10-25)

- Ordinary rental source package committed `fce3094`. Refreshed official [W-2/W-3 instructions](https://www.irs.gov/instructions/iw2w3), Boxes 3 and 7, and [Schedule SE instructions](https://www.irs.gov/instructions/i1040sse), Joint Returns and line 8a. Actual Social Security tips are distinct from Box 3 wages and cannot be inferred from payroll tax or another box.
- Added optional unknown-preserving Box 7 source contract, deterministic exact labeled-box parsing, uploaded suggestion confirmation, manual UI collection and both guided/document-engine forwarding. Missing/conflicting tips remain unknown; a parser result without Box 7 is partial. Guided calculations require the actual amount, including a supplied zero. Known tips are not added again to Box 1 wages. Synthetic fixtures explicitly provide zero; no missing original-source value was invented.
- Removed the temporary opposite-spouse W-2/business gate after the separate-person engine landed in `c0871d3`. An independent regression checks 100,000 business profit with the other spouse's 176,100 W-2 wages yields 14,129 SE tax, while the same owner's wage base leaves 2,678 Medicare tax. Unknown owners and payroll facts remain blocked.
- Source/owner regressions failed before implementation; parser missing/conflicting-tip regression also failed before its fix. Final focused result: 111 tests in eight guided/DOM/parser/storage/review-PDF/engine files pass, including actual zero/blank/extracted-confirmation UI changes. Root/contracts/web type checks, scoped lint, all 3,346 spec references and diff checks pass. One separate all-guided preview is currently blocked by concurrent Form 2210 integration failing to forward its actual estimated-payment dates; the payment and calculation owners are notified, and its assertion is unchanged. Final readiness and independent qualification remain closed.
