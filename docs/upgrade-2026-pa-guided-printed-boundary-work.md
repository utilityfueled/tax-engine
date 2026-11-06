# Pennsylvania guided payment test boundaries

November 2, 2026. The W2 interview broad run exposed nine failures in existing
PA guided tests (one unemployment control also executes through claim-of-right's
fixture import). A fresh immutable 00fa29c6 archive without any W2 interview
changes reproduces all nine: 61 pass/9 fail in the same nine files. Original
source copies, hashes, exact commands and stdout are retained under ignored
`.local/upgrade-evidence/nov02-parent-w2-guided-baseline-checks/` and
`nov02-pa-guided-printed-boundary/original-source/`.

Actual2025 PA40IN printed page4 requires whole-dollar form/schedule lines:
https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40in.pdf
refreshed November2. Existing PA40 spec `reported-payments` and implementation
already aggregate exact sources within each printed line, then round once.

The updated spec distinguishes the production orchestrator's exact jurisdiction
aggregate from PA40's printed payment lines and the preview's reported total.
Each existing cents oracle is retained against `calculatePAReturn.stateWithholding`;
additional assertions check its printed line and preview. No product changes.
For the mixed payment case, exact withholding2000.3 and exact estimates0.3 remain
verified at their respective actual aggregate/overlay boundaries. Printed lines
are2000 and0, so total2000 and refund158 at tax1842. The prior159 expectation
incorrectly rounded a combined raw158.60 after bypassing line rounding. OH and
generic state exact-cents expectations, privacy, unknown, duplicate, income and
readiness controls remain unchanged.

- [x] Exact unchanged baseline reproduction and original source preservation.
- [x] Spec updated before test migration.
- [x] All70 relevant tests/nine files, three types, spec/inventory/check and build pass.
- [x] Independent source/diff review has no findings; commit/push follows these checks.

This corrects regression probes after already-delivered printed-line arithmetic;
it does not qualify final2026 physical forms, filing, or any broader state path.

Main receipts: `nov02-pa-guided-printed-boundary-checks/checks.json` and
`nov02-pa-guided-printed-boundary-remaining/checks.json`. The attempted strict
lint of the existing eight test files fails on50 existing nonnull warnings;
exact immutable00fa/current ESLint JSON comparison proves identical0 errors/
50 warnings by file/rule. No lint rule or threshold was changed. Existing-test
normal lint passes; the new helper passes strict zero-warning lint. That initial
failure is retained. Generated inventory is byte-identical (the added spec row
references an already-inventoried test). Independent static review receipt
SHA fa78c40ef8d1859e117d5523f8c941a36bfbf8b69b48ec71480110ef0996c298
pins all original corrected source bytes; this appended checks text follows it.
