# Shared and unshared Marketplace months

The shared-policy source ledger previously required another taxpayer for every
original policy. A taxpayer with a shared policy for part of the year and a
household-only policy in other months could not complete the ordinary monthly
reconciliation. This package derives the full amounts from each explicitly
unshared original and creates Part IV periods only for the actual shared policies.

The [current Form 8962 instructions](https://www.irs.gov/instructions/i8962),
refreshed on 2026-10-26, direct the taxpayer to combine allocated and nonallocated
amounts in the monthly columns after Part IV. Columns (a) and (f) add premiums
and advances; column (b) has separate rules for overlapping coverage and household
benchmarks. This package supports disjoint months. It does not derive a benchmark
for overlapping policies or replace an actual printed blank with zero.

An unshared source requires its original year, policy identity, recipient,
covered people, monthly amounts and exact matching snapshot. The recipient must
be an actual return filer, every covered person must match this tax family, and
the source reference and correct original benchmark confirmation are explicit.
Missing answers remain unknown. Conflicting agreement or other-family inputs
reject. Original source amounts and identities remain unchanged.

The guided controls capture this classification without requesting another
taxpayer or an allocation fraction. Selecting another method clears incompatible
answers and recreates unknown rows from the original record. Source edits revoke
the allocation and Marketplace confirmations. Review output retains full original
amounts and identifies the unallocated monthly amounts separately; the validated
original-input context binds classification and amounts before redaction.

The spec preceded four failing engine cases and three failing guide/DOM/PDF
cases. The ordinary literal uses six allocated months at 500/450/250 and six
unshared months at 700/650/300. At a monthly contribution of 49, credit is 6012,
advances are 3300 and net credit is 2712. A separate no-advance shared source
combined with the same unshared months yields 7608/1800/5808, retaining its exact
benchmark ratio independently of the printed Part IV fraction.

Verification on immutable `d7c53dc900cc795ff45070b409d1c60d471b213e`:
1,127 tests in 147 files passed, including strict spec parsing and actual workspace
export; root and web TypeScript checks passed; all 5,135 spec references resolve.
Scoped lint has zero errors and 196 non-null assertion warnings in the scoped
source and test files; no lint configuration changes. The production build passed. Desktop and
390-pixel production browser cases both passed without retries, preserving actual
sources, unknown answers and reconfirmation across reload. Both screenshots were
inspected; no horizontal overflow or identifier request leakage was observed.

The actual saved Form 8962 has two pages and SHA-256
`79592521da087cda00605dc3ff3d51884463703ecc0d0d841ffb9c113fbd2fe5`.
The saved reference has nine pages and SHA-256
`026a0667d408b72e921fc9248be1c8b14025450981a69717ac615d198bde2b09`.
The independent pypdf reader checked 12 physical fields, all 11 page notices and
absence of source SSNs/private references. Every rendered page and a separate
footer strip were inspected. The unshared months show 700/650/49/601/601/300;
Part IV has only the actual shared 01–06 period. Evidence is retained under
`.local/upgrade-evidence/shared-unshared-pdf/inspection.json`, with exact test,
static and browser logs under the same evidence root.

Independent source/software review passed 20 tests in five files, including four
additional controls. The reviewer verified all 14 frozen hashes, refreshed the
Form 8962 instructions, reopened both saved PDF hashes and all 12 literal fields,
and inspected both physical pages, the reference and every page footer. The
review log is `parent-shared-unshared-review.log`, SHA-256
`5c28c974c698a8c4041c30c163ae9fdaae0fc9205453dfeb070b7772edac9e1b`.
No actionable finding remains in this bounded method. This agent review and the
recorded automated/visual checks do not establish independent human tax or form
qualification. Full 2026 qualification remains closed.

Final integration on `0871438a7b27a846e94bea24cecc0bbc4d30d8ae` preserves all
13 reviewed implementation, spec and test blobs. The final eight-file cohort
passed 33 tests; root and web TypeScript checks passed and all 5,141 spec
references resolve. Rule versions are 2025.118 and 2026.115; qualification and
calculation gates are unchanged. Exact final logs use the
`shared-unshared-final-` prefix in the evidence directory.
