# Form 8815 reference packet completeness

A positive savings-bond exclusion could produce a guided review cover stating
“Packet completeness status: supported” even though the packet contains only a
Form 8815 reference summary. The readiness assessment now reports partial
completeness and identifies that limitation. An absent reference or an
unqualified official-looking filename also stays partial. Zero or absent
exclusions alone do not introduce a Form 8815 requirement.

The [official Form 8815](https://www.irs.gov/pub/irs-pdf/f8815.pdf), refreshed
October 27, 2026, requires attachment to the return and reports the exclusion on
line 14. A reference summary is not a qualified physical form. Calculation
support, the review notice, filingQualified=false and unvalidated business rules
remain unchanged. No monetary calculation changed.

## Verification and independent review

Two spec entries preceded the retained failing controls: two failures and one
pass in two files. The corrected source passes 24 tests in three files with one
worker, including actual saved-cover extraction and the existing original-fact,
redaction and encrypted-recovery assertions. Root/web types, 5,903 spec
references, the unchanged 556-entry inventory and scoped lint pass.

A separate agent verified all 3,585 tracked hashes and all four changed files
before and after review. Its 29 tests in four files include five private controls
for independently derived exclusions, misleading filenames, exact reference
matching, zero exclusions, unsupported-state preservation and the saved cover.
The actual 16-page saved packet was reopened; the cover was visually checked for
readability, reference limitations and review notices. This is a software review,
not independent human tax or form qualification.

The frozen review manifest SHA256 is
`3f6a0e33810ca5e0d82c0fb98038085d3d8b8bb42635bb8be0d1f602840eec36`.
The independent report `.local/upgrade-evidence/federal-form8815-independent-review.json`
has SHA256 `d56b5c5f0f190052ea8bc6207df389ce9026da897c81d58c740d637cd90d0ce6`;
its passing test log SHA256 is
`f4781bed0bc628edc903f42580c86bbd398b463331f604f9b86bd590c54612a9`.
Main red/green/static log hashes and exact source hashes are retained in
`.local/upgrade-evidence/parent-form8815-readiness-main-checks.json`.

The original bond-reissue PDFs retain the three incorrect supported-cover labels
that exposed this finding. Their source and artifact hashes are unchanged. Final
bond integration must generate and inspect new partial covers; these earlier
PDFs are not presented as corrected artifacts.
