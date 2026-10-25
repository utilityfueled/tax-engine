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
- [x] Ordinary retirement: actual payer/year/owner, taxability/basis confirmation, source boxes, state/local withholding, unknown IRA migration and bounded nontaxable rollover collection are implemented, as recorded below.
- [ ] SSA, unemployment and special retirement: collect actual source recipients, benefit/payment classifications and withholding; implement full special basis/Roth/conversion/QCD/disaster/exception worksheets and document-source adapter parity. The ordinary path keeps these unresolved cases explicit.
- [x] Ordinary mortgage and SALT facts: actual source boxes, taxpayer/property/debt/payment qualifications, fully deductible purchase points, tax disbursements, annual PMI allocation and non-W-2 taxes deducted elsewhere now have explicit guided paths.
- [ ] Special mortgage worksheets and adjustments: original/refinanced debt history, average balances and full Pub. 936 limits, mixed/HELOC/reverse/property-use cases, outside-borrower allocations, prior-year interest recovery and points amortization remain software work. HSA/student-loan/self-employed-health/educator qualifications and Schedule 1-A tip/overtime/vehicle-interest/senior facts also remain. Earlier IRA/alimony work is verified separately.
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

## Non-W-2 withholding already deducted elsewhere (2026-10-25)

- W-2 tips and separate-owner package committed `b072884`. Refreshed official [Schedule A instructions, line 5a](https://www.irs.gov/instructions/i1040sca): source withholding already deducted on Schedule C, E or F must not also be deducted on Schedule A.
- Guided deductions now collect the actual non-W-2 withholding already deducted elsewhere, including explicit zero. Positive supported INT/DIV/B/NEC source withholding with unknown allocation blocks either guided year. The adapter counts each actual source once and preserves the allocation across standard/itemized elections; negative, malformed and above-source-total allocations block calculation. Source withholding is never added again to additional state/local income taxes.
- The two source regressions failed before implementation. Final focused check passed 25 tests across six guided, DOM, core-SALT and PA/OH packet files. The OH synthetic fixture now explicitly establishes zero deducted elsewhere while preserving its exact withholding assertion. Root/web types, scoped lint, all spec references and diff checks pass. Real DOM changes preserve blank, zero and `9007199254740993.01`; independent Decimal arithmetic verifies .10 + .20 + .30 + 1.00 - .10 = 1.50. Evidence: `.local/upgrade-evidence/salt-facts-final.log`, `salt-facts-types.log`, `salt-facts-web-types.log`, `salt-facts-lint.log`, `salt-facts-spec.log`.
- Remaining retirement/other-source classifications are separately tracked; no unknown source withholding or professional-review evidence was invented.

SALT package committed `a266046`. A later all-guided check exposed three older synthetic INT/DIV/B/NEC source scenarios that did not establish the allocation. Those fixtures now explicitly supply zero deducted elsewhere; their exact source-withholding, cross-state and duplicate-source assertions remain unchanged. The focused 16-test investment/business source suite passes (`.local/upgrade-evidence/salt-fixture-followup.log`).

## Actual ordinary mortgage qualification (2026-10-25)

- Source refresh: [Publication 936](https://www.irs.gov/publications/p936), qualified homes/debt, all-year balance limits, interest recoveries and purchase-point tests; [Form 1098 instructions](https://www.irs.gov/instructions/i1098), actual Boxes 1-6; [Publication 505 (2026)](https://www.irs.gov/publications/p505), restored qualified mortgage-insurance deduction. Pub. 936 remains the 2025 edition; its expired-insurance paragraph is not used for 2026. The live Form 1098 page identifies itself as the 12/2026 revision; this refresh is source observation, not final-form qualification.
- Ordinary guided loans now require actual statement year, loan reference/owner, property/use, secured acquisition-debt/payment facts, actual maximum balances and source confirmation. Box 2 stays the point-in-time source principal. The conservative ordinary bound is 750,000 (375,000 MFS) across actual maximum balances; any broader old-debt exception or debt-limit worksheet remains blocked. No average balance, joint payment share, lender or loan eligibility is inferred. Source edits clear confirmation; restored legacy statement-only records remain unverified.
- Preserved actual refund/insurance/points/tax amounts, including zero. Positive current-year purchase points require all full-deduction criteria; second-home or prior-loan points need an unsupported amortization worksheet. Actual qualified tax disbursements are distinct from escrow deposits and additional taxes. 2026 PMI forwards actual contract/provider/acquisition/home and annual allocation facts independently of Box 5; known false qualification remains false, unknown allocation remains incomplete. Expenses/review include points, taxes and actual annual insurance allocation before limits.
- Explicit remaining software gates cover refinance/HELOC/reverse and grandfathered debt, changing or mixed home use, external payers, mortgage credit certificates, prior-year refunds, above-bound balances and other special rules. The federal owner separately tracks its core debt worksheet and December 15 cutoff correction. These are not labeled external-review blockers.
- The new source tests failed before implementation. Final focused result: 588 tests in 31 guided/DOM/storage/review-PDF files pass; a subsequent seven-case source/DOM rerun covers the last points/comparison changes. Two real DOM journeys enter all ordinary source/points facts, retain large exact values, separate 1,200 reported premiums from a .10 annual allocation, preserve zero/unknown and revoke confirmation. Root/web types, scoped lint (zero errors), all 3,356 spec references and diff checks pass. Evidence: `.local/upgrade-evidence/mortgage-facts-{red,final,latest,types,web-types,lint,spec}.log`. No filing qualification or independent tax review is claimed.

## IRA checkbox routing correction (2026-10-25)

- Mortgage source package committed `91b4cd7`. Source refresh of the official [2026 Form 1099-R instructions](https://www.irs.gov/instructions/i1099r) confirms the IRA/SEP/SIMPLE checkbox is Box 7b for 2026 (beside distribution code Box 7a); the older form uses the checkbox beside Box 7.
- Fixed the guided adapter emitting `isIraSepSimple`, which the validated engine schema discarded, instead of `iraSepSimple`. An actual true checkbox now survives schema validation and routes 25,000 to Form 1040 IRA taxable income, with zero pension income. The regression failed before implementation with false instead of true.
- Final focused check: 200 tests in three guided/source files pass; web types, scoped lint (zero errors), spec references and diff checks pass. Evidence: `.local/upgrade-evidence/retirement-ira-{red,green,types,lint,spec}.log`. Remaining retirement unknown/source/owner/withholding/worksheet collection is the next package; this isolated correction does not claim that broader scope is complete.

## Actual ordinary retirement source records (2026-10-25)

- IRA routing correction committed `5bfcfcf`. Refreshed official [2026 Form 1099-R instructions](https://www.irs.gov/instructions/i1099r), source Boxes 1-11 and 14-19, and [Publication 575](https://www.irs.gov/publications/p575), taxable amounts and basis recovery. The 2026 source includes distribution code 7a, IRA checkbox 7b, Trump account 7c and excess-contribution earnings 7d; earlier forms retain their original labels.
- Ordinary retirement entry now collects actual statement year, payer/TIN/account reference, recipient, IRA/Box 2b status, confirmed taxability, all supported source amounts and retirement classifications. Unknown remains distinct from false and zero. New IRA checkboxes start unknown; legacy unchecked defaults are preserved but need explicit reconfirmation. Every source edit clears confirmation. Zero distributions and incomplete records survive the source ledger; incomplete records are no longer labeled confirmed or fully supported.
- Actual single-state and local withholding forwards from the source, independently of mailing address. The selected state's preview uses only matching withholding; state plus local amounts count once toward actual Schedule A allocation. Duplicate statements, separately duplicated state payments, contradictory saved classifications and unsupported multiple-state/local allocations block calculation. The actual recipient reaches IRA and state ownership routing.
- Ordinary codes 1/2/4/7 and confirmed nontaxable G/H rollovers have a bounded path. Positive special Boxes 3/6/8/10/7d, Trump accounts, unknown or positive IRA basis, unresolved pension taxability, taxable conversions, Roth/QCD/contribution-return/disaster/penalty-exception worksheets remain explicit **software gaps**, with original source facts retained. No source zero or basis worksheet is inferred from gross distribution or Box 2a. Direct adapter calls can preserve a missing taxable amount, but the full guided return rejects it before calculation.
- Three new source regressions failed before implementation. Final `pnpm test` passed 585 tests across 30 guided, DOM, storage and review-PDF files. Two real DOM journeys enter ordinary facts from blank controls, preserve cents/zero/unknown, collect actual state/local sources, change IRA/rollover classifications, revoke confirmation and retain unsupported facts. Root/web type checks, scoped lint (zero errors), all 3,385 spec references and diff checks pass. Evidence: `.local/upgrade-evidence/retirement-source-{red,final,types,web-types,lint,spec}.log`. An earlier direct Vitest invocation lacked the managed PDF Python dependency; rerunning through the repository test wrapper passed unchanged PDF checks.
- SSA and unemployment source collection, document-only retirement parsing and special retirement worksheets remain on the implementation checklist. These automated synthetic checks do not qualify tax filing or replace independent review.

## Social Security exclusion source contract (2026-10-25)

- Ordinary retirement source package committed `d13fbee`. Refreshed [Publication 915](https://www.irs.gov/publications/p915), Worksheet 1 line 5 and legal-beneficiary rules. Added optional `socialSecurityFacts` with separate actual Puerto Rico and American Samoa excluded income plus source confirmation; no amount or confirmation defaults. Federal addback routing is separately owned and not claimed by this contract commit.
- Spec and failing contract test preceded the schema. Four source/schema checks pass; root types and all 3,457 global spec references pass. Malformed, nonfinite and negative source amounts are rejected without throwing from `safeParse`; omitted facts stay omitted and explicit zero/false survive. Evidence: `.local/upgrade-evidence/ssa-contract-{red,green,types,spec}.log`.

## Published-table workspace expectations (2026-10-25)

- The federal source-backed Tax Table integration changed four old workspace assertions that had used rate arithmetic below 100,000. Independently checked the published 2025 single-filer rows in `tests/fixtures/tax-tables/2025.json`, extracted from the [IRS 2025 Tax Table](https://www.irs.gov/pub/irs-pdf/p1040.pdf), rather than deriving expected answers from production code.
- Actual ordinary bases 14,250, 5,250, 44,250 and 36,250 use taxes 1,475, 528, 5,075 and 4,115. The doubled capital-gain example adds 45,900 at 15% to 5,075 for 11,960. Existing penalties remain 62 and 501, producing balances 1,537 and 12,461; 5,000 W-2 withholding less 4,115 tax produces an 885 refund. Source facts, gates and penalty equations are unchanged.
- All 36 workspace-storage tests pass (`.local/upgrade-evidence/storage-published-table.log`); the scoped diff contains only independently verified expected amounts and source comments. This fixture correction is separate from the Social Security source package.

## Actual Social Security and railroad sources (2026-10-25)

- Exclusion contract committed `0b29f28`; published-table fixture correction committed `dc1e900`. Refreshed [Publication 915](https://www.irs.gov/publications/p915), legal beneficiaries, SSA/RRB statement boxes, ordinary resident taxation, lump-sum elections and excess repayments. The actual SSA-1099 or RRB-1099 source year, legal beneficiary/ID/owner, statement reference, gross benefits, repayments, signed net benefits, withholding and earlier-year amounts are now separate facts. A representative payee does not establish ownership. Another beneficiary's benefits and withholding remain saved but are excluded from this return.
- Decimal reconciliation requires source Box 3 minus Box 4 to equal signed Box 5 and preserves actual zero amounts. Unknown and legacy aggregate-only records stay unverified. Duplicate/corrected records, mismatched source years/beneficiaries and contradictory aggregates block calculation; source edits revoke confirmation. The review and fact ledger distinguish unknown totals, checked sources and actual return-owned benefits.
- The UI collects the actual current-year method or optional lump-sum election with each earlier return's filing status, spouse-living facts, signed AGI, benefits, exclusion adjustments and originally reported taxable amount. Delayed allocations reconcile exactly to source prior-year amounts. Source histories are retained across method changes and require explicit review. Two real DOM journeys cover blank/zero/cents, source edits, additional/removable records and a taxable-benefit change from 3,000 to 2,500 using independently computed prior-return facts.
- Actual Puerto Rico and American Samoa exclusions now reach the separately committed federal addback integration `2b2c3f4`. A regression independently checks 20,000 benefits, 10,000 wages and 25,000 actual exclusions produce 13,850 taxable benefits; no possession residency qualification is inferred. Nonresident/foreign statements, net excess repayments, unresolved covered-IRA interactions and both-spouse lump sums requiring separate historical households remain explicit **software gaps**.
- Spec and failing source tests preceded implementation, including a red allocation-reconciliation regression and red positive-addback regression. Final focused run: 387 tests in five source/bridge/flow/DOM files pass (`.local/upgrade-evidence/ssa-source-final-verified.log`), root/web types pass, scoped lint has zero errors, diff checks pass. A broader run passed 550 tests with 14 failures from the concurrent care owner's new W-2 Box 10 fixture requirement; that owner is updating those explicit synthetic facts. Global spec validation resolves all SSA references and reports only the parent's in-progress PA rental test reference. No full-suite, independent review or filing qualification is claimed by this package.

- Commit-boundary review found that the zero-context shared-file staging patch in `e66fa3d` misplaced the SSA validation and railroad converter declaration even though the working tree passed. The immediate correction restores their tested positions using a full-context patch and leaves concurrent care/rental work untouched. An isolated archive of `e66fa3d` plus that exact correction passes 384 source/bridge/flow/DOM tests and both root/web type checks (`ssa-isolated-tests.log`, `ssa-isolated-types.log`, `ssa-isolated-web-types.log`). Future shared-file commits use independently constructed full-context patches and inspect the staged snapshot; working-tree checks alone are insufficient.

- The parent's immutable full-suite run identified three remaining document-engine preview expectations using the same obsolete rate arithmetic. Their actual ordinary income bases match the independently checked published rows above; corrected tax, unchanged 62/501 penalties and 885 wage refund consistently. All 20 preview tests pass (`.local/upgrade-evidence/preview-published-table.log`), with source-row comments and no gate or source-fixture changes.

## Actual government-payment sources (2026-10-25)

- Social Security placement correction committed `003609d`; published-table preview fixtures committed `914a692`. Refreshed official [Publication 525](https://www.irs.gov/publications/p525), unemployment program classifications, after-tax contributions and current/prior-year repayments; the [March 2024 continuous-use 1099-G instructions](https://www.irs.gov/pub/irs-prior/i1099g--2024.pdf) and [source form](https://www.irs.gov/pub/irs-prior/f1099g--2024.pdf); and the currently served [December 2026 instructions](https://www.irs.gov/instructions/i1099g). The latter source revision adds family-leave Box 10 and renumbers state boxes. Recording that observed revision is not final-2026 form or filing qualification.
- Replaced the invented government payer and implicit zero withholding with separate actual payer/TIN/reference, recipient/ID/owner, year/revision, source boxes, program, receipt, repayment/contribution and state facts. Missing values remain unknown; actual zero and large cents use Decimal. Source edits clear confirmation; duplicate/corrected records, conflicting saved totals and separately duplicated withholding block calculation. The selected state's preview and Schedule A allocation use the actual source state once, independent of mailing address.
- Ordinary confirmed government unemployment now reaches Schedule 1 line 7 with its actual source withholding. Positive refunds, RTAA/grants/agriculture/market/family-leave amounts, repayments and unrecovered after-tax contributions remain saved with explicit **software worksheet gates**. Employer supplemental, private/union and other programs need distinct routing. These are remaining implementation tasks, not external-review blockers; no gross amount is silently netted or reclassified.
- Added a red-first preservation regression for legacy SSA/government aggregate amounts hidden behind empty source arrays. Both positive and explicit-zero legacy values now remain visible and unverified instead of being dropped. Entirely empty source records no longer manufacture zero totals.
- Final focused `pnpm test`: 606 tests in 34 files pass, including all guided tests, two real government-source DOM journeys, SSA DOM checks, workspace storage and review-PDF integration (`.local/upgrade-evidence/unemployment-source-final.log`). Root/web types pass, scoped lint has zero errors, and diff checks pass. New government spec references resolve; global validation reports only the parent's concurrent Schedule A line 9/Form 4952 renamed-test reference. Evidence includes source red/green, empty-legacy red, final/types/web-types/lint/spec logs. Independent review and filing gates remain closed.
- Next facts implementation: sparse deterministic document parsing and document-to-engine parity; actual IRA compensation/Roth/501(c)(18) facts after the core contract lands; remaining adjustment and special source worksheets from the checklist. The ordinary source work does not complete those broader categories.
- Commit-boundary verification: an isolated archive of HEAD plus the exact staged government package passes root types and 390 source/bridge/flow/DOM tests, excluding concurrent IRA, investment-interest and care-PDF edits (`government-isolated-types.log`, `government-isolated-tests.log`).

## Sparse W-2 document facts and dependent-care benefits (2026-10-25)

- Government-payment source package committed `d90addb`. Refreshed official [W-2/W-3 instructions](https://www.irs.gov/instructions/iw2w3), actual Boxes 1-10 and source identity. Box 10 represents reported benefits; it does not itself establish the allowable Form 2441 exclusion.
- Red regressions exposed a missing employer name copied from the next field label, an unrelated identifier reused as employer EIN, conflicting Box 4 copies arbitrarily reduced to the first amount, discarded known wages when Box 2 was blank, and actual Box 10 omitted entirely. Replaced amount ranking and nearby-text guesses with explicit labeled single-box values or exact two-column source layouts. Conflicting or ambiguous fields stay unknown, repeated identical numeric representations reconcile with Decimal, and source identity is accepted only from its own label.
- Added unknown-preserving Box 10 and parser-version contracts, source extraction, suggestion sanitization, per-field guided confirmation/manual-provenance clearing and document-engine forwarding. Document-only calculation requires actual Boxes 7/10; positive benefits direct the return to the guided Form 2441 qualification path. Old parsed records cannot bypass that source review through schema defaults. Complete synthetic fixtures now explicitly supply zero tips/benefits without altering their monetary assertions.
- The focused parser/source/DOM/engine/storage/ledger run passed 130 tests in nine files; the final six-source-regression plus parser/DOM rerun passed 21 tests, followed by six latest boundary checks. Actual UI interactions preserve blank, zero and `9007199254740993.01` and require copied Box 10 confirmation. Root types passed before a concurrent IRA integration edit; scoped lint has zero errors and all 3,498 spec references resolve. Web types initially reported only the federal owner's in-progress passive-loss property mismatch; final isolated commit-boundary checks are recorded below. Evidence: `.local/upgrade-evidence/w2-document-*.log`.
- This closes the identified W-2 sparse-box loss, not all document-source parity. Complete recipient identity, other unsupported W-2 boxes and additional ordinary/special form adapters remain on the facts implementation checklist; actual guided source qualification remains required where the reduced document contract is insufficient.
- Final working-tree root/web/contracts type checks pass after the concurrent IRA correction. The global spec check and final parser/DOM checks remain green; no coverage threshold or test timeout was changed.
- Exact commit-boundary archive of HEAD plus the staged package passes 132 tests in nine files and both root/web type checks, without concurrent IRA/investment-interest source edits (`w2-source-isolated-tests.log`, `w2-source-isolated-types.log`, `w2-source-isolated-web-types.log`).

## Actual IRA compensation and contribution sources (2026-10-25)

- Sparse W-2 package committed `3c057f6`. Refreshed official [Publication 590-A](https://www.irs.gov/publications/p590a), compensation, lower-earner spousal limits, section 501(c)(18), designated-year timing and catch-up age. Uses the federal owner's source contract and corrected worksheet in `fa37e8d`; actual compensation is after each person's allowed self-employment tax/retirement deductions and before joint lower-earner allocation. No wage or AGI proxy is used.
- Guided IRA intake now collects actual primary/spouse traditional, Roth and section 501(c)(18) contributions, separate eligible compensation, employer-plan coverage, designated tax year, paid/timely status and source confirmation. Unknown stays unknown; actual zero/false and very large cent amounts survive exactly. Joint returns require both source sets. Saved spouse amounts stay visible and require reconciliation after a filing-status change. Legacy deduction-only and incomplete contribution records remain unverified.
- Each IRA source edit clears confirmation, as do changed payroll, business or retirement facts. Removed year-subtraction age overrides: the engine now receives the actual date of birth and correctly recognizes January 1 catch-up birthdays. Unresolved rollover/recharacterization/returned/excess contribution worksheets, NOL/passive-loss/current-IRA-distribution/lump-sum SSA coordination remain explicit software gaps, not invented completed worksheets.
- Five new source regressions failed before implementation. All 565 tests in 33 guided/DOM files pass, including two real entry journeys for blank/zero/large Decimal values, false coverage, joint-source separation, changed tax years, removal and confirmation invalidation. Root types pass; scoped lint reports zero errors. The new spec references resolve; the global check observed only a concurrent investment-interest test-name mismatch. Final isolated commit-boundary checks follow below. Evidence: `.local/upgrade-evidence/ira-guided-{sources-red,sources-green,final,types,web-types,lint,spec}.log`. No independent review or filing qualification is claimed.
- Exact staged archive passes all 565 guided/DOM tests and both root/web type checks (`ira-guided-isolated-tests.log`, `ira-guided-isolated-types.log`, `ira-guided-isolated-web-types.log`), independently of concurrent Form 4952/5695/PA changes. The working web check initially caught a flow-narrowing defect; it was fixed before these isolated checks.

## HSA actual ownership and source offset routing (2026-10-25)

- IRA facts committed `6eb3747`. Refreshed official [Form 8889 instructions](https://www.irs.gov/instructions/i8889), Death of Account Beneficiary and Name/SSN: an inherited HSA belongs to its surviving beneficiary, who may be either the primary taxpayer or spouse on this return. Relationship to the decedent does not establish a local return-owner label.
- Removed the schema restriction rejecting an actual primary surviving beneficiary and the helper's inferred spouse ownership. Explicit spouse sources/drafts now require actual spouse context; removing a spouse cannot silently relabel their sources as primary. Actual owner drives age exceptions: a primary survivor under 65 with a current spouse over 65 retains the 480 additional tax on a 2,400 ordinary distribution. Missing owner remains unattributed; 2026 calculation rejects it, including zero-amount records. The old untagged 2025 single-filer core compatibility path remains explicitly unqualified and is not promoted by the document UI.
- Document previews require an actual owner on every source and safely decline invalid restored records. Confirmed rollover/medical offsets remain separate for each actual owner. A partly confirmed owner group cannot create a complete offset by silently treating missing amounts as zero; all known primary/spouse groups are retained independently. Source and offset amounts use Decimal. The reduced preview contract does not establish complete contribution eligibility or special HSA qualification.
- Five core and three adapter regressions failed before implementation. Updated six historical federal fixtures and source/summary fixtures with explicit synthetic owners/context, preserving their monetary and reference-only assertions. The final 668 tests in nine federal/HSA/adapter/preview/storage/PDF files pass; root types pass, scoped lint has zero errors. Own spec references resolve; global validation reports only the federal owner's three in-progress AMT references. Evidence: `.local/upgrade-evidence/hsa-owner-{red,green,adapter-red,adapter-green,full-initial,final,types,lint,spec}.log`. Exact staged verification will be recorded below.
- Remaining software: full guided HSA contribution and distribution sources, eligibility/month history and special worksheets; the raw guided HSA deduction cannot establish those facts. No tax-filing qualification, completed independent review or final 2026 physical form is claimed.
- Exact staged archive passes 668 tests, root/web types and all 3,505 spec references (`hsa-owner-isolated-tests.log`, `hsa-owner-isolated-types.log`, `hsa-owner-isolated-web-types.log`, `hsa-owner-isolated-spec.log`), excluding concurrent AMT/energy edits.


## HSA contribution method and recapture correction (2026-10-25)

- Ownership package committed `b9071db`. Refreshed [Form8889 instructions](https://www.irs.gov/instructions/i8889), [Publication969](https://www.irs.gov/publications/p969) and the [printed2025form](https://www.irs.gov/pub/irs-pdf/f8889.pdf). Actual `useLastMonthRule:false` now retains the monthly method through source merges; true permits the December rule. Missing2026choice blocks a materially different limit. Historical omitted2025choices remain explicitly unqualified compatibility.
- Fixed an independently identified line21error: the printed form applies10%to line20, including both recapture sources. Actual4200total yields420tax;1500.10funding-only recapture yields150.01. Positive2026last-month recapture without an actual redetermined limit/worksheet now blocks instead of producing zero, while the actual death/disability exception remains supported. Monthly annual limits are summed before dividing by12, eliminating the artificial2200.0000000000000001six-month result.
- Four new source regressions failed before implementation.586focused tests in six engine/federal/PDFfiles pass; the prior federal expectation was corrected from270to420without changing source amounts. Root types/spec validation pass; isolated staged validation recorded with the commit. Evidence: `.local/upgrade-evidence/hsa-election-*`.
- Actual guided eligibility/contribution/history intake is the next software package. Full prior testing-history qualification and source coverage details remain required. A proposed January1age interpretation has no direct HSA-specific source established yet; no age-rule change or professional qualification is asserted.


## Year-specific educator expense limit (2026-10-25)

- HSA method/recapture correction committed `b1488d4`. While source collection continues, official [Rev. Proc. 2025-32 section 4.12](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf) revealed the existing Schedule 1 helper still applied the 2025 $300 cap to 2026. The 2026 per-educator cap is $350.
- Extracted the small educator deduction helper and applied separate actual-year caps to each spouse on a joint return. A legacy aggregate still establishes at most one person's limit; it cannot establish two eligible educators. Zero remains zero, cents below the cap stay exact, and negative net costs cannot become a negative deduction. The 2025 calculation remains $300 per eligible educator.
- Official-source spec and two failing boundary regressions preceded the correction. All 107 tests in the focused helper/Schedule 1 suite pass; root types and scoped lint pass. The shared-tree spec check finds only the parallel HSA Form 5329 PDF reference still being implemented; no shared-tree spec-success claim is made at that point. Exact staged validation is recorded below.
- This indexed correction does not establish educator eligibility or the separate 2026 excess-educator itemized deduction. Actual owner/role/hours/qualified-cost/reimbursement/education-benefit sources remain the next guided adjustment package, while the federal owner coordinates the itemized rule.
- Exact staged archive passed the same 107 tests, root type checking and all 3,582 spec references (`educator-limit-isolated-*`); the 2026 full-return readiness gate stays closed. No independent professional review is claimed.

## HSA contribution and owner-source intake (2026-10-25)

- Educator indexed-limit correction committed `472a190`. Refreshed [Form 8889 instructions](https://www.irs.gov/instructions/i8889) for first-day monthly eligibility, spouse family treatment, contributions, the employer worksheet and actual testing-period history.
- Replaced the raw guided HSA deduction with actual owner worksheets. Every month records HDHP coverage, Medicare and other disqualifying coverage; dependency reconciles with the household. Personal payments, W-2 code W, prior/following-year employer adjustments, source year, contribution timing, method choice and source confirmations remain distinct. The explicit copy-months action copies only answers already supplied by the user. Unknowns never become no-coverage or zero by default.
- Each owner now supplies the actual prior excess source year, prior excess, prior additional tax and year-end HSA value. These bind to the federal owner's separate Form 5329 contract instead of combining spouses' tax bases or account values. A saved estimate is retained for reconciliation but is not an allowed deduction. A changed payroll or household source invalidates confirmation.
- Actual testing failures preserve dates, rule type, applicable contribution/funding history and exception answers. Turning off the applicability answer cannot silently discard saved history; clearing it is explicit. Different spouse coverage patterns, separate-return spouse allocations, current qualified funding/MSA, correction relief and distributions still require their source worksheets. They remain saved and calculation-incomplete pending the following package.
- W-2 code W source suggestions now require confirmation just like the other actual payroll boxes; manual corrections remove suggestion provenance. Empty and explicit zero remain different. The two stale HSA edge assertions now use the printed line 21 formula, 10% of line 20, including funding recapture; source amounts are unchanged.
- Spec-linked red tests preceded each boundary change. The first broad run passes 600 tests in 38 guided/core/DOM files; the source/W-2 additions receive a final focused and exact-staged check below. This is automated synthetic evidence, not professional qualification or final 2026 form evidence.
- Final working-tree focused run passes 666 tests. After the separate-owner core commit `104bca4`, an exact staged archive passes 671 tests in 42 guided, DOM, HSA engine and PDF files, root/web type checks and all spec references. Scoped lint has zero errors. Logs: `.local/upgrade-evidence/hsa-guided-{final,isolated-tests,isolated-types,isolated-web-types,isolated-spec,final-lint}.log`. New ordinary-distribution files remain outside this contribution commit and are verified separately.

## Remaining facts convergence matrix (updated 2026-10-25)

This narrows the older checklist above to the actual currently enabled routes and identifies work that is still implementable. None of these rows is an external-review substitute.

| Route / next package | Actual software work still required | Dependency / current behavior |
| --- | --- | --- |
| HSA contribution intake | Ordinary actual-owner/month/history intake completed in `ed5cae9`, with separate-owner core `104bca4`; special correction, mixed-family allocation and funding histories remain explicit source worksheets | Ordinary source and independent staged tests pass; final whole-release evidence remains parent-owned |
| HSA distributions | Ordinary codes1/3 actual statements and dated-event allocation completed in `b8e995a`; correction/death/MSA/prohibited-transaction and leap-day exception boundaries remain explicit software/source gaps | Known medical/rollover/age/disability amounts remain separate; no favorable special treatment is invented |
| Existing student-loan, educator and self-employed-health fields | Student-loan actual source intake/core/canonical routing complete in `d162f6c`, `3fbaf48`, `ed915c1`. Educator expanded eligibility core is `8c476b4`; the actual facility, role and receipt-funding intake is verified below. Education-exclusion source reconciliation remains federal-owned. SE-health still needs actual plan/month/owner/business sources and canonical income/PTC limits | Expanded educator intake is ready for its scoped commit; SE-health source work continues next. Historical LTC caps are corrected in `8f7c622` |
| Mortgage source worksheet | Actual original-loan paid shares, highest/lender-average debt methods, current purchase-points dates/qualifications, year and all-debt confirmation are committed in `ffdb3e2`; published-ratio fixture reconciliation is `f309369` | Advanced refinancing/category history, other balance methods, amortization and prior-year recovery intake remain explicit software routes; no unsupported source is presumed zero |
| Schedule 1-A | Collect actual tips, overtime, qualifying vehicle debt and senior identity/exclusion facts represented by the engine | Core source contracts exist; guided source path still missing, so no inferred eligibility or deduction may be emitted |
| Sparse document previews | Audit every remaining reduced INT/DIV/B/retirement/government/HSA summary against its actual engine source requirements, confirmation and year; preserve unsupported positives | W-2/NEC missing-value parsing is corrected; OID actual-source collection is assigned to parent; document-only qualification remains limited |
| Cross-document and legacy checks | Recheck duplicate ownership/allocation, household/dependency contradictions, actual selected state versus mailing state, signed source amounts and year-preserving reopen/migration paths | Parent owns selected-state routing correction; completed Decimal and unknown-year regressions must stay green |
| Already collected source branches | Reconcile current education/529, care, energy, adoption and vehicle source contracts with the latest model changes | Education529 and energy physical details belong to the AI/form agent; care source/PDF and state adapters belong to parent; avoid duplicate facts |
| Explicit special worksheet gaps | Complete or retain precise unsupported routes for retirement basis/Roth/conversion/QCD/disaster, mixed-use/280A/passive/at-risk rentals, refinance/HELOC/points debt limits and advanced foreign/PTC/carryovers | These are separate core/source worksheets, not ordinary-source blanks that can be defaulted. Route qualification requires actual complete inputs and owner review |

After these source packages, rerun complete-flow browser/reopen/delete cases, adapter tests, all type checks and global gates on a stable committed snapshot. Missing independent human reviews, hosted credentials/approvals and qualified provider evidence remain separate parent-owned completion blockers.

## Actual HSA distribution records and taxable exceptions (2026-10-25)

- Contribution source package committed `ed5cae9`. Refreshed the final [2025 Form 1099-SA instructions](https://www.irs.gov/pub/irs-prior/i1099sa--2025.pdf) and [Form 8889 instructions](https://www.irs.gov/instructions/i8889), actual Boxes 1–5, medical expenses, rollover timing and Part II exceptions. This is source evidence for calculation rules; no final 2026 physical-form qualification is claimed.
- Guided owner worksheets now collect original statement year, recipient, payer/TIN, distinguishable account reference, account type, distribution code, gross amount and included Box 2 earnings. Dated events must reconcile exactly to Box 1. Actual medical-expense eligibility and nonduplication answers, rollover receiving date, same-owner status and preceding twelve-month history establish exclusions. Known false answers retain source costs while excluding no unsupported amount; missing answers block. Source edits revoke confirmation and an applicability change cannot silently discard records. Duplicate account/source ownership is rejected across spouse worksheets.
- The source audit reproduced a calculation error: 1,000 of fully medical code-3 disability distributions plus 1,000 of taxable ordinary withdrawals incorrectly produced no additional tax. Added actual `disabilityExceptionTaxableDistributions`, preserved through the source merge, bounded by code-3 gross and total taxable distributions. Actual event balances now produce the correct 200 additional tax; post-age-65 event exceptions exclude disability events so they are not counted twice. The 2026 mixed-code path requires actual allocation; omitted 2025 allocations remain explicitly unqualified compatibility.
- Source and core regressions failed before implementation. The first broad run passes 802 tests in 48 guided, DOM, HSA engine and PDF files; root/web type checks and scoped lint pass. A further cross-owner duplicate regression failed and then passed after correction. Final exact-staged evidence follows below. Logs: `.local/upgrade-evidence/hsa-distribution-{binding-red,binding-green,duplicate-red,duplicate-green,full,types,web-types,lint}.log`.
- Ordinary HSA codes 1 and 3 are represented. Code-2 correction origin/timing and relief, death/prohibited-transaction/MSA sources, multiple-rollover qualification and the exact age-65 boundary for a leap-day birthday remain explicit software/source limitations. Their facts are saved and no favorable ordinary treatment is substituted. The remaining enabled raw student-loan, educator and self-employed-health fields are the next adjustment package.
- Exact staged archive passes 1,257 tests in 49 files, including the complete federal integration suite, root/web types and all spec references (`hsa-distribution-isolated-*`). The federal agent's independent narrow code review found no actionable issue in the known-net-zero, support-bound and mixed-source guard path. Historical manual exception aliases remain unverified; this code review is not independent professional tax qualification.

- HSA ordinary-distribution source package committed `b8e995a`. Reconciled four stale full-suite assertions with the already committed source contract: omitted Box 2 remains unknown, an actual primary surviving beneficiary is valid, and a surviving-spouse relationship without an actual owner stays unattributed. Original gross distributions and offset amounts are unchanged. The two recapture assertions were already corrected in `ed5cae9`; no production logic or test gate changes are included in this fixture follow-up. All 118 affected adapter and HSA edge tests pass (`.local/upgrade-evidence/hsa-legacy-source-expectations.log`).


## Actual educator adjustment sources (2026-10-25)

- HSA fixture follow-up committed `4b5cacb`. Refreshed [2025 Form 1040 Schedule 1 line 11 instructions](https://www.irs.gov/instructions/i1040gi), [Topic 458](https://www.irs.gov/taxtopics/tc458), IRC 62(a)(2)(D)/(d) and [Rev. Proc. 2025-32 section 4.12](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf). School-year hours and calendar-year paid expenses are distinct. The 2026 income-adjustment limit is $350 per person; the separate expanded itemized rule is not implied by these sources.
- Added an educator interview route and actual owner, tax year, school year, school roles/hours, dated receipts and expense qualifications, reimbursements outside wages and actual section 135/529/530 exclusion worksheet amounts. Missing values remain unknown and explicit zero/false remain supplied. Source costs that fail qualification remain saved with a calculated zero. Same-owner expenses are capped once; spouse sources require a joint return. Duplicate receipts, mismatched years, missing qualifications and unexplained legacy totals block calculation.
- The guided bridge no longer assigns an educator aggregate to the primary taxpayer. Positive 2026 raw engine claims require actual sources; historical 2025 raw compatibility remains explicitly unverified. Source edits and changed household, payroll, education or investment facts revoke confirmation. Review displays paid costs and unknown values separately from an allowed deduction.
- Source specs and red core/adapter/DOM tests preceded implementation, including a red route test showing that educator-only households previously could not reach adjustments. Final working-tree focused run passes 1,176 tests in 45 files, including all guided tests and federal integration. Root/web types and all 3,665 spec references pass; scoped lint has zero errors. Logs are in `.local/upgrade-evidence/educator-*`. Exact staged verification follows below.
- Remaining coordinated software: reconcile actual exclusion reductions with final Form 8815 and the new per-recipient Form 1099-Q education-excluded earnings results; establish source allocation on joint returns; implement the 2026 section 67 itemized educator rule separately. Collection accepts explicit worksheet amounts and does not copy gross Form 1099-Q distributions or transfer proceeds. No professional review, final 2026 physical form, or filing qualification is claimed. Student-loan and self-employed-health source corrections follow.

- Exact staged archive passes all 1,176 tests in 45 files, root/web type checks and all 3,665 spec references. Scoped lint reports zero errors (12 warnings, including pre-existing shared-file warnings and test non-null assertions). Reviewed the staged diff and whitespace check; logs: `.local/upgrade-evidence/educator-isolated-{tests,types,web-types,spec,lint}.log`. The archive excludes other agents' in-progress browser and education-distribution changes.

## Form 1098-E actual Box 2 meaning (2026-10-25)

- Educator source intake committed `b4be8d6`. Refreshed the [final 2025 Form 1098-E/1098-T instructions](https://www.irs.gov/pub/irs-prior/i1098et--2025.pdf) and [current 2026 instructions](https://www.irs.gov/instructions/i1098et). Checked Box 2 means Box 1 excludes origination fees or capitalized interest for a loan made before September 1, 2004. The earlier model, audit and reference PDF described the opposite meaning. The reporting threshold is $600 or more; a reported amount still does not establish deduction eligibility.
- Added the actual optional checkbox and supplied source/year/borrower/owner metadata. Missing answers remain unknown; the older incorrectly named flag is retained as unverified without reinterpretation. Updated adapter wording, core audit and reference summary. The reference PDF displays unknown explicitly and reserves enough vertical room for the longer source explanation. No additional interest is invented or added by the checkbox.
- Spec and three failing source/adapter/PDF regressions preceded implementation. All 125 affected engine, adapter, edge and PDF tests now pass, including text extracted from the rendered reference PDF. Root and contract type checks pass; staged evidence follows. Original lender amounts, numeric assertions and reference-only readiness gates remain intact. Actual loan qualification, benefit reductions and canonical MAGI remain the next student-loan source package, not implied by this informational correction.
- Exact staged archive passes all 125 tests in seven files, root and contract type checks, and all 3,676 spec references (`student-loan-box2-isolated-*`). Scoped lint has zero errors and the staged diff/whitespace check passed. Other agents' in-progress source, state and browser work was excluded from this evidence.


## Actual student-loan source worksheet (2026-10-25)

- Form 1098-E source meaning correction committed `224b2ed`. Refreshed [Pub. 970 chapter 4](https://www.irs.gov/publications/p970), [Topic 456](https://www.irs.gov/taxtopics/tc456), Schedule 1 line 21 instructions and year-specific phaseouts. Actual claimed dependency, legal obligation and qualification when borrowed are separate facts; a current household label or lender Box 1 does not establish them.
- Added a pure, Decimal source worksheet and optional source contract. Actual borrower/owner, loan date, lender, paid interest and payment-year confirmation, original education qualifications, excluded assistance and interest deductible elsewhere are preserved individually. Several loan allocations may reconcile to one actual Form 1098-E, but every original Box 1 and linked expense must reconcile exactly once. Additional pre-2004 interest requires actual checked Box 2 plus a separate qualified allocation; no amount is inferred from the checkbox.
- Actual education expense IDs link to the calculated Form 1099-Q per-expense vector from `2f8abd7`. Only tax-free earnings used for that loan's interest reduce interest, never principal or a borrower's unrelated loan payment. Missing or contradictory source links, overlapping benefits and impossible claims block source verification. Explicit zero, known ineligibility and missing facts remain distinct.
- Source validation can run before canonical return MAGI exists: it returns an incomplete calculation and no proposed deduction. Given actual complete MAGI, the worksheet applies the $2,500 cap once and the selected year/status phaseout. Federal orchestration and guided source collection follow separately; this core package does not claim an enabled end-to-end deduction or professional qualification.
- Source/spec regressions failed before implementation. Parent's independent bounded code review found one real guard gap: a supplied negative or NaN legacy amount was ignored. The new red regression reproduced it, and every supplied legacy amount now requires a finite nonnegative decimal, including explicit zero. Added split-statement, duplicate/year/owner/date and exact-cent boundaries. Exact staged verification is recorded below.
- Exact staged archive passes 127 tests in five engine/source files, root type checking and all 3,688 spec references. Scoped lint and staged whitespace checks have zero errors. Logs: `.local/upgrade-evidence/student-loan-sources-isolated-{tests,types,spec,lint}.log`. The initial archive test invocation required the existing pinned PDF Python path; rerunning with that explicit path passed. Concurrent mortgage, guided UI and reference-PDF changes were excluded.

## Actual student-loan guided source collection (2026-10-25)

- Source worksheet committed `d162f6c`. Guided intake now collects the actual claimant, borrower, owner, lender, origination qualifications, payment year, original Form 1098-E details and each distinct benefit reduction. A saved gross-interest total must reconcile to the source ledger; it is not forwarded again as additional interest. Missing amounts and eligibility answers remain unknown, including the original Box 2 checkbox; explicit zero and false survive.
- Education loans link to the actual borrower and expense records already entered in the education ledger. The bridge recalculates the source vector before validating the loan facts, reconciles dependency answers across worksheets and rejects contradictory or unconfirmed links. Changing only confirmation metadata no longer creates a confirmation cycle between educator, student-loan and education sources. Actual source edits still revoke the relevant confirmations.
- The UI preserves incomplete saved statement details until the user explicitly clears them. Review displays paid source interest before qualification, the annual cap and income phaseout. A new end-to-end regression first exposed the missing canonical federal connection: an actual 1,200.15 lender-statement source was dropped. After the coordinated federal integration, its exact expected 1,200 deduction and 48,800 AGI pass without changing the original source amount.
- All 624 guided/helper/DOM tests in 44 files pass in the working tree, along with root and web type checks. The parent independently reviewed the helper, UI, bridge and flow and reported no additional actionable findings; this is bounded agent review, not professional tax review. Logs: `.local/upgrade-evidence/student-loan-guided-final.log`, `student-loan-guided-final-types.log`, `student-loan-guided-final-web-types.log`, and `parent-student-loan-ui-review.log`. Exact staged verification follows after the federal dependency is committed. Mortgage source-worksheet binding and self-employed-health intake remain independent implementation work.
- Canonical integration committed `3fbaf48`. The dependent UI's exact staged archive passes all 624 tests, root/web type checks and all 3,722 spec references. Scoped lint has zero errors (39 existing/shared-file and test non-null warnings); staged diff and whitespace review passed. Logs: `.local/upgrade-evidence/student-loan-guided-isolated-{tests,types,web-types,spec}.log` and `student-loan-guided-final-lint.log`. The archive excludes in-progress mortgage, education corrections and parent work.

## Guided mortgage source-worksheet binding (2026-10-25)

- Student-loan intake committed `ed915c1`. The actual mortgage core contract is `0433c87`. Refreshed [Publication 936](https://www.irs.gov/publications/p936), Average Mortgage Balance, Table 1, points and recovery rules. The highest annual balance is an allowed method; an actual lender average is separate. Original Box 2 is preserved and never substituted for either method.
- Guided intake now collects actual return and other-return payment shares, distinct current-interest reductions, points allocations and fees, annual balance method/reference, points payment date and purchase/build use. Qualifying seller-paid buyer points belong in the buyer's actual allocable share, with all required conditions; they are not automatically assigned to another return. Potential 2017 binding-contract transition loans require actual applicability and dates. Unknown source amounts remain unknown; exact zero and large cents survive.
- Original Form 1098 year/identity and pre-default completeness are validated through the model. The complete home-debt worksheet requires an actual source year/reference, all-debt confirmation and known no earlier-year recovery for this ordinary route. Payment shares reconcile to original Boxes 1 and 6. Actual source amounts reach the canonical calculation once: a 40,000.10 statement containing a 30,000.10 taxpayer share and a 1,000,000 highest balance yields 22,500 allowed interest, not the reported gross amount. A supported debt above the limit is calculated by the worksheet rather than rejected solely for its size.
- Source/DOM specs and failing regressions preceded implementation. Added full-return 100,000 income / 22,500 deduction / 77,500 taxable-income verification, seller-paid points, source conservation, known zero versus missing, confirmation invalidation and legacy-source preservation. A regression also caught known prior-year refunds disappearing after switching to standard deduction; these now remain an explicit recovery-source blocker. The existing synthetic fixtures gained actual worksheet facts, with monetary assertions preserved except canonical decimal formatting and the formerly unsupported debt path now tested against the official limit.
- Working-tree verification passes 639 tests in 46 guided/core/DOM files, root/web type checks and all 3,758 current spec references. The only engine edit narrows the mortgage function's type to the actual fields it consumes, allowing source validation without fabricated taxpayer identity. Logs: `.local/upgrade-evidence/mortgage-guided-{worksheet-red,dom-red,recovery-red,conservation-red,final,final-types,final-web-types,final-spec}.log`. Exact staged verification and independent bounded review follow.
- Remaining mortgage software is specific: completed refinancing/category histories, other published balance methods, ratable/completed points and prior-year tax-benefit recovery intake. Those sources remain saved and blocked where the ordinary interface cannot establish them. This package does not claim final 2026 forms, professional review or filing readiness. New educator eligibility fields and actual self-employed-health sources are the next adjustment packages.
- The exact staged archive passes all 639 tests in 46 files, root/web type checks and all 3,741 staged spec references. Lint over every staged TypeScript file reports zero errors (213 existing/shared-file and test warnings), and the staged diff/whitespace review passed. Parent independently reviewed the source mapper and ran the six mortgage helper/DOM cases without actionable findings; that bounded review is not professional tax qualification. Logs: `.local/upgrade-evidence/mortgage-guided-isolated-{tests,types,web-types,spec,lint}.log` and `parent-mortgage-educator-review.log`. Concurrent educator, unemployment and education-distribution changes were excluded from the archive.

- Mortgage intake committed `ffdb3e2`. Reproduced the two older CI fixture failures, then reconciled them to [Pub. 936 Table 1 lines 14–15](https://www.irs.gov/publications/p936): 375,000 / 400,000 rounds to .938 before multiplication, so unchanged 12,000 interest gives 11,256. The 2026 deduction-election fixture now supplies explicitly synthetic source-year, original boxes, payment and annual debt facts; its 16,100 standard and 15,608 limited-itemized expectations remain unchanged. All 60 affected mortgage/MFS/standard-deduction checks pass (`mortgage-legacy-fixtures-{red,green}.log`). This fixture-only follow-up changes no tax formulas or gates.

## Historical long-term-care premium limits (2026-10-25)

- Mortgage fixture reconciliation committed `f309369`. Research for actual Form 7206 source collection found four incorrect 2025 long-term-care premium caps. [Rev. Proc. 2024-40 section 2.28](https://www.irs.gov/pub/irs-drop/rp-24-40.pdf) and [final 2025 Form 7206 line 2](https://www.irs.gov/pub/irs-pdf/f7206.pdf) independently give 480/900/1,800/4,810/6,020 for the five attained-age brackets. Corrected the older 890/1,790/4,770/5,960 values. The independently indexed 2026 values remain 500/930/1,860/4,960/6,200 from [Rev. Proc. 2025-32 section 4.27](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf).
- Updated the source specification before adding eight age-boundary/year regressions; seven failed against the old constants. Corrected the historical expected limits and downstream arithmetic without changing premium sources. In particular, actual 6,000 at age 71 remains 6,000 because it is below the corrected 6,020 cap. All 82 affected engine, edge and PDF checks pass, as do root types and all current spec references. Logs: `.local/upgrade-evidence/se-health-ltc-limits-{red,final,types,spec}.log`.
- This narrow constant correction does not establish monthly coverage or business-source qualification. The legacy aggregate worksheet's uniform monthly proration and absent plan/owner allocation remain separate implementation work; actual Form 7206 sources and canonical per-business integration follow. No filing or professional qualification gate changes.
- Exact staged verification passes 82 tests, root types, 3,766 spec references and scoped lint with zero errors (five existing test warnings). The parent independently confirmed both years' official amounts and caught an attribution error: the 2025 revenue-procedure section is 2.28, corrected before commit. Logs: `.local/upgrade-evidence/se-health-ltc-isolated-{tests,types,spec,lint}.log`. This is bounded source/code review, not independent professional qualification.

## Expanded educator eligibility and receipt funding (2026-10-25)

- Historical LTC correction committed `8f7c622`. The educator source contract and canonical calculation are `8c476b4`. Guided collection now preserves the actual early-childhood child count and facility funding conditions, interscholastic sports administrator/coach roles, broader instructional use, and separate receipt reimbursements and tax-free funding. [IRC 62(d)](https://uscode.house.gov/us/usc/119-118/t26/s62/) supplies the 2026 facility requirements; the broader itemized rules remain distinct from the capped income adjustment.
- The school-level change clears the now-different eligibility answer and source confirmation. Missing facility facts or receipt funding remain incomplete; known ineligibility yields zero without deleting the source. Actual zero, false and large Decimal costs survive. Coach and sports-administrator source facts do not create an income adjustment. Receipt funding must conserve the original expense, and the calculated income adjustment is subtracted once from the eligible itemized remainder.
- New spec-linked helper and real DOM regressions failed before implementation. They cover the two-versus-three-child threshold, both funding answers, 2025 versus 2026, role changes, exact 100.01/200.02 receipt reductions, known zero and clearing an answer. A further source regression caught a negative/NaN legacy amount being ignored; every entered legacy amount is now validated before source reconciliation.
- All 640 guided/core/DOM tests in 46 files pass, along with root/web type checks, all current spec references and scoped lint with zero errors. Parent independently reviewed the source helper/UI and reran the actual helper/DOM cases without actionable findings (`parent-tips-educator-ltc-review.log`). Logs: `.local/upgrade-evidence/educator-expanded-{sources-red,dom-red,legacy-red,final,types,web-types,spec,lint}.log`. This is bounded software/source review, not independent professional qualification. Exact staged verification follows; self-employed health insurance source collection remains active work.
- Exact staged archive passes 649 tests in 46 files, root/web type checks, 3,773 spec references and scoped lint with zero errors (20 existing/test warnings). Staged diff and whitespace review passed. Logs: `.local/upgrade-evidence/educator-expanded-isolated-{tests,types,web-types,spec,lint}.log`. The archive excludes in-progress Form7206, government-payment and education-distribution changes.
