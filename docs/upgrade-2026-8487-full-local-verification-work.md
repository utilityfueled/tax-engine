# Exact 8487 full local verification

Status: **PASS_FULL_LOCAL_CHECKS_ONLY**, November 4, 2026.

Source `8487fb4b6d8818d83739fb902fc0730e19698053`, tree
`ce8f9746fb424f6efe52238076bca6a510e272c8`, is the test-only bounded
PDF-stdin correction over a4ac. Application-product bytes remain unchanged.
Documentation-only HEAD 4190b5d3 is not substituted for this tested source.

Unit and coverage each pass 25,238 tests in 1,853 files, with zero failures
and zero skips. Coverage reaches 91.81% statements, 87.54% branches, 90.69%
functions and 95.03% lines against unchanged 90/85/90/90 gates. Both runs retain
two workers, ordinary 5s and coverage 15s case deadlines. All eight remaining
checks pass: root/contracts/web types, spec validation, inventory check, engine
build, web build and lint. Lint has 11,715 warnings and zero errors; semantic
additions and removals against the retained b254 baseline are both empty. This
is not a zero-warning result.

All conditional database files execute against a new owned PostgreSQL 16
loopback cluster in **each** run:

| File under tests/apps/web | Passed tests per run |
| --- | ---: |
| hosted-ai-ledger.test.ts | 19 |
| hosted-database-outages.test.ts | 7 |
| hosted-metadata-migration.test.ts | 10 |
| hosted-postgres-workspace.test.ts | 4 |
| hosted-recovery-postgres.test.ts | 5 |
| hosted-subscription-transaction.test.ts | 8 |

That is 53 actual database tests per run, not skipped placeholders. The
5,042 regular source files and six literal Git links match before and after;
15 pinned public sample downloads remain separate inputs. PostgreSQL stop,
port-free and owned-temp removal checks all pass. The one PDF-operation
marker 100 was an estimate, not an observed artifact count.

Retained evidence is under
`.local/upgrade-evidence/nov04-8487-private-full-verification-source/`:
`actual/receipt.json`, `terminal-result.json`,
`terminal-artifact-manifest.json`, unit/coverage JSON and check logs. The
verified primary receipt SHA256 is
`08e1d9bc7a524461d7c4cf5e2a57566fe88cbb30e25d702e91881202cf8399a4`.
Earlier a4ac address-precondition and native-child EOF-wait failures remain
retained; no coverage or remaining checks were claimed after the hung run.
The [reader lifecycle ledger](upgrade-2026-pa-business-pdf-reader-lifecycle-work.md)
records the separate one-import repair.

Native and deployed evidence remain separate. Fresh-store official-base
bootstrap passes, followed by an 8487 pinned-base inspection failure before
application build; finalSafetyPASS does not make that build successful. The
latest failed receipt is retained under
`.local/upgrade-evidence/nov04-native-isolated-storage-source-first/future-final-qualified-phases-v4/actual-build-export-ee634fafc7f7/receipt.json`.
Diagnosis is pending; retained stores are not repaired and base absence is not
inferred. Corrected Preview tenant V2 has 14 author fake-transport and eight
independent offline methods passing, with zero live tenant requests.

These results do not qualify a final native image, hosted tenant integration,
remote/browser artifacts, provider evaluation, advisory acceptance, independent
professional review, final 2026 forms or filing. The [current status](upgrade-2026-current-status.md)
retains those completion gates.
