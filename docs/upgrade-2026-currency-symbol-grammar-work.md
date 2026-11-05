# Currency symbols remain invalid input

November 5 UTC, 2026. The shared currency formatter and validator now recognize
optional absence from the raw empty or whitespace string. Previously the cleaner
removed a dollar sign and commas first, making `$`, `,` and `$,` look empty.
Blur could erase those invalid entries. The two-condition correction retains the
literal input and displays the existing invalid-amount error.

The decimal grammar, cleaner, signed-value policy and Decimal arithmetic are
unchanged. Real whitespace still normalizes to optional empty input. This is a UI
source-integrity repair, without a tax formula, rounding or readiness change.

The spec precedes behavioral tests and implementation. Genuine baseline results
are 12 failures and 40 passes: four formatting, four validation and four controlled
ReactDOM blur failures. After implementation all 52 pass. Four adjacent files pass
93 tests without skips. Root typecheck, four spec references, scoped lint with
zero warnings and diff checks pass. All existing test assertions remain intact.

Independent source review passes and independently executes 17 additional helper
controls for symbols, Unicode whitespace, zero, grouping and signed amounts.
That review inspects the author's actual test receipts; it does not relabel them
as reviewer test executions. Neither focused evidence nor agent review establishes
target-browser, tax-professional, full-distribution or release qualification.

ROOT reads both reports, reviews the complete source/test/spec diff and verifies
all 22 author and five distinct-review evidence members. Frozen bindings:

- Author manifest: `7115bce2e89183a90488c35ef83115a93b91a60adf2f767cdeb21bb2a4f3e66f`.
- Independent manifest: `9bfdb881c3b4f9a78a9ef1534d3ebc6708052d399d6dd74a8f23d7eb13d83d66`.
- Component: `9b33e6075aebfea06ce89b6ef377294a08bbe74481046a533ce067d703e9fd0d`.
- Test: `7bf2bf4434aba36a3ba2580a77e4fe09f7d8f504c73bbdd8ebe5da63f1c89445`.
- Spec: `f605e70269033a9fd644559d3a05f2ab6b4535e2981441314fedac50a97f6c6b`.

Private evidence is under `.local/upgrade-evidence/nov05-shared-currency-symbol-grammar-*`.
Combined final-source global checks, builds and actual browser validation follow
the separate Pennsylvania wrapper repair. Earlier Ohio full-unit and coverage
passes do not cover these later changes. All execution-brief completion criteria
remain required; no performance or CI-deadline claim is made.
