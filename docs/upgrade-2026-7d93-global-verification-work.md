# November 5 current-source unit and coverage verification

Exact `7d93fd67ff8d4cc2bce8eb0a120e0b893903ec9d` passes the full unit and
coverage suites: **26,262 tests across 1,904 files on each run**, with no reported
failure or skip. All 53 PostgreSQL-backed cases run on both passes against the
existing disposable local database. No deployment database or provider call is
included. Model-source freshness also passes.

Commands are `pnpm eval:models:check`, `pnpm test --maxWorkers=2` and
`pnpm test:coverage --maxWorkers=2`, using Node 26.13.0, pnpm 10.34.8 and the
configured Python/pypdf test environment. Unit takes 597.60 seconds; coverage
takes 849.58 seconds. The normal and coverage test deadlines are unchanged.
All 5,252 captured public source/document hashes remain identical before and
after the checks and at final closure; HEAD also stays fixed.

| Metric | Actual | Unchanged threshold |
| --- | ---: | ---: |
| Statements | 91.82% | 90% |
| Branches | 87.61% | 85% |
| Functions | 90.81% | 90% |
| Lines | 95.09% | 90% |

The root verifier reconstructs these percentages from the retained original
Istanbul hit counters. Raw stdout/stderr, commands, source pins, intent,
coverage JSON/clover/index and reconstruction script are frozen locally in
`.local/upgrade-evidence/nov05-final-finite-global-integration/`.
Its verified 16-member manifest is
`07b1eb3a80dbd987b0c8956c6f8bfa055e4a656355c094f666851e5565e6f56f`.
No coverage threshold, inclusion, assertion or readiness gate changes.

These receipts include the committed SSA source safeguard, PA source/native
payment packages, passenger collector/browser sources and Ohio school/business
drafts through `7d93fd67`. Earlier full-suite figures remain historical.
Package type/spec/inventory/lint/build receipts remain separately attributed in
their work ledgers; these three commands do not constitute a new full browser,
container, staging or native-platform pass.

Private successors remain outside this tested revision. Independent review held
the PA mixed-residency candidate for two contradictory zero-presence source
records, and held the proposed PA payment browser test for five omitted private
reference assertions. Both original failures are retained and require reviewed
successors. No actual outgoing leak was demonstrated by the assertion review.
The finite prepaid mortgage-insurance source method is also still private work.

Qualified human reviews, representative held-out AI evidence, final 2026 forms,
advisory disposition, integrated hosted checks and qualified distribution
artifacts remain required. The upgrade is not release-ready.
