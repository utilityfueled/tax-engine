# Marketplace overlapping policy sources

This package extends the actual Situation 4 agreement/default and unshared policy
method to overlapping months. Each original policy and its Part IV allocation
period remains separate. The return consumes one derived household row per month.
It does not change original statements or allow an entered credit override.

## Source derivation

Refreshed October 26, 2026:

- [Final Form 8962 instructions](https://www.irs.gov/instructions/i8962), monthly
  columns (a), (b), (f), and Part IV line 34: sum allocated and unallocated
  premiums/advances; add allocated benchmarks to the applicable unallocated
  family benchmark. Multiple statements do not create duplicate benchmarks.
- [26 CFR 1.36B-3(f)(4)–(5)](https://www.ecfr.gov/current/title-26/section-1.36B-3)
  distinguishes family members residing in different locations and applicable
  family or multiple-self-only benchmarks. Actual Marketplace records determine
  the applicable amount; the software does not price a plan or infer geography.

When two or more unshared policies overlap, a source packet binds the actual
year, original policy indexes, active people, rating-area groups, benchmark
references and complete-history confirmations. Every policy appears once.
Each group's original benchmarks must be numeric, confirmed correct and equal
to the group's actual applicable benchmark. A person cannot simultaneously be
assigned to different location groups. Same-area groups must be combined.
One unshared source requires no fabricated group. Situation 4 allocated
benchmarks are added as directed by column (b), independently of those groups.

Exact source-derived amounts are summed before monthly whole-dollar reporting.
The worked tests are independently derived controls, not published IRS worked
examples or independent human tax qualification:

- `.25/.50` on premiums `1000.01/100.03`, benchmarks `1200.01/80.03` and advances
  `200.01/20.03` gives exact `300.0175/340.0175/60.0175`. With zero monthly
  contribution, reported credit/advances/net are `300/60/240`.
- Allocated `250/300/50` plus two unshared `600/450/100` sources in one actual
  group gives `1450/750/250`, credit `750`, net `500`.
- Separately sourced unshared benchmarks `450/500` give `1450/1250/250`, credit
  `1250`, net `1000`. Equal amounts alone cannot establish a common group.

## Source and review behavior

The guided credits screen copies actual overlapping months, leaves grouping
facts unknown, and lets the user select original policies into source groups.
The active covered people are copied from those selected originals; group
benchmark and confirmations remain separate source answers. Edits revoke all
relevant confirmations. Household eligibility remains independently required.

The physical form retains each original allocation period and prints one
household calculation. Its reference copy adds per-policy ordinals and the
combined month/group trace. An unforgeable original-input token binds all
source grouping and retained calculation values before render redaction.
No private references, rating areas or original identifiers are emitted in
the new reference rows.

## Verification

Spec preceded four core red failures, two helper/DOM red failures and the saved
PDF red failure (`source advance totals disagree`, demonstrating the prior
per-policy overwrite). The first completed focused run passed 31 tests across
10 files. Frozen tree `207d1cf1f7c2e6fec7af91ae4ea675b4b58afa35` then passed
1,008 tests across 125 files, including the six strict spec checks; root and web
types; 5,162/5,162 spec references; production web build; and scoped lint with
zero errors and 15 warnings (including four new non-null-assertion warnings).
The two production browser cases at 1280 and 390 pixels passed with zero
retries. Both saved screenshots were inspected; the source controls remain
readable without horizontal overflow. Actual benchmark edits revoke source
confirmation and the incomplete source persists as incomplete after reload.

Six actual saved PDFs were reopened using pypdf, checking 31 literal fields,
all 17 page notices, and absence of raw taxpayer identifiers, rating areas and
private benchmark references. All 17 pages and footer strips were rendered and
inspected; physical pages and the combined household reference trace were also
inspected at readable scale. Artifacts, hashes, reader results and renders are
under `.local/upgrade-evidence/marketplace-overlap-pdf/`, with the exact reader
record in `saved-pdf-verification.json`. The first ad hoc reader check expected
300 rather than 340 in allocated-only column (d); the actual form correctly
uses benchmark minus contribution (340), before column (e)'s premium cap (300).
Only that reader expectation was corrected; no product changed.

Independent parent source/software review verified all 21 owned hashes and
passed 12 tests across five files, including five independent controls for
pre-rounding aggregation, equal-money distinct groups, partial overlaps,
contradictory person/group membership and stale entered totals. The parent
independently reopened the six exact saved PDFs, checked 27 monthly/total
fields and tested identifiers, and inspected the all-page contact sheet and
readable group trace. The initial private reviewer control used an unsupported
amount spelling; only that private fixture was corrected, with the failed log
retained. The review record is
`.local/upgrade-evidence/parent-marketplace-overlap-review.json`.
These are bounded software/source reviews, not independent human tax or form
qualification.

Final private rebase onto `67ce5a506742783050fb703f1aa5c34c6b0f5559`
preserves all 20 reviewed non-ledger product/spec/test blobs. Only this evidence
ledger and the rule-pack provenance/version entries differ: 2025.122 and
2026.119-law-integration-draft, with all readiness gates unchanged. Fresh final
checks passed 28 tests in nine files plus 10 metadata/private-context tests in
two files, root and web types, 5,188 spec references, and scoped lint with zero
errors and the same 15 warnings. The earlier full relevant cohort, production
browser and saved PDF evidence applies to the identical reviewed source blobs.
The main-checkout integration passes 14 tests across six files, including the
rule-pack gate tests; `git diff --check` is clean.

Evidence logs under `.local/upgrade-evidence/marketplace-overlap-*` retain red
and green results. No full 2026 or filing-readiness gate is opened.

## Remaining distinct methods

Overlapping Situation 3 no-advance policies need complete coverage-family
benchmark coordination beyond the existing per-policy subset proof; that
ordinary implementation remains unfinished. Missing/printed-blank/corrected
unshared benchmarks, shared-policy marriage/divorce/health combinations and
special eligibility methods retain their precise source-method boundaries.
This package does not settle historical two-owner capped-repayment attribution.
