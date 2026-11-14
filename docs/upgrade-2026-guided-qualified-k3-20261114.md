# Guided qualified K-3 portfolio sources

Local `main` commit `33f8f784` lets the guided interview supply original
partnership K-1 and qualified K-3 facts to the existing foreign-tax-credit
election without Form 1116. Previously the engine supported this finite path,
but the guide always supplied an empty pass-through source list.

The collector requires the actual year, entity and taxpayer identity, original
K-1 and K-3 references, passive foreign portfolio income, country, exact tax,
outside basis and explicit zero-history answers. Interest plus ordinary
dividends must equal the original foreign income; qualified dividends remain a
subset. The existing Decimal basis calculation must allow the entire foreign
tax. The existing annual source reconciliation, creditability, carry-history and
exact $300/$600 aggregate gates remain authoritative. Changes revoke source and
election confirmations. Missing amounts remain missing, separately from known
zero. No engine formula or filing gate changed.

This route excludes mixed allocations, other partnership items, existing
suspensions, a basis shortfall, bare K-1 statements, S corporations, Form 1116
and deduction treatment. Separate qualified-loss, charitable and minimum-tax
source compositions retain their guards.

The [IRS final 2025 Form 1116 instructions](https://www.irs.gov/instructions/i1116),
refreshed November 14, explicitly include Schedule K-3 among qualified payee
statements for the election. [IRC 904(j)](https://uscode.house.gov/us/usc/119-118/t26/s904/)
and the existing basis method supply the other recorded authority. This is
software admission evidence; qualified human review and final 2026 filing
qualification remain outstanding.

The spec preceded real failing navigation/canonical-input regressions. The
independent reviewer also retained seven initial failures and caught source
reference binding and an unrelated minimum-tax regression before correction.
All 144 focused tests across ten files pass, including 73 independent cases.
Independent tests cover exact limits and basis shortfalls, stale/reordered
sources, owner/year continuity and actual metadata/provider privacy projections.
The fictional exact-tax example is $200.25 plus $50.00, rounded once to $250;
it is not represented as an IRS worked example.

The production browser passed both new 1280px and 375px journeys, with the new
original fields typed through visible controls, reload/edit checks, zero
retries and zero protected API requests. All 623 existing browser cases and
request budgets are unchanged; collection now contains 625 cases. Web types,
scoped lint, all 9,063 spec references, inventory and source audit pass.

All twelve required local commands now pass with explicit source mapping:
static, unit and coverage ran on `a396d2c2`; the full managed browser ran on
`33f8f784`. The original unit and coverage executions each passed 28,321 tests
and failed one unchanged strict diagnostic-audit pin assertion. `a396d2c2`
refreshes only three diagnostic metadata fields from the actual strict 625-case
collection. Between those heads, the other five changed paths are ledger
documents; all application, engine, spec, fixture, test, lock and browser-budget
bytes are identical. The original failures remain recorded.

The successful successor passes all 28,322 tests in 2,039 files in each of unit and
coverage, with 88.02% branches against the unchanged 85% gate. Both isolated
PostgreSQL clusters stop normally. The browser passes 620 cases with five original
hosted-only skips and no observed retry. Its existing one-retry configuration,
two workers, request limits and deadlines remain unchanged. All three type
checks, spec/inventory, both builds and lint pass, plus model-configuration
validation. Four-worker unit/coverage and the independently archived browser
lane ran in parallel.

Root source-equivalence receipt SHA-256 is
`b519870b0927420c1337d6d78659523633dccec889477da91cf9ac16303ab19c`;
the independent mapped-result audit is
`afde11fc5bee2c30ba53292235fabd33b6d2ad22a54cab59b8b8b4ed44dd2b53`.
Separate actual executions now pass: the protected hosted `33f8` bundle passes
both typed desktop/mobile journeys with cleanup; native ARM64 `a396` passes
all four workloads, six recovery phases and 620 browser cases/five original
skips with normal VM cleanup. Independent saved-evidence reviews pass.
[Hosted evidence](upgrade-2026-hosted-k3-20261114.md) and
[native evidence](upgrade-2026-current-arm64-rehearsal-20261114.md) retain their
exact source, failures and remaining qualification limits.

The private frozen author receipt has SHA-256
`19268e829bee80bb3b2290626899bfb3a97f46bcd41cfda2c7716860fe60e413`;
independent review receipt SHA-256 is
`23f914d9f408b2a99ba03e5d874e57e18767054cb0ef86df54c124fede922bfa`.
Root independently checked all thirteen source hashes and equality of every
original browser budget entry before committing. Commits remain local under
the production-deployment push hold.

The unassigned human review handoff includes the exact fixture in
`tests/fixtures/guided-foreign-tax-k3.ts`, the spec and all thirteen frozen file
hashes in the author receipt above. The reviewer must independently determine
eligibility and allowed credit for the $200.25/$50.00 example, the exact
$300/$600 boundaries, the fractional basis-shortfall rejection, the zero-tax
foreign-income completeness rule and the distinction between FTC passive
category and section 469 portfolio income. Reviewer identity, credentials,
independent results, supporting authority and acceptance are all **pending**.
The existing human packet's fixed `9b6202e7` index does not cover this later
source addition; this handoff is an explicit delta, with no inferred signature.

The [separate human source delta](upgrade-2026-human-tax-review-delta-33f8f784.md)
now delivers all thirteen exact committed files and blank 2025/2026 decisions,
without relabeling the earlier 9b packet or supplying expected human results.
The stale unsupported-method register now distinguishes this delivered narrow
route from guarded Form 1116, deduction, mixed and suspended methods.
