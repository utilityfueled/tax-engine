# Shared implementation links in the coverage inventory

The filename heuristic marked implemented education, EIC, health and charity
methods as missing because their spec names differ from a shared engine module.
An explicit source manifest now records forty reviewed links. The generator
requires an existing spec, actual engine/optional PDF source files and resolving
regression references from that same spec. It rejects duplicate/stale entries,
unsafe paths, missing files and supplied coverage or qualification flags before
writing an inventory.

This is implementation traceability. The linked physical mappings are historical
2025 review output; their existence does not qualify 2026 output. Every spec's
complete test-reference and e-file/business-rule checks still run independently.
No map entry can set those flags or change a tax-year, filing, model or public
support gate. Unmapped entries still use the existing filename heuristic; a
missing inferred path is not proof that no shared implementation exists.

| Method group | Spec/test evidence | Implementation | Traceability result |
| --- | --- | --- | --- |
| Sixteen actual education distribution methods | Each original Form1099-Q spec and named regression | `src/engine/forms/form-1099-q.ts` | Shared engine and historical review source recorded |
| Three current/deceased Form8862 methods | Actual EIC and saved physical review regressions | `src/engine/forms/form-8862.ts` | Shared calculation and physical2025 mapping recorded |
| Four digital-asset methods | Original income/DeFi and appraisal threshold regressions | `src/engine/forms/crypto-lot-matching.ts` | Calculation link only; packet gap retained |
| Five current-charity/NOL methods | Actual original candidates and independent loss comparisons | Shared current-candidate and charitable NOL modules | Calculation and historical ScheduleA review source recorded |
| Twelve Marketplace methods | Actual allocation, owner, marriage and payment regressions | Shared8962 and health source modules | Calculation and historical8962/7206 review sources recorded |

The initial regression failed five cases against the old generated inventory;
all nineteen historical inventory cases still passed. After implementation,
38 tests in two files pass, including malformed metadata, changed/foreign test
references, path restrictions, missing files, duplicate keys and attempted
qualification promotions. Original red SHA256:
`e5d528ff24ab6712e3de9e5ea6da627143b8862183ecf0e59fb0687ffe1f1595`;
initial green SHA256:
`7c0708fb5327e7ea51454f70bf8878e4874a94bcbd88e79c7db35ad021465b2d`.

On the original515-entry base, exactly the forty linked entries change.
No source year, authority, spec/test coverage or business-rule flag changes;
zero entries become fully supported. Separate inventory readiness and actual
public capability descriptions remain unchanged. Final rebased verification
and separate review are recorded in the package delivery receipt. The broader
spec-to-code reconciliation continues; this package does not claim all unmapped
methods are missing or that the entire upgrade is complete.


## Verified delivery

Final review tree `803102071509194e03fd669995df64d5d983ebf7` is based on
`97be1c0db51ab72d854f97d099845663404846db`. The exact package passes
544 tests in five files, root types, all 5,486 spec references, inventory
freshness and scoped lint with no warnings or errors. The seven frozen source
hashes stayed unchanged. Test log SHA256:
`674644006101f4c2936224fb7281b38a4faaeb730a66bb6761de65c0d1e9eb06`.

Separate agent review passes 328 tests in 44 files, including all 41 referenced
test files and four private controls. It verifies all forty associations and
79 spec-owned references. Actual generator runs reject duplicate entries, a
missing source file, a real test from another spec and an injected readiness
flag without changing the prior inventory. Exactly forty of 517 rows change;
the other 477 rows and all source-year/spec/test/business-rule flags remain
unchanged. The fully-supported traceability count stays 69. Review log SHA256:
`89c0cf9db28d879076aaeb4d4c1ad0bd749b77c6ec9bf6ecfef23662d8a4cb63`.

The review's first private archive setup lacked an inherited Git object, and
its first tsx CLI invocation was blocked before startup by the local IPC
sandbox. Neither was a product result. Rebuilding the separate copy from the
committed base and invoking the standard package node/tsx entrypoint completed
all checks; the originals remain recorded. This package changes audit tooling
and traceability only, so no browser or runtime-image result is claimed.

Exact commands, hashes and review bounds are retained in
`.local/upgrade-evidence/inventory-source-links-exact-checks.json` and
`.local/upgrade-evidence/facts-inventory-source-review.json`. Agent review is not
independent human tax qualification. No release gate changed.
