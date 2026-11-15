# Integrated source 9b2d6cbb: actual checks and remaining failures

These observations apply to exact source
`9b2d6cbb1868aa93d2f624251215eac182db04c7`, before the separate AMD64 candidate
workflow and recovery cold-import fix. They do not establish release readiness.
The tracked-only source archive SHA256 is
`9411245ef1cbdf6ea3104fadc4463d8844c50f3f837c11d6fec350ab56c25e2a`.

## Local and ARM64 execution

All twelve mapped local checks pass. Unit and coverage each execute 28,696 tests
in 2,096 files with four workers. Coverage is 92.01% statements, 88.12% branches,
90.99% functions and 95.27% lines, exceeding unchanged 90/85/90/90 floors. The
browser suite executes 643 cases: 638 pass and five original hosted cases skip.
It uses two workers, zero retries and the original deadlines. Both owned local
databases and the browser server close normally.

The ARM64 image build, smoke, scan, six stock-Compose recovery phases and browser
suite pass. Its browser result is the same 638 passes/five original skips. All
24 supervised stages complete, followed by normal VM stop and restoration of
original resources and socket/default routing. A later separate XML-corpus
startup hit a conservative process-group hold; its distinct normal restoration
also passes. No XML-corpus case executed in that failed attempt.

Actual ARM64 image:
`d2d477bd1ae64484ed5535eb78320245d7bec12b6e26f03d29414787ec3fe08c`.
Archive SHA256:
`a78d751c10ce3eb644c56372dff7f8a132d50921399531bdb79f205cf821499e`.
Independent and root artifact reviews verify source, executed case identities,
image/archive bindings, recovery evidence and normal cleanup.

## Protected Preview execution

All 105 bounded HTTP cases and four actual desktop/mobile Coverdell/household
journeys pass. Counters total 925 of the 1,310-operation ceiling. No paid provider
calls occur. Existing fictional actors, no-card Sandbox trials, sessions,
workspace shells, temporary deployment/settings and owned cache entries are
cleaned up; signed cancellation revokes both subscriptions' access. The Preview
is deleted and its webhook/settings restored. This establishes only the observed
synthetic routes. It does not qualify annual 2026 calculations or filing exports.

## Remote failures retained

Remote CI unit tests pass all 28,696 cases. Coverage fails its recovery command's
unchanged 4,500 ms child deadline. The separate cold-import package addresses an
unnecessary calculation-engine import; the failed CI result remains retained.

Remote self-host browser execution has 636 passes, two strict 4,000 ms RRTA PDF
privacy subprocess failures and five original skips. Native AMD64 browser
execution has 608 passes, 30 failures and five skips. Its first failures comprise
28 cumulative 30-second case deadlines and two strict PDF subprocess deadlines.
These failures remain open; no retry, worker change or relaxed deadline converts
them to success. Trace diagnosis continues. The Docker workflow passes.

The native AMD64 run separately completes image import, SBOM generation, scan
and Compose phases. Successful substeps do not make its failed browser job pass.

## Security and qualification boundary

A fresh November 15 official Grype database scan of the same ARM image retains
192 findings: 56 High, 61 Medium, 17 Low, 47 Negligible and 11 Unknown; zero
Critical. The effective configuration has no ignore rules, includes upstream
kernel headers and retains matcher suppressions in the raw JSON. Findings remain
unaccepted. A successful scan is not security approval.

Qualified independent human tax/spec/form reviews and AI expected labels remain
unassigned. Final 2026 annual federal, PA and Ohio form qualification remains
blocked. Model promotion, filing and release readiness stay disabled.

## Retained evidence identities

Private evidence remains local; these hashes allow the durable checklist to bind
its actual receipts without publishing test credentials or raw runtime logs.

| Evidence | SHA256 |
| --- | --- |
| Root local artifact review | `6e4fa871a67cc28765a2a53ba9d57fb8d66ddfd7fe9cebb3407f8f0235041658` |
| Independent local browser review | `a942e549058435ae583132b4b2bf81786332dea2a0fa8a55ac5266369e149a72` |
| Independent ARM artifact review | `e7166ae423f73bb472beb5beac5dc6c6a63e5044709efc25660f2b3370d63cbf` |
| Root ARM artifact review | `5039b8b7fbabe6fab09843aac871692345d6d605badf20af43f0f1bbb5a57812` |
| Preview parent receipt | `63e76d21c2388ac17ee74332cea23d9be99843d9b44f3156a54bb428e9936b47` |
| Root Preview artifact review | `4279cbf73bedafdcc78ce52e8733f5d3958ff63789aa626cd5a4bfba866cb318` |
| Current raw ARM scan | `4638fb29de0ce2b391c8a173838be7e5824cae8e003b9227cfaf1d4d038e2cef` |
| Separate normal VM restoration | `1612b32a4502cb043a904494a31ea185ae4f398556abab6aeeea6c15f02938e1` |
