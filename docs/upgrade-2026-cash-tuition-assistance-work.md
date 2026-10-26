# Actual prepaid and cash QTP tuition assistance

This private package completes the finite assistance-without-ESA source cohort.
Actual tuition receipts, benefits, cash statements and source allocations remain
separate. It does not fabricate an ESA record, select an allocation, supply
missing zeros, or infer how assistance was divided between different receipts.

Official sources refreshed October 26, 2026:

- [IRC 529](https://uscode.house.gov/us/usc/119-118/t26/s529/),
  (c)(3)(B)(i), (ii), and (v): qualified prepaid benefits, the remaining cash
  expense capacity, and actual assistance/credit reductions.
- [Publication 970](https://www.irs.gov/publications/p970), chapter 7:
  adjusted expenses, original earnings ratios and separate additional tax.
- [Notice 2016-13](https://www.irs.gov/irb/2016-07_IRB#NOT-2016-13): separate
  original QTP calculations after repeal of the aggregation requirement.

For each actual tuition receipt, the source helper removes assistance and
credit once. It requires the prepaid allocation to equal the lesser of its
actual benefit less its actual credit allocation and remaining adjusted
tuition. Cash allocations must conserve the remainder. Each receipt has one
prepaid benefit and an explicit allocation, including actual zero, for each
cash statement. Every original statement retains its own earnings ratio and
capacity. Credit amounts are reconciled to the original prepaid and remaining
cash-paid costs. A local Decimal context preserves source precision without
changing global tax arithmetic. The canonical and private output paths consume
the same source validation and retain the actual audit.

The independently derived controls use 10,000 tuition, 1,000 assistance and
1,000 credit expense. A 4,000 prepaid benefit with 800 earnings and 500 actual
credit receives 3,500 qualified expense: 700 excluded and 100 taxable earnings.
An 8,000 cash statement with 2,000 earnings and 500 credit receives the remaining
4,500: 1,125 excluded and 875 taxable. The return retains 975 taxable earnings,
225 credit exception and 75 additional tax, giving 50,975 AGI with actual
50,000 wages. The actual educator source of 2,500 less 1,825 excluded QTP
earnings leaves 675 before the 300/350 cap. These are derived fictional controls,
not published IRS numerical examples or independent human qualification.

The source-first run retained three expected failures in two files at the
previous mixed-source boundary. After implementation, 12 cases in six files
passed, including the prior distinct-prepaid and mixed-ESA controls. All eight
owned source/canonical/guide/real-panel/PDF/workspace cases then passed. Root,
web and contract type checks passed; scoped lint reported no errors or warnings.
The initial DOM test used shortened labels that did not match the actual panel;
the retained failure was corrected to the existing exact labels, without product
changes. An initial contracts command targeted a nonexistent package script;
the root `typecheck:contracts` command then passed. Neither failed invocation is
counted as a successful check. The first broad run passed 738 cases and found
two regressions: the dispatch applied the stricter new source cohort to existing
zero-assistance cash/prepaid records. The corrected dispatch activates this
method only for positive actual assistance and preserves the original
zero-assistance checks and error expectations. Both failed controls remain
unchanged. The corrected broad run passed all 740 tests in 60 files, including
strict references, adjacent original source methods and private output. All
5,504 spec references and the root build passed. Exact logs are retained under
`.local/upgrade-evidence/tuition-assistance-*`.

Development is based on `8f1d1ba` plus all 13 exact owned blobs from the reviewed
mixed-tuition dependency `0411cc25151cc35911042521b94d18a34c241c8c`. The source
record is `.local/upgrade-evidence/tuition-assistance-work.json`; dependency
blobs are not owned by this package. The final integration will preserve the
then-committed dependency and unrelated changes.

Remaining checks are the exact broad/static/build/browser run, independent
source/output review and delivery under a main/index lease. The separate finite
room/board method will use actual institutional academic-period and living-
arrangement cap groups. The precise no-ESA allocation question for multiple
prepaid originals sharing a binding cap is recorded in the private finite-
endpoint report; it does not block ordinary assistance or other determined
period-group methods. Public filing/year and human qualification gates remain
unchanged.

## Frozen source review and first browser result

Frozen 7f6786ca passed 740 tests in 60 files, root/web/contracts types, all 5,504 spec references and the production build. Federal independently verified all 14 owned and 12 dependency hashes, passing 12 tests in seven files (eight package cases and four private controls). The independent report is `.local/upgrade-evidence/federal-tuition-assistance-review.json`, SHA-256 `3e4ff6e8ebf3cdcbcc610b8568c76de50fceaf13be574ac7ae0b33e0700e40fd`. Controls cover three receipts/unequal cash ratios, individual source capacity with balanced totals, 41-place conservation without changing global precision, known zero versus missing rows and benefit year. This is agent source/software review.

The first production browser run failed both sizes before edits: the plain fictional fixture omitted `coverdellAccounts: []`, so the complete-source bridge correctly retained unknown history and withheld its estimate. The exact source diagnostic confirmed that supplying this actual empty list restores the input; original application and monetary assertions remain unchanged. The failure log is `tuition-assistance-review-browser.log`, SHA-256 `1808207edae9e6e1a28144f2dde0b03d4036d75bc832f7cbd59e2b8c09654afc`. V2 changes only that explicit fictional source list and this ledger. The first immutable archive remains untouched.

## V2 browser and saved-artifact closeout

V2 `e5af5a3128baae106272c174948ae65a7c19ced8` passed 492 tests in seven files, the production build and both desktop/mobile browser cases with zero retries. The browser log is `tuition-assistance-v2-review-browser.log`, SHA-256 `c3ddedba7e40633a4cf32afba9342f882aa8f70f1ef1f5aad388c2af7d2bd897`. The runner requested two workers and used one; its task-owned port 3352 is closed. Federal reviewed the explicit empty-account browser source correction separately and confirmed the prior 12-test/seven-file source review remains applicable. All 3,214 tracked source hashes in each V1 and V2 archive remain unchanged after checks. Scoped lint reports zero errors and warnings. V1 broad/type results and V2 focused/browser results are separately attributed.

Four retained variants and two actual browser downloads were independently reopened with pypdf: six PDFs, 114 pages and 24 literal physical fields. The controls retain 50,975/50,725/51,225/52,200 AGI, the corresponding actual taxable earnings/credit exception/additional tax, and both changed-assistance downloads retain 51,225/1,225/225/100. Every merged page retains the review-only notice, all are flattened, and the listed synthetic private identifiers are absent. The initial reader expected a printed `0` for the known-zero Form 5329 exception; the unchanged mapper leaves that field blank. That reader failure is preserved and its actual blank convention is checked explicitly; no source or PDF product change was made.

Author visual inspection covered six all-page contacts, six footer strips, 14 readable physical/reference details and four UI screenshots. No layout or source presentation issue was found. Exact hashes, checks, image paths and review reports are in `.local/upgrade-evidence/tuition-assistance-artifacts/manifest.json`. The generator is not counted as an authored test. Parent independent artifact review and current-head delivery checks remain pending; the separately reviewed mixed-tuition dependency is now committed as `3669b0006a8e3d60028d22e5ffa517096b3c58e1`.
# Parent independent artifact closeout

The separate parent artifact review is clear in `.local/upgrade-evidence/parent-tuition-assistance-pdf-review/checks.json` (SHA256 `b7afafb0cf7c1b98411af6aa157d87f4c2c39503ecab129092bab2093ea01cf4`). It verified the V1/V2 owned hashes and 12 unchanged product/spec/unit blobs; independently reopened four retained PDFs (74 pages) and two browser PDFs (40 pages), with 16 original literal fields and eight flattened Form XObject placement/value controls. Review notices, identifier privacy and flattening passed. The parent inspected six contacts, eight independent detail renders and six browser detail pages. The initial private reader matrix assumption failure remains recorded; correcting the reader to the actual CTM appearance origin required no product or test change. This is agent software/source review, not human qualification. Final current-head rebase and delivery remain pending.

## Final integration candidate

Private rebase onto exact `2bd4fdd9f6626a72cd7f5084686cb738d21bb90a`, versions 2025.150 and 2026.147-law-integration-draft. All 13 non-ledger product/spec/test/browser blobs remain byte-identical to reviewed V2 e5af5a31. The 44 predecessor implementation links are preserved, with one truthful shared runtime/historical review link for this method; inventory is regenerated to 525 entries. Filing, final-year and qualification gates remain unchanged. Final immutable combined-source checks are recorded separately before delivery.
