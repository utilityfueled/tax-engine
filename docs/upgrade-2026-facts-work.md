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
