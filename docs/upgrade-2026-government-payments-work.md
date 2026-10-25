# Actual government-payment source work

## Sources refreshed 2026-10-25

- [Form 1099-G instructions](https://www.irs.gov/instructions/i1099g), printed
  December 2026 revision: 2026 information only; new Box 10 family leave and
  renumbered state boxes 11a/11b/12. Box 1 is reported before federal withholding;
  distinct contributory programs need distinct statements. Box 2/3 refunds
  preserve their actual origin year; business refunds and agricultural payments
  require their separate source treatment.
- [Publication 525 (2025)](https://www.irs.gov/publications/p525), Unemployment
  Benefits and RTAA: same-year repayments reduce current benefits once;
  nondeductible government-program contributions are recovered first. Prior-year
  repayments use separate claim-of-right rules. RTAA is other income. Employer
  supplemental and private/union benefits do not share ordinary unemployment
  treatment.
- [Revenue Ruling 2025-4](https://www.irs.gov/pub/irs-drop/rr-25-04.pdf), situations
  2 and 5, pages 20–22 and 26: the actual $19,200 state family-leave example is
  fully included in gross income, separate from wages and unemployment. Employer
  pickup of employee contributions does not change this family-benefit result.
  Medical leave and private plans have different rules; this package does not
  substitute family-leave treatment for them.

The OLRC section 85 URLs returned maintenance/unavailable responses during this
refresh. The successful IRS sources above support this bounded implementation;
no successful current statutory-page retrieval is claimed for section 85.

## Source core and validation

`form-1099-g-sources.yaml` preceded the missing-module red test. The standalone
source calculator retains actual year, revision, recipient owner, statement
identity, payment classification, repayment and contribution records. Same-year
repayment records must reconcile whether source Box 1 includes the repayment or
already reports a net amount. Withholding stays separate from income.

Actual nondeductible contribution balances are pooled once per recipient, payer
and program, with matching history on each linked statement. The result retains
unused contributions and does not use unemployment contributions to reduce state
family-leave income. All monetary arithmetic and aggregation use Decimal.
Positive refund sources retain their actual year for the separate tax-benefit
calculator; they are not automatically included in other income.

The first green attempt passed eight cases and failed one expected error-message
pattern: absent state information correctly failed the source-completeness gate.
The test now checks that exact missing-state flag and rejection. A further
red regression proved that an isolated newly supplied repayment could otherwise
fall into historical handling; every new source field now selects the strict
route. Nine source tests, 219 adjacent model/Schedule 1 tests, root types and
scoped lint pass. A separate agent reopened the official sources, reviewed the
supported calculations, and independently reran all nine source tests with no
actionable findings (`ai-1099g-source-review.log`). This is bounded agent review,
not human tax qualification. Local logs use `form1099g-sources-*` and `form1099g-source-*` prefixes in
`.local/upgrade-evidence/`.

This is source-core work in progress. Canonical Schedule 1/withholding integration
and guided entry are separate dependent packages. Prior-year repayments,
business/farm grants, CCC payments, private programs and medical leave retain
explicit separate-worksheet errors until their actual source routes are ready.
No final-form, tax-review, filing or 2026 readiness gate is changed.
