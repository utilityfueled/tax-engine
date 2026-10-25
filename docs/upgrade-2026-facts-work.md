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
