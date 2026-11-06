# Marriage-year Marketplace source binding

This package binds the completed alternative-family source facts to original
Forms1095-A. It is a source-only prerequisite; the return calculator still
rejects a marriage election until the separate canonical handoff is installed.

The source packet retains the actual marriage date, January and December status,
both filer identities, each dependent's separate qualification and assignment,
original policy snapshots, full-month coverage evidence, and independently
sourced monthly benchmarks. Missing answers remain unknown. Source validation
does not require or invent current income, credit, contribution or repayment.
The canonical calculation will supply actual household income separately.

Pub974 Steps2/4 group premiums by the actual recipient of the original policy.
Alternative family size follows the actual dependent qualification rules. These
are distinct: moving a dependent who qualifies for both spouses changes family
size without moving that child's original policy premiums. Multiple policies
for the same recipient retain exact cents and share one corrected benchmark.
Every original record remains unchanged, including zero months outside the
actual alternative coverage interval.

The initial route requires MFJ, both filers unclaimable, ordinary eligible
full-month coverage, and all policies sent to either filer. Shared-policy,
self-employed-health, QSEHRA, special enrollment and below-poverty coordination
retain separate methods. First-day marriages remain a named source-method
boundary pending reconciliation of the regulation's full-married-month wording
with Pub974's month-of-marriage instruction; no date or interval is invented.

Sources refreshed2026-10-25:

- https://www.irs.gov/publications/p974 — Alternative Family Size, TableA,
  Steps2/4, WorksheetsI/III lines8–9.
- https://www.irs.gov/instructions/i8962 — Table4 and PartV.
- https://www.ecfr.gov/current/title-26/section-1.36B-4 — paragraph(b)(2).

The five initial source tests failed before implementation because the source
module did not exist, then passed. Two additional controls verify300.01+200.02
raw premiums with an independently sourced433.11 benchmark and a spouse without
pre-marriage coverage. Root types and product/test lint pass. The exact b601babf review archive passed138 tests across7files, root and web
typechecks,4905 spec references, and product/test lint with no findings.
This evidence does not qualify a return for filing or change the closed2026
readiness gate.

Independent bounded review of b601babf refreshed the official sources and
passed seven owned plus four independent source probes (36 runner tests include
25 prerequisite cases). The probes covered normalized household duplicates,
cross-owner coverage, outside people, a coverage gap with7883 actual advances,
benchmark cents, stale500.001 source amounts, and qualification versus premium
grouping. No actionable finding was reported. Reviewer-only probes remain in
the private archive; evidence is ai-marriage-sources-review.log and its summary.
This is agent software/source review, not independent human tax qualification.

Final rebase on6a90c81 produced source tree891ed079. All five standalone
product/spec/test blobs exactly match reviewed b601; inputs.ts adds only the
marriage schema import and optional source field. Fresh112 tests across5files
(including strict YAML test references) and root types pass. No reviewer-only
probe or canonical marriage activation is included.
