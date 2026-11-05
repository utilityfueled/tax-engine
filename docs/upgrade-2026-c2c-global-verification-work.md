# Frozen c2c global verification

On November 5, source `c2c7af69fb44999644ab520cd37dbed75b7c5386` passes the actual local four-check run. All 5,301 source pins stayed unchanged before and after every check. Node 26.13.0, the private Python/pypdf environment and a local synthetic PostgreSQL database were configured; browser execution received no database credential. No paid provider calls ran.

| Check | Actual result |
| --- | --- |
| `pnpm eval:models:check` | PASS |
| `pnpm test --maxWorkers=2` | 26,466 tests in 1,913 files PASS |
| `pnpm test:coverage --maxWorkers=2` | Same 26,466 tests PASS; statements 91.83%, branches 87.64%, functions 90.85%, lines 95.10% |
| `pnpm test:web` | 580 cases, zero failures, five unchanged original hosted skips; all eight windows and cleanup PASS |

The existing coverage thresholds, request limits, managed 90-second case policy, two workers, zero retries, source guards and privacy controls stayed unchanged. The frozen 495-member local evidence manifest is `0c827c0848be984d9851c38a1a8148d4660486314af91013db48001af3d94ddb`; directory `.local/upgrade-evidence/nov05-adoption-current-global-integration` retains commands, outputs, source pins and 480 actual browser JSON/text artifacts. Documentation changes follow the frozen run.

## Separate remote failures

[GitHub Web run 42080868458](https://github.com/utilityfueled/tax-engine/actions/runs/42080868458) failed on the same source. Managed browser job 127433872799 stopped before executing any case with `Natural window did not expire`. Its saved artifact does not contain clock readings, so the cause remains unproven. Container job 127433873620 retains two real 30-second timeouts in `complete-local-lifecycle.spec.ts` and a later body-timeout contract discrepancy. Build, smoke, synthetic recovery and image-evidence steps passing do not make that browser job pass.

The exact public CI artifact ZIPs are retained privately: browser-failures 407,660 bytes/SHA256 `61384b991baa73d5d34cfbe1c9494618b20965f387536c875f42345c371d1b1c`; container-runtime-evidence 66,989,469 bytes/SHA256 `8b7fdfb7e64588b615d03f49cedd2f52ad2590ffa216831b1cf0af14f304a1c9`. Review and fixes remain open; local managed success does not replace actual remote/container evidence.

## Remaining gates

Skipped hosted tests, staged outage and automatic webhook retry, actual current native/container distributions, independently reviewed AI evaluation, human tax/security review, final 2026 forms and filing/model promotion remain unqualified. This ledger records a local global verification boundary and does not claim completion of the execution brief.
