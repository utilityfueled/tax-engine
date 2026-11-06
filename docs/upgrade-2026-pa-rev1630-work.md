# PA REV-1630 source correction

This package corrects the published fixed-endpoint worksheet core and its narrow
PA-40 Line2 handoff. It does not qualify arbitrary dated payments, prior-return
eligibility, Exception2, farmers, special exceptions or a final2026 export.

- [x] Refresh actual2024/2025 REV-1630, final2026 REV-413(I), and current REV-1611.
- [x] Pin source-derived originals before spec, tests or product outputs.
- [x] Update specs, then retain a true red:18failed/318passed,2files.
- [x] Implement Decimal reported-line rounding and matching25/50/75/100% prior-tax thresholds.
- [x] Transfer reported PA-40 Lines13+17+21+22+23 once, including NRK-1 withholding and allowed ScheduleDC; exclude payment-only lines and WPTCprocessing.
- [x] Use final2026 threshold430, Jun15/day199 and current daily.000192.
- [x] Leave2027rate unknown; reject only an unexcepted positive underpayment needing it after valid zero/exemption/safe-harbor paths.
- [x] Validate finite nonnegative amounts before exemptions; preserve knownzero.
- [x] Preserve all original fixture inputs and assertions except source-proven old safe-harbor expectations; add a genuine partial-period boundary.
- [x]339tests/3files pass, including historical packet tests;563/2strict-ref/year-support tests pass.
- [x] Root/web/contracts types, spec6594/6594 references and scoped lint0errors pass.130warnings are preexisting assertions in the unchanged orchestrator test body; no new production warning.
- [x] Independent source/implementation review: eight pre-output controls plus 336 unchanged author tests pass (344 tests in three files).
- [x] Main passes 1,086 tests in eight files, all three type checks, 6,603 spec references, inventory freshness (619 entries), scoped lint (zero errors, 130 preexisting test warnings) and engine build.
- [ ] Final integrated CI/runtime and human qualification.
- [ ] Actual dated-payment, annual-payment/early-payoff, prior-return and specialized-exception source qualification in the remaining PA payment successor.

## Authoritative sources

Retrieved2026-11-02. Private raw PDFs, response receipts, exact hashes, pre-output
originals and all failed/successful checks are retained under
`.local/upgrade-evidence/nov02-pa-rev1630-correction` and
`nov02-pa-remaining-lines-source-review`.

- [Final2025 REV-1630](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_rev-1630.pdf): printed1–2, instructions Line12. Line2 is13+17+21+22+23; prior annual tax is apportioned25/50/75/100% before per-period comparisons. Report each worksheet monetary line in whole dollars.
- [Final2024 REV-1630](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2024/2024_rev-1630.pdf): same fraction rule; printed day factors258/197/106. The Q1 factor258 is repeated in form/instructions/example but conflicts with Apr15→Dec31 calendar260. This core explicitly represents the published worksheet, not resolution of that statutory-day interpretation. The conflict remains open.
- [Final2026 REV-413(I)](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2026/2026_rev-413i.pdf): threshold430 and dates Apr15/Jun15/Sep15/Jan15 imply current-year day counts260/199/107. This source is not a final2026 REV-1630 form.
- [Current REV-1611](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/otherforms/documents/rev-1611.pdf): daily.000192 applies1/1/2025–12/31/2026; daily.000219 applies2024. No2027rate is stated. A guessed2026REV-1630 exactURL returned404; this is not a universal absence claim.

The existing API's numeric prior-year inputs do not establish an actual full-year
prior resident return. Payment buckets likewise do not prove dates. The caller
must establish these original facts; absent qualifying source evidence cannot be
relabelled as zero or a verified exemption. No arbitrary rate override is added.

Initial green attempt retained a missing roundDollar import and another incorrect
historical safe-harbor expectation. Both were corrected from the pinned source,
without changing fixture money. A separate strict-test prerequisite attempt
omitted the pinned Python environment; its failure is retained, followed by the
successful identical test run with the documented environment. No source or
readiness gate was weakened. Full-suite/integrated qualification remains pending.

Independent root review is retained in
`.local/upgrade-evidence/nov02-pa-rev1630-independent-review/final-review.json`.
Its first harness attempt read a nonexistent top-level result field; the retained
correction reads the actual four quarter fields without changing money or product.
Main checks are retained in `nov02-parent-pa-rev1630-main`; all eight commands pass.
These package checks do not qualify the final branch, actual dated payments or
any missing future interest-rate authority.
