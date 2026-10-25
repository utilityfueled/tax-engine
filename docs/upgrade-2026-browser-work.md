# Browser source-fixture reconciliation

The immutable self-host production run at `4b5cacb` reported 245 passes,
51 failures and five hosted skips. The repaired scenarios supply actual synthetic
W-2 Boxes 7, 10 and 12W, use individual donation, education, energy and payment
records, and verify unknown fields and source confirmation. Numeric persistence,
privacy, unavailable-year and review-only assertions remain in place. No runtime
tax rule, coverage threshold, readiness gate or timeout changes in this package.

Expected values were checked against the [2025 IRS Tax Table](https://www.irs.gov/pub/irs-pdf/p1040.pdf),
printed pages 6 and 9: taxable income $34,250 gives $3,875 single tax, $36,250
gives $4,115, and $59,250 gives $7,955. Corresponding $5,000-withholding refunds
are $1,125 and $885. The [Form 2441 instructions](https://www.irs.gov/instructions/i2441)
support the actual qualifying-parent example: $3,000 expenses at 20% adds $600,
yielding a $1,725 refund after the provider and qualifying-person facts are supplied.

The zero-payment $75,000-wage case also exercises the explicitly unverified
historical regular-method penalty. An independent agent calculation using the
[2025 Form 2210 worksheet](https://www.irs.gov/pub/irs-pdf/f2210.pdf) and
[instructions](https://www.irs.gov/instructions/i2210) gives rounded required
payment $7,160, four $1,790 installments, and 971 combined days at 7% / 365:
$333 penalty and $8,288 total balance. No lower prior-year safe harbor, waiver
or annualized method is established by that fixture. These official sources
were refreshed on 2026-10-25; agent review is not independent human qualification.

The seven affected browser suites plus the shared fixture's dependent scenarios
ran against the retained immutable runtime with frozen test files and no retries:
154 passed, one failed on a sign/animation assertion. The final assertion now waits
for the independently checked $8,288 balance and its balance-due label; that case
passed separately in 5.8 seconds. Scoped lint has zero errors and 16 existing
non-null assertion warnings. Parent and independent agent diff reviews found no
removed readiness or privacy checks. A separate ticker timing fix addresses the
transient negative animation; it is not part of this fixture-only package.

Evidence: `.local/upgrade-evidence/browser-fixture-repair-frozen.json`,
`browser-fixture-repair-frozen.log`, `browser-fixture-2210-recheck.log` and
`browser-fixture-lint.log`. This verifies repair cases on an earlier runtime;
a fresh full browser run on the current committed application remains required.
Hosted skips do not establish staging readiness.

## Animation frame boundary

A browser frame timestamp can precede the effect's start time within the same
frame. The ticker's unclamped negative elapsed time briefly displayed a negative
value while animating toward a positive balance. Progress is now bounded to zero
through one; monetary interpolation still uses Decimal. Three regressions failed
before the change, covering positive, negative and above-safe-integer targets.
All four new DOM cases, including reduced motion, and 99 adjacent ticker checks
pass. Web types and scoped lint pass. Logs: `ticker-animation-{red,green}.log`.
This changes only the animation, not any tax amount or preview qualification.
