# Actual EIC claimant review checkboxes

The first bounded package maps a confirmed, disqualifying Rule10/13 claimant
answer to final2025 Form1040 line27c. The same fact applies when a claimant has
their own qualifying child. It uses the existing source resolver's completed
answer after the nonfiling/refund-only exception; a dependent relationship or
zero credit alone does not establish the answer. Unknown historical facts and
an actual false answer remain unmarked. No voluntary opt-out is inferred.

Official sources refreshed 2026-10-26 UTC:

- [Pub596, Rules10/13 and filing exception](https://www.irs.gov/publications/p596)
  explicitly directs the mark when the claimant is another taxpayer's EIC
  qualifying child. The actual exception can make that completed answer false.
- [Final2025 Form1040](https://www.irs.gov/pub/irs-prior/f1040--2025.pdf), page2,
  identifies line27c. The local official template SHA256 is
  `3d31c226df0d189ced80e039d01cf0f8820c1019681a0f0ca6264de277b7e982`.

The canonical helper exposes its already-resolved optional answer. The mapper
checks source contradictions and a stale positive EIC before PDF access, then
fills the physical `c2_13[0]` widget. The adjacent clergy checkbox is untouched.
This does not change EIC eligibility or arithmetic. The 2026 export and filing
qualification gates remain closed.

Spec-first evidence is retained privately in
`/private/tmp/tax-release-prereq-review-UEk43F/eic-27c-red.log`: the saved checkbox
was false for the actual restriction, and stale positive credit reached file
access rather than rejecting first. The original correction passed 46 tests
across five files. The permanent saved-PDF case also covers an 18-year-old
claimant with their own child, the actual filing-exception false answer, absent
historical sources, matching checkbox value/appearance and redacted identifiers.

The saved two-page synthetic review artifact was independently reopened with
pypdf: line27c is `/1`, zero line27a is blank under existing currency formatting,
and original identifiers are absent. Both pages were rendered and inspected;
the checkbox is aligned, neighboring27b is unmarked, and review-only footers
remain visible. Artifact SHA256:
`03f6289605882d59700212eb68f209e26e6efe68b4f39df16a1f8d7daaac3da3`.
Evidence is in the private `eic-27c-review` directory beside the logs.

Other explicit Pub596 printed conditions (Rules2/4/11/14 and the page1 home
answer) are assigned to a separate source/PDF follow-up. They are not claimed
complete by this Rule10 package. Independent agent review is separate from
human tax and form qualification.

The final owned source/PDF/strict-reference and workspace integration cohort
passed 67 tests across six files. Root types, all 5,047 spec references and
scoped lint passed. The archive preserves the existing claimant eligibility
arithmetic and has no metadata change; independent review follows separately.

Parent independent review verified all five frozen hashes on the current EIC
table/math overlay, refreshed official Pub596 and i1040gi, and passed 49 tests
across six files. Its three new private controls cover the preserved source
spelling, a changed source year and an audit-only stale positive credit. Both
saved pages and widget appearances were independently reopened and visually
inspected. No actionable finding remained in this bounded review. The review
log is `parent-eic-27c-review.log`, SHA256
`4f982301c20fb46c2ca367b571b177d57afea75a232ddce10ac73d06e0fdebd2`.
Final integration on `768a987` preserves all four reviewed product/spec/test
blobs; only this evidence appendix differs. No metadata changes are included.
The final combined integration cohort passed 67 tests across six files and
root types after the EIC table/math and marriage packages landed.
