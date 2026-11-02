# PA-40 reported payments and settlement

This package makes printed PA-40 payment, credit, use-tax and penalty arithmetic
use reported whole-dollar lines. Exact aggregate originals remain unchanged.
The fresh actual 2024 instructions also establish the same income-class rounding
rule already applied to 2025 and the draft 2026 calculation.

- [x] Pin actual source rules and independent literal originals before product changes.
- [x] Update the spec before tests; retain six genuine failures and 90 passes.
- [x] Round each aggregate payment/credit line once, then add the reported lines.
- [x] Combine reported REV-1630 interest with exact unprinted late components and round their sum once for line 27.
- [x] Exclude unprinted refundable helpers from printed line 24 and settlement lines 26/28/29; retain separately named legacy payment/overpayment helpers.
- [x] Offset penalties against an existing overpayment and retain printed $1 balances. Payment and refund issuance policies remain separate.
- [x] Pass 96 focused tests and three type checks.
- [x] Independent review passes 24 new controls plus the unchanged 96 author tests.
- [x] Main affected checks pass 1,615 tests in 58 files, 6,598 spec references, inventory freshness (619 entries), scoped lint and engine build. Lint reports eight preexisting test assertions and zero errors.
- [ ] Complete upstream original-payment dates, receipt eligibility, credits, household/state methods and physical-form qualification.
- [ ] Obtain independent human tax review and final 2026 form qualification.

[Actual 2024 PA-40 instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2024/2024_pa-40in.pdf),
printed page 4, and the actual 2025 instructions require whole dollars. The
[actual 2025 PA-40](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40.pdf)
prints line 18 as 14+15+16+17 and line 24 as 13+18+21+22+23. A helper credit
without a printed line cannot be added to printed line 24. Its historical fixture
keeps every input and the legacy 2,050 payment-helper assertion; only the
mislabelled printed-24 expectation changes from 2,275 to the source-correct 2,025.

Private evidence is retained in `.local/upgrade-evidence/nov02-parent-pa40-reported-settlement`,
its `-green` and `-broad` directories, and
`nov02-pa40-reported-settlement-independent-review`. The independent final receipt
is `9e21afadd95489ac27d67a82433b5c9344c12294e4b30ca150a5eab620f80632`.
Fresh source bytes, response hashes and pre-output originals are retained in
`nov02-pa-remaining-lines-source-review`. The 2024 instruction hash is
`de983ef28babe59e4e5da1ed0100f996e219b2aaa2119757eace746170c0a822`.

This pure worksheet accepts already admissible credits and a reported REV-1630
transfer. Rounding does not establish eligibility, payment dates or actual refund
elections. The existing WPTC paper/processing guards remain in force. The 2026
method remains draft; no filing, model, staging or release gate is enabled.
