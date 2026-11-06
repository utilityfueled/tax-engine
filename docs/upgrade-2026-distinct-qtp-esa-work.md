# Distinct prepaid QTP statements with one ordinary ESA

This extends delivered `b0de955` to a complete group with separate original
prepaid QTP statements and one ordinary ESA for the same actual beneficiary,
recipient and year. Each original keeps its own benefit, expense allocation,
credit allocation and earnings ratio. No election or combined ratio is inferred.

Official sources refreshed October26,2026: [IRC529(c)(3)(B)(v)/(vi)](https://uscode.house.gov/us/usc/119-118/t26/s529/),
[Pub970 chapters6/7](https://www.irs.gov/publications/p970), and
[Notice2016-13 section2](https://www.irs.gov/irb/2016-07_IRB#NOT-2016-13).
The notice confirms repeal of QTP earnings aggregation after2014. Actual ESA
basis/history continues through its own worksheet. Each source is validated
before the existing calculation; no tax formula or filing gate is changed.

The spec and failing referenced tests preceded the source change. Two positive
source/canonical cases reproduced the two-account guard; the negative source
case passed. The retained red log is `distinct-qtp-esa-red.log`. The first green
check passes those three cases plus the previous three multiple-expense cases.

Literal derived control: separate QTP2500/500earnings and1500/600earnings receive
actual expense allocations1000/500, while the ESA6000/1800earnings receives4500.
Exclusions are200/200/1350, taxable amounts300/400/450 and credit exceptions100/
200/0. Total taxable1150 less300exception gives85additional tax. Moving500actual
expense from the ESA to the first QTP changes total taxable to1200 and tax to90.
These are independently derived statutory controls, not published IRS examples
or qualified human review. [2025 tax table page6](https://www.irs.gov/pub/irs-pdf/i1040tt.pdf)
provides ordinary4013/4019 at35400/35450taxable income; after200LLC and85/90tax,
total3898/3909. Original direct withholding gives16610/16599refund; the actual
browser W2 gives16102/16091. Both source sets remain separate.

The actual guide, workspace download, private source-bound PDF review and
production browser flow are complete for this source group. Other categories,
shared benefit expenses, multiple ESA accounts and unresolved education
interpretations remain separate methods. This package does not establish human
or final-form qualification.

## Exact verification and independent review

Frozen source tree `b99a21dbb55cbb83ec1fd7d01f7d1d5550211119`, based on
`dceb18d`, passes 889 tests in69 files, root/web types, all5396 spec references,
engine/web builds and scoped lint. Lint has zero errors and103 warnings,
primarily non-null assertions in the new synthetic fixtures; these are not
claimed as pre-existing. All11 owned source hashes remained unchanged.
Commands and log hashes are in `distinct-qtp-esa-exact-checks.json`; the test
log SHA256 is `b11703dc7c00e4bde91a45bc3c0d5eb33dfb8662f873ac4e77a3ee6cb1d844e0`.

Both desktop/mobile production browser cases pass with zero retries and settled
refunds16102/16091. The requested worker limit was2; the single-file runner
actually used1 worker. Both screenshots were inspected, source hashes remained
unchanged, and task port3342 was stopped. Browser log SHA256 is
`d0792a3d5698af85a5d7f4de845b12fd16fdaf1e91d04135a3f31d8f1985592a`.

Nineteen saved PDFs,64 pages and eight literal5329 fields were reopened with
pypdf: hashes match, private identifiers are absent and every page has one
review-only notice. Author and separate reviewer inspected all page contacts,
all footer crops, readable original1099-Q pages1-3 and both physical5329
controls. No clipping, overlap or amount finding was observed. Evidence is in
`.local/upgrade-evidence/distinct-qtp-esa-artifacts`, with separate
`federal-distinct-qtp-pdf-review.json`.

The independent agent checked every owned hash in a separate clone, refreshed
IRC529/Pub970/Notice2016-13, and passed10 cases across6 files, including4 new
private controls. Different original earnings ratios give1300 taxable/100 tax;
three QTP originals across three or four expenses give770 taxable/47 tax.
Exact300.00000000000000000001 allocations, reversed sources, cross-original
conflicts, ESA capacity and a balanced stale source edit before PDF I/O were
checked. One initial reviewer error regex was too narrow for an earlier correct
Box1 rejection; only that expectation changed, with the original log retained.
No actionable finding remains within the bounded method. The review log SHA256
is `cd205b50b62a797b763bf65d058133964d713bf5c70e8ad4992d5126c41e2758`.
This is agent source/software review, not qualified human tax review.

Final integration adds rule provenance2025.137/2026.134-law-integration-draft
and this evidence record. No calculation/readiness gate is promoted. The final
commit, remote verification and integration checks are retained in the central
checklist and local `distinct-qtp-esa-delivery.json` receipt.
