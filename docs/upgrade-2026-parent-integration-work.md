# Passenger parent integration and browser candidate checks

The November 5 full unit and coverage runs each pass **25,965 tests across
1,892 files**, with no reported skips. Their tracked tax baseline is
`19bedea9a16c815e7a2fdc9ca92f14bade9ae30d`, together with six uncommitted,
reviewed browser-runner paths. This is a source-pinned integration result,
not a clean-commit or released-image qualification. Documentation-only
`8065eed0` follows without changing those tested application bytes.

The existing 53 PostgreSQL assertions ran against the owned disposable local
database. Neither full run reports source drift. The model-matrix check also
passes. No paid provider calls are made by these checks.

| Coverage | Independently counted covered/total | Result | Unchanged gate |
| --- | ---: | ---: | ---: |
| Statements | 80,692 / 87,879 | 91.82% | 90% |
| Branches | 73,473 / 83,880 | 87.59% | 85% |
| Functions | 15,981 / 17,596 | 90.82% | 90% |
| Lines | 63,061 / 66,313 | 95.09% | 90% |

The line totals are Clover's covered-statement/source-line totals; the
statement, branch and function totals were independently counted from raw
Istanbul output. Raw coverage, Clover, commands, logs and exact source pins
are retained in `.local/upgrade-evidence/nov05-integrated-parent-browser-tests/`.
Its 13-member manifest is
`e3186dcb0a0c55586ba11340f74ddb4444c1570e1cee954b9facafae8d14865e`.
Actual unit duration is 592.175 seconds; coverage is 796.636 seconds.

The parent package separately passes root, contracts and web types, spec
validation, engine and webpack web builds, and repository lint. Its first
inventory check fails because the new spec has no generated traceability row.
Ordinary regeneration adds one partial row, preserves all 876 prior rows and
all 68 supported classifications, then `spec:inventory:check` and all 66
inventory/spec tests pass. The original failed check remains retained in
`.local/upgrade-evidence/nov05-passenger-parent-main-integration/`; its original
aggregate receipt is not relabeled as a successful run. See the
[parent implementation ledger](upgrade-2026-passenger-parent-work.md).

The separate full managed `pnpm test:web --retries=0` successor now closes with
569 passes, five original hosted-only skips and zero failures/retries. Its
[source/build, exact collection and cleanup evidence](upgrade-2026-portable-browser-work.md)
is preserved separately from these full unit/coverage receipts.
The earlier run's 111 successful cases followed by build-cache drift remain
a failed full run. Hosted-only browser skips cannot establish hosted readiness.
All final-image, remote-CI, hosted/native, independent-human, final-form and
release gates remain open. Filing and model promotion remain disabled.
