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
