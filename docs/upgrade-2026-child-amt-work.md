# Actual child private activity bond sources

The Form8814 child worksheet now preserves actual exempt-interest statements
and transfers their net private activity bond preference into the parent's
Form6251 line2g. The parent's regular Form1040 line2a still excludes the child's
interest, and the actual dependent PTC worksheet retains its separate treatment.

Sources retrieved2026-10-25: [final2025 Form6251 line2g](https://www.irs.gov/instructions/i6251)
and [Form8814 AMT/line1b instructions](https://www.irs.gov/instructions/i8814).
The preference applies in the historical2025 and isolated2026 candidate paths;
this does not qualify final2026 forms or enable the rule pack.

The source contract requires child line1b itself, its complete matching
statement collection, actual INT9/DIV13 preference amounts including explicit
zero, the source year, and unique source IDs. Missing line1b no longer defaults
to zero. Any otherwise allowable deduction needs its completed source worksheet
and allowance/nonduplication confirmation. DIV13 already reflects fund expenses.
Decimal sums retain cents and apply the statutory zero floor.

The spec was written first. The canonical red case observed zero preference
where the independent source oracle was500; a second red case proved missing
child exempt interest was defaulted to zero. Core/source/canonical regressions
now pass, including historical-year behavior, wrong years, duplicates, unknown
boxes, mismatched totals, deductions and cents. Adjacent child/PDF/PTC cohort:
67 tests across six files pass. Existing synthetic PDF/PTC fixtures now state
their actual zero preference; original financial assertions remain intact.
The independent agent reread the official instructions and ran the four new
core/canonical cases with no actionable finding. This is code/source review,
not independent human tax qualification.

Evidence: `.local/upgrade-evidence/child-amt-*` and
`ai-child-amt-review.log`. Broader Form8814 election eligibility, guided intake,
parent INT/DIV preference sourcing and final form qualification remain separate
source work; this bounded transfer must not be described as complete Form8814
support. All existing filing and year readiness gates remain closed.

Full isolated verification used base67e1d94 and tree
`87027282610cc05a8ff994df20939585889a3fd2`: `pnpm test --maxWorkers=1`
passed17,158 tests across753 files in359.58 seconds, with the actual disposable
PostgreSQL16 integration service and configured pypdf interpreter. Root types
and4,013 spec references pass; scoped lint has zero errors and nine warnings.
The immutable snapshot excludes concurrent NIIT and Marketplace work.
Full-suite evidence SHA256: `14a33fec81592ad23e0326912be44c8af4f00082fb221cd7a6a58737e300bb7e`.
