# Form 8815 reference pagination

Independent inspection of the saved bond-reissue packet found a computed total
overlapping the review notice. Form 8815 reference text now starts a new page
before any wrapped line crosses the existing 40-point body margin. This includes
long audit descriptions, formulas and computed totals. Every added page keeps
the review-only notice; text, ordering, monetary values and calculation logic
are unchanged.

The spec entry preceded a saved-PDF regression. The retained baseline fails at
a body baseline of 35 points. The implementation passes 56 tests in five files
with one worker, including the saved-output geometry and existing readiness,
privacy and form checks. Root/web types, 5,921 spec references, the 557-entry
inventory and scoped lint pass. The main check record is
`.local/upgrade-evidence/parent-form8815-pagination-main-checks.json`; its green
log SHA256 is `56ffa3c3f3da5827f633ab20d92022d5e6c22abd4b48d86dc6f1737bb33189c6`.

A separate agent verified all 3,593 tracked and three changed-file hashes before
and after review, and passed 13 tests in five files including four private
controls. Its three candidate PDFs contain 12 pages, with body baselines at
least 45 points and one notice on every page. The unchanged baseline reproduces
an off-page baseline of -800 points for a long description and formula; the new
saved text is identical after whitespace and notice normalization. Independent
controls preserve a literal 750 exclusion, source/year rejection before output,
partial readiness, privacy and input immutability. Both contact sheets and three
readable pages were inspected. This is software/output review, not human tax or
physical-form qualification.

The frozen manifest SHA256 is
`3b96f73d1c6f2b0d9a523003b34dea1886a6e4d75b25541e59f9019aee560144`.
The independent report
`.local/upgrade-evidence/federal-form8815-pagination-independent-review.json`
has SHA256 `aecac43b836306444bc936c9ea8045286f512a1978483741f7d2c4a5a15a84ce`.
Its passing log SHA256 is
`1b009ca4c3d1dd0ebb6d139631417efccb0a403628bbb5bd787b0acad64b7f5e`.
The original bond-reissue artifact and review finding remain retained. Final
bond integration must regenerate and inspect that output with this renderer.
