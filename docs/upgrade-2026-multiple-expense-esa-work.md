# Multiple actual tuition expenses with a Coverdell account

Status: reviewed bounded implementation; final integration and delivery below. No release or filing promotion.

Official research refreshed October 26, 2026: [IRC529(c)(3)(B)(v)/(vi)](https://uscode.house.gov/us/usc/119-118/t26/s529/), [Pub970 chapter6](https://www.irs.gov/publications/p970), and [IRC530(d)](https://uscode.house.gov/us/usc/119-118/t26/s530/). The statutory allocation rule includes in-kind benefits. This source extension accepts the taxpayer's actual allocation across distinct tuition records for one original prepaid QTP and one ESA. It does not select an election. Each expense retains its benefit, aid, credit and two allocations; exact Decimal totals conserve each expense and both distributions. ESA basis and account history remain separate actual sources.

The spec preceded failing engine/canonical controls: `multiple-esa-spec-red.log` records two expected failures at the old one-expense restriction and one passing conflict control. The shell wrapper subsequently rejected its reserved status variable; the complete Vitest failure log was preserved. Product changes are confined to the shared source validator. Core and original single-expense tests then passed seven cases in three files. The full source/federal/guide/PDF/workspace cohort initially passed four cases and failed two new PDF text assertions because those expected audit-input labels that are not printed. The corrected assertions use the existing exact original-expense and remaining-ESA trace labels; all literal amounts, physical fields, stale-source and privacy assertions remain.

Derived literal control: tuition 4,500/3,500, aid 500/500, credit 500/500, actual benefits 2,500/1,500. QTP 4,000 with earnings 800 receives 1,000/500 expense and 500/500 credit; ESA 6,000 with independent basis 4,200 receives 2,500/2,000 expense. Excluded earnings are 300 plus 1,350, taxable earnings 950, credit exception 200 and additional tax 75. An actual 500 expense shift to the QTP changes taxable earnings to 1,000 and tax to 80 because the earnings ratios differ. These are derived controls, not published IRS examples or qualified human review.

Whole-source guards cover exact cents, original distribution capacity, missing/duplicate links, unknown reductions, recipient/year contradictions and extra source groups. The existing guided records retain all originals and revoke confirmation after a source edit. The review context binds both expense groups before PDF I/O. Broader tuition/category/source methods remain in the education method ledger; this package does not mark an unsupported boundary complete.

Rule-pack and year-readiness gates remain unchanged. The exact verification and delivery evidence follows.


## Exact verification and independent review

Frozen product tree `206dced970944ef3851049b1853e54433c3611fd` passes 879 tests
in 64 files, root/web types, spec references, both builds and scoped lint.
The separate reviewer checked all twelve owned hashes in an independent copy,
refreshed the official sources, and passed ten cases across six files: six owned
cases plus four new controls. These cover independent 30%/10% source ratios,
actual credit reassignment, a third expense, exact cents, original basis/history,
source ordering, and forged/other/stale PDF contexts. No product finding remains.
This is agent review, not qualified human tax review.

Nineteen saved PDFs from that exact product tree were independently reopened:
61 pages, eight literal5329 fields, unchanged hashes, private identifiers absent,
and one review-only notice on every page. Both author and reviewer inspected all
pages/footers and readable reference/physical5329 pages. Artifact manifest and
reopening evidence are in `.local/upgrade-evidence/multiple-esa-artifacts`;
review reports are `federal-multiple-esa-review.json` and its PDF report.

The new browser fixture initially imported a runtime-only alias, then omitted
seven required empty energy strings. Both authored fixture errors were corrected
without changing production behavior. Subsequent exact-value checks exposed the
existing currency blur formatting; an explicit keyboard Tab now exercises it.
Initial screenshots captured the existing ticker animation. A separate private
state capture proved sources were unchanged, so the browser assertions were
strengthened to wait for exact settled refunds rather than any available estimate.
All original source-edit, unknown, confirmation, reload and privacy assertions
remain, with no changed deadline or retries. Original failure logs are retained.

The refreshed official [2025 tax table, printed page6](https://www.irs.gov/pub/irs-pdf/i1040tt.pdf)
provides ordinary taxes3989/3995 for the single-filer35200/35250 rows. Less200LLC
plus75/80education tax gives3864/3875total tax. The browser's actual20000federal
and725Medicare withholding gives16136/16125refund. The direct inherited W2
fixture separately reports1232.50Medicare withholding; existing Form8959 supplies
508additional withholding, so its refunds are16644/16633. An initially added
assertion wrongly reused the browser's withholding assumption; its failure is
retained and the corrected assertion preserves the original W2 sources.

After EIC integration, tree `b433ade1` passes881 cases in64 files and both builds.
Final strengthened assertions on `af2bb3d` pass473 cases across three files,
root/web types, strict references and lint. Scoped lint reports0errors and98
warnings, primarily non-null assertions in the new synthetic test fixtures;
these warnings are recorded, not described as pre-existing. Browser source
`ee41b771` has identical production/browser blobs to the final source and passes
both desktop/mobile cases with zero retries, exact settled values and source
hashes unchanged; task port3340 is closed. Browser log SHA256:
`f051d7d4269ac1dc5afd137a0af8975c84a52282f987a8f2811b3b2d6155867e`.
Final integration reserves rule versions2025.136/2026.133-law-integration-draft;
no readiness gate changes.


Final integration tree `1802a64215c746931839f1c845b94c1407b99b95`, based on
`827b399`, passes882 cases in64files, root/web types, all5389strict references,
and scoped lint. Separate metadata/readiness checks pass. The reviewer cleared
the final strengthened spec/test delta on `af2bb3d`, reran its canonical case,
and independently reproduced both W2 withholding regimes in two new cases.
All executable/source/test blobs match that reviewed final source; the only
additional changes are rule provenance and this evidence record. Final commit
and exact remote verification are recorded in the central checklist and the
local `multiple-esa-delivery.json` receipt.
