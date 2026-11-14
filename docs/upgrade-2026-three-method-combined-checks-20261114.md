# Combined checks for three tax source methods

All twelve local checks pass on exact archived
`61ca18f73df949f92261e365b471a2c21cf04d29`, covering the special-rate Schedule AI,
fully absorbed prior charitable category, and Chapter 12/history packages.
The later canceled-debt admission and market-discount packages are outside this
source boundary and require their own combined successor checks.

Four isolated lanes ran concurrently, with independent source directories and
filtered environments. Unit and coverage each used four workers and a separate
owned SCRAM PostgreSQL 16.16 instance. Browser execution preserved two workers,
zero retries, the actual 30-second case deadline and unchanged request budgets.
No production, provider or paid-service request was made by these lanes.

| Check | Actual result |
| --- | --- |
| Engine, contract and web types | Passed |
| Spec validation and generated inventory | Passed |
| Engine and production web builds | Passed |
| Model configuration check and lint | Passed |
| Unit | 28,352 tests in 2,050 files passed |
| Coverage | 28,352 tests passed; 92% statements, 88.03% branches, 91.13% functions, 95.27% lines |
| Browser | 627 collected; 622 passed, five original hosted skips, zero failures/retries |

The root review independently reconciled all eight actual browser reports to
the complete request audit. Every case has one actual result, both worker and
retry settings match, and the five original skip contracts remain unchanged.
All tracked sources remained unchanged across checks. The browser server closed
normally, both owned databases stopped normally, and their temporary private
connection/pass files were removed.

Private lane results are under `nov14-main-parallel-61ca18f7`. The separate root
review is `root-review/review.json`, SHA-256
`fb67765eade280851c6241d9a1db77f1607f92a65c1ea70202839d04ded1cee9`.
It pins all four terminal result receipts and actual browser plan, summary,
cleanup and source/build identities. Terminal exit zero was acknowledged for
all four controllers.

This verifies the named local source. It does not replace qualified human tax
review, final 2026 forms, actual current-source hosted/native artifacts, native
AMD64 evidence, security disposition or remote CI. Main remains local under the
production push hold; filing and model promotion remain disabled.
