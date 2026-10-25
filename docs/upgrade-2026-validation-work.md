# Integrated validation evidence

## Immutable run at 2f8abd7 — 2026-10-25

`pnpm test:coverage --maxWorkers=1 --coverage.reportOnFailure` ran in a tracked-file
archive of `2f8abd71206dd8483c167861f35c4c0bbecdad7a`, with matching locked
dependencies, pinned Python/pypdf and a disposable local PostgreSQL 16 database.
It passed 16,677 tests and failed two across 669 files in 476.95 seconds.
Coverage was 86.41% branches, 92.03% functions, 92.76% statements and 94.33% lines.
All unchanged coverage thresholds were met; the command failed because of tests.

Both failures reached the unchanged 5,000 ms test timeout: the review-notice
case loaded, saved and reopened all 41 registered templates in one test, and
the federal-only routing case generated both Pennsylvania- and Ohio-address
packets in one test. No numeric tax assertion failed in this run. Evidence:
`.local/upgrade-evidence/stable-coverage-2f8abd7.log`.

## Individual PDF cases

Each registered template and each PA/OH routing scenario now has its own named
test. The same registered-template enumeration, metadata and visible notice
assertions, state-routing assertions and 5,000 ms timeout are retained. Spec
references were updated to the parameterized names. No case, assertion, coverage
path or readiness control was removed; runtime code did not change.

All 62 tests pass in the focused plain run (21.05 seconds) and under coverage
instrumentation (34.25 seconds), with no timeout changes. The focused coverage
diagnostic intentionally ran only those two suites and failed global coverage
thresholds; it is not a global gate result. Web types, all 3,698 then-current
spec references and scoped lint pass (four existing test non-null warnings).
The diff was reviewed. Evidence: `pdf-case-isolation-green.log` and
`pdf-case-isolation-coverage.log` under `.local/upgrade-evidence/`.

Newer implementation packages and the case split require a fresh full run.
Hosted staging, final forms, independent human review and live AI qualification
remain separate unmet requirements.
