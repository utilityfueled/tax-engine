# Actual Pennsylvania royalty interview

This package exposes the original PA property/receipt method from `b334f19` in
the existing royalty interview. It supplies no calculated net override. The
actual copied year, owner, property and receipts stay separate from their PA
residency, income and expense classifications. Missing answers remain unknown;
actual false and zero survive. Copying original records is an explicit action.
Changing the original property, receipts or household invalidates state
confirmation while retaining the copied original record for reconciliation.

Completed federal facts can still produce a federal preview while missing or
stale PA facts withhold its state result. The selected PA royalty section remains
incomplete until its actual state method succeeds. Both versions keep filing,
2026 and independent human qualification gates unchanged.

The specification precedes the source/panel implementation. Retained original
source and DOM failures are `pa-royalty-guide-red.log` and
`pa-royalty-guide-panel-red.log` under `.local/upgrade-evidence`. The first
cohort passes11 tests/4files; the added zero/unknown-copy cases pass. Desktop and
mobile production flows pass2/2 with zero retries, preserve exact149.25 receipt
corrections across reload, and keep private source values out of request bodies.
Both screenshots were inspected; no horizontal overflow is present. The
task-owned loopback server on3242 was stopped.

Browser test development initially used the wrong state heading and a mistaken
literal tax expectation. Those two failed runs remain retained. The actual
rendered heading is `Pennsylvania (PA)`; independently,210900 times0.0307 equals
6474.63 and rounds to6475. The product bundle was unchanged across those repairs.
The workspace packet test initially omitted the existing colon in its expected
label; that failure is retained separately from the corrected assertion.

Sources are the final2025 [PA Schedule E instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40e.pdf)
and the [PA royalty income guide](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/net-income-loss-from-rents,-royalties,-copyrights-and-patents),
refreshed October26. The existing core ledger records separate property/owner
rounding and the original source review. Exact frozen checks and independent
agent review are recorded below. No agent review supplies human
tax qualification, final2026 form qualification, hosted evidence or release readiness.


Reviewed tree `dda311afc28b950fda24503c90261551fbe2af15`, based on
`9eb32ba`, passes 486 tests in 9 files, root and web typechecks, all 5,299
spec references, scoped lint with zero errors or warnings, and the production
web build. Its manifest and command/log hashes are retained in
`.local/upgrade-evidence/pa-royalty-guide-review-snapshot.json` and
`pa-royalty-guide-exact-checks.json`. All 10 non-ledger blobs stay unchanged
through delivery.

Separate agent review passes all 6 new cases in 3 files and 4 independent
controls in 2 files. It checks aggregation before state rounding, mineral
surface expenses, unknown or mismatched original years, and actual false/unknown
classification through native controls. The report is
`.local/upgrade-evidence/ai-pa-royalty-guide-review.json`; no actionable finding
remains within this package's scope. This is software review, not human tax
qualification.

The exact frozen production build also passes both 1280px and 390px flows with
zero retries (`pa-royalty-guide-exact-browser.log`). Both saved screenshots were
visually inspected for readable controls and overflow. Its task-owned loopback
server was stopped. The real workspace packet case uses the unmocked guided
builder, reopens the federal Schedule E plus PA reference PDF with an independent
reader, checks the literal state royalty result, and checks review notices and
private-identifier absence. No live provider, hosted, filing or release result is
inferred from these synthetic checks.

Final integration on a7c9884 also passes all 6 owned cases in 3 files, with no
source-blob changes and a clean whitespace check. The integrated log is
`.local/upgrade-evidence/pa-royalty-guide-integrated-unit.log`.
