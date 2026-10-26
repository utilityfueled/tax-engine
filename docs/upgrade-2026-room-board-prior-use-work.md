# Actual prior use of an academic-period room-and-board allowance

This private follow-up extends the delivered `02dccca10004687f4cc3c5fd7897be686efe6082` period-source method to an actual academic period crossing return years. It records the filed prior worksheet and its original receipts, then derives the current remaining allowance. It does not accept a current allowable-expense override, reconstruct history from earnings, reset the institutional cap each January, or assume that missing history is empty.

## Source basis and bounded interpretation

Official sources refreshed October 26, 2026:

- [IRC 529(e)(3)(B)](https://uscode.house.gov/us/usc/119-118/t26/s529/) limits actual room-and-board costs to the institution's allowance for the applicable academic period and living arrangement, or the greater actual institutional housing charge. Section 529(c)(3)(B)(v) separately reduces qualified expenses for assistance; clauses (i), (ii) and (vi) retain prepaid/cash and ESA coordination.
- [Pub. 970, chapter 7](https://www.irs.gov/publications/p970) applies annual paid expenses and original distributions after the academic-period limit. The AOTC first-three-month rule is not imported into this method.
- [IRC 530(d)(2)(C)](https://uscode.house.gov/us/usc/119-118/t26/s530/) supplies the existing actual ESA coordination boundary. No ESA basis or distribution allocation is inferred.
- The official section 529 effective-date note identifies the Pub. L. 107-16 amendments as effective for taxable years beginning after December 31, 2001, under section 402(h). Supplied earlier history requires its historical method instead of retroactively applying the later allowance rule.

The cross-year treatment is a source-based derivation of one period cap, not a published IRS cross-year example. Actual prior qualified cost **before** assistance consumes period capacity; prior adjusted expenses after assistance are retained separately. Each historical worksheet must reconcile exactly to its original qualifying receipts, refunds, assistance and the then-remaining cap. Chronological worksheet order is derived from actual years, with duplicate years rejected. No hypothetical prior allocation or filed income is invented. Post-filing changes and separate prior credit/other-benefit treatment remain explicit source-method boundaries.

## Actual source and guide contract

Optional prior worksheets and original prior receipts have no default amounts or affirmative answers. Each period requires an actual complete-history answer and reference, including explicit empty lists when no earlier use occurred. Prior originals bind beneficiary identity/name, institution, academic dates, living arrangement, enrollment, allowance and housing charge. Receipt dates, qualification, known-zero reductions and source references remain independent facts. Unused, duplicate, replaced or contradictory records reject.

The existing education controls expose both collections and their actual links. Edits revoke annual, period, worksheet and receipt source confirmations while preserving the actual completeness answer and explicit false values. The latter is a fact, not a confirmation shortcut: a false completeness answer remains stored and blocks calculation after reconfirmation. Original decimal strings and historical values survive local save/reload. The existing private education context binds the full original history before PDF redaction. The review reference separately prints prior cost, prior assistance, prior adjusted expenses and remaining current cap; original identifiers and references remain private.

## Derived controls and retained failures

With one actual period cap of 6,000, prior qualified cost 5,000 and prior assistance 1,000, historical AQEE is 4,000 but current remaining capacity is only 1,000. A current original distribution of 10,000 with earnings 2,000 yields 200 excluded earnings, 1,800 taxable earnings and 180 additional tax. Actual wages of 50,000 produce 51,800 AGI, with no historical income transfer. Actual current ESA choices of 300 QTP and 700 ESA conserve that same 1,000 target. Complete empty history leaves 6,000 capacity; an actually exhausted period leaves zero. Exact 41-place source tails are checked using a local Decimal clone, without changing process-wide precision.

All logs below are retained under `.local/upgrade-evidence/room-board-prior-use-` and have adjacent command/exit/hash receipts:

| Evidence | Result and meaning |
| --- | --- |
| `core-red.log` | Four failures and one pass before the historical calculation. |
| `chronological-red.log` | Five failures and one pass before chronological historical reconciliation. |
| `core-green-attempt1.log` | Nineteen cases across the new source and existing period suites passed. |
| `followthrough-red.log` | Three source/UI/PDF failures and one canonical pass before follow-through. |
| `followthrough-green-attempt1.log` / `followthrough-with-workspace.log` | Preserved confirmation-cycle failures: clearing the actual completeness fact made reconfirmation self-invalidate. No assertions were removed. |
| `followthrough-green-attempt2.log` | Five guide, actual panel, canonical, PDF and workspace cases passed after clearing only source confirmations while retaining actual completeness. |
| `historical-rule-red.log` | The selected pre-2002 test failed before its historical-method guard; six unrelated tests were intentionally not selected. |
| `historical-rule-green.log` | All 25 tests across seven files passed, including the full seven new core controls and thirteen existing current-period cases. |

Initial root/web types, strict references and scoped lint passed before the final historical guard. The immutable broad/static/build/browser checks and independent review are recorded separately when complete. Test fixtures and all numerical controls are explicitly fictional. Artifact generation is not an authored test or an independent tax-law qualification.

## Finite endpoint and delivery state

This is the named cross-year history follow-up to the implemented mixed prepaid/cash/ordinary-ESA tuition, actual assistance, and institutional room/board period methods. It preserves the current period method's per-original membership fix and separate binding allocation boundaries: competing prepaid originals without ESA, and multiple cash originals sharing a reduced residual. No controlling allocation election was established for those exact combinations by the prior section 529/530, Pub. 970 and Notice 2016-13 research; the aggregation repeal alone does not establish one. This package adds no unrelated education election.

The work is private and awaits immutable independent review, exact broader checks, saved desktop/mobile download evidence and an integration lease. No metadata version is reserved here, no final-year form/output gate is opened, and no filing or independent human qualification is claimed.

## Immutable verification and independent review

Frozen source `4a07a0bb6aa9992794d159be9cc273eb5624f6a3` passed 1,702 tests across 197 files, root and web types, 5,606 strict references, scoped lint with zero errors or warnings, and both builds. All 3,303 tracked source hashes remained unchanged. Its inventory check failed because the new spec had not yet been generated; that exact failure is retained in `room-board-prior-use-review-inventory.log` (SHA256 `f8e8d81ca273004d41c5f4f3fd3169e45e9f32a3551b07bc29419b4c34d89244`) and is corrected only by the final reviewed inventory delta.

The exact production guide passed four cases (cash and prepaid at desktop and mobile widths), with zero retries and one effective worker; port3356 was closed. Log SHA256 `fd8a2d5a2417bb5de78f7d8cf6bd31e8e0f4dd57d43d199660a1bc26dc426874`. Actual source edits, unknown/false distinctions, reconfirmation, reload, review download and absent identifier request bodies were retained. Five additional retained source scenarios and these four actual browser sources have saved original-input JSON. The artifact manifest `room-board-prior-use-v1-artifacts/manifest.json` has SHA256 `c75247ba2cb3a6649df839a572dc6ca03527d03bce1b8bc0465061d1cbef8d0b`; the author inspected nine all-page contacts, nine footer contacts, six readable key pages and eight UI screenshots. Artifact generation is separate from authored tests.

Independent parent source review passed 30 cases across eight files, including five private original-derived controls for greater actual housing invoices, exact refunds and assistance in both years, ineligible prior receipts, reordered history, fractional exhaustion, one-cent history contradictions, dates and unknown/false sources. Report `parent-room-board-prior-source-review.json` SHA256 `cfb8d1687adc699089410892eb851210f47fde4a52b940404180f99232c39956`; log SHA256 `6cba9a5eb7a76d2387f4629eb58bce60253e6858f00b674967f9211c9f48789e`. All 17 frozen files stayed unchanged.

Independent parent original/PDF review derived all nine source scenarios and verified 49 PDFs / 246 pages, 215 populated fields, 25 literal physical fields and 12 browser values. All eleven contact sheets and twenty-seven readable pages were inspected. Saved original, PDF, UI and source hashes stayed unchanged. Report `parent-room-board-prior-pdf-review/checks.json` SHA256 `1c6a2de70874e5d2af0eff2c96eed789c07fc7e30b70599ba0f9f7358ea1f1d6`. The parent's initial reader omitted a literal dollar sign in its expected label; both failed and corrected reader attempts are retained, with no product change. These are agent source/software/output reviews, not qualified human tax review.

## Final integration candidate

The private final rebase is onto `1e04964e6e401536ff4c1bee806ba3ac2c4a94e9`. All sixteen reviewed non-ledger product/spec/test files are byte-identical to `4a07a0bb`; no executable merge is needed. Provenance advances to `2025.155` / `2026.152-law-integration-draft`. All 125 predecessor implementation links remain unchanged, with one actual own-spec runtime and historical2025 review-code association added before inventory regeneration. Final checks and frozen receipts are recorded separately before delivery. No public calculation, final-form, filing, human-review or release gate is promoted.

The finite cash-source residual now has a separately reviewed authority plan under the annual cash fraction in section529(c)(3)(B)(ii): preserve each actual Box2 and original receipt membership while computing the complete ordinary same-year/beneficiary/recipient cash pool after determined caps, assistance and prepaid treatment. That calculation is a separate package, not implemented here. Competing prepaid originals at a binding cap without ESA remain a precise unresolved ordering question; no allocation election is inferred from Notice2016-13.
