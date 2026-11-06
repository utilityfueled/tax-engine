# Form 4562 owner year and defaults

Form 4562 now uses its actual parent return year in the business, rental,
source-validation, PA rejection and reference-summary paths. A conflicting
nested year fails before calculation. The published §179 defaults are
$2,500,000 / $4,000,000 for 2025 and $2,560,000 / $4,090,000 for 2026.
The audit identifies the matching statutory and carryover years.
Sources: [Rev. Proc. 2025-32, section 4.24 and 2025 amendment](https://www.irs.gov/irb/2025-45_IRB)
and [Publication 946](https://www.irs.gov/publications/p946), refreshed November 5.

Canonical parsing previously converted four missing overrides into explicit
zeroes, suppressing defaults and computed deductions. Maximum, threshold,
direct deduction and closing carry overrides now preserve absence. An actual
zero remains zero, including existing saved zeroes; their intent is never guessed.

The spec preceded implementation. Four corrected regressions fail against the
published source; additional audit and canonical-parser regressions each fail
before their fixes. Initial fixture and type errors remain in the evidence.
The final tests use actual canonical schemas and a fictional household.

- Focused checks: 243 tests in six files; adjacent checks: 45 in six files.
- Independent review: 31 distinct controls plus six spec regressions pass,
  including actual parser, caller conflicts, exact cents, zeroes, source guards,
  JSON replay, rounding and export denial. Scoped test typing passes.
- Root/web types, six spec references and the new zero-warning lint scope pass.
  Three pre-existing Schedule E lint warnings remain unchanged.

Private author evidence: `nov05-form4562-owner-year-implementation`, manifest
`23130384dd16ce716d5932dcb1ea17de3ef1f68479a56af980f9cc5d974729db`.
Independent manifests: `8a736e8e5d240833e0868e9bd077fa4a87e0af6026e9f222e900a736f33c8098`
and final supplement `f97c164381cc179b6cc5cadda584060fd35fbedeee35f2a40cf2dfdc685e69f6`.

This package preserves standalone legacy 2025 behavior and accepted summary
overrides; it does not prove those overrides correct. Asset basis/history,
election and income facts, ownerless legacy rental calculations, final 2026
forms, full integrated checks and qualified human review remain required.
Concurrent MACRS basis work is excluded from this commit. Filing and form
availability gates remain enforced.
