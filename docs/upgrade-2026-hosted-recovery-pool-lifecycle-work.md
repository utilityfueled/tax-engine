# Hosted recovery pool lifecycle

The local-only synthetic recovery script uses its pg Pool directly. Its previous
finally called only Kysely.destroy, whose lazy driver has no initialized Pool to
close in that path. The installed Kysely0.29.7/pg8.23.1/pg-pool3.14 source and actual
V5.2 failed receipt6f36554056c8000e5594b16cb9ec8b5837515b5d070f4f3dc601976e5bd9dfeb
support this finding. That rehearsal completed its synthetic migration/restore,
confirmed its namespace absent and outside catalog unchanged, but retained one
own session. Its failed status and validated synthetic backup remain historical.

This bounded successor is scoped to scripts/rehearse-hosted-recovery.ts. It adds
script-local explicit raw-pool shutdown after Kysely.destroy, avoids duplicate end,
and requires completed closure. A direct-entry guard makes importing cleanup safe
without launching the CLI. SQL, URL/loopback/ai_test gates, schema selection,
migration/snapshot/dump and private error handling must remain unchanged.

Six source-first controls run the installed Pool and Kysely implementations with
only the Pool Client option supplying a socket-free protocol endpoint. Failure
seams are explicit destroy/end rejection injections. No future missing export is
counted as a behavior RED. The existing real V5.2 failure is the causal baseline.
These tests do not establish actual PostgreSQL session-zero, Preview recovery,
internal-hop TLS, release readiness or owner acceptance. No remote or database
operation is authorized by this package. Runtime results will be appended after
focused and bounded adjacent/static checks; no runtime success is claimed yet.


## Executed bounded verification

The preceding source-first paragraph records the pre-execution state. On the
exact46b8ad6ab1a7aa66a93234d2b8ad279ea640f2d9 private snapshot, all six new lifecycle
controls passed and 24 existing recovery/auth-mail/diagnostic controls passed.
Default5000ms deadlines and one worker were unchanged. No cases were skipped.
Required root/web/contracts project type checks all passed. An additional
standalone owned-file tsc invocation failed with2807 dependency diagnostics
because it omitted existing repository aliases; neither owned file was named.
That failed command and log remain retained. A scratch configuration extending
the unchanged web tsconfig (same strict gates and aliases, owned entry files,
no incremental output) passed. No product/test changes were made for that check.

Spec8165/8165 refs, AST775 controls, both owned TypeScript files under lint with
zero warnings, generated inventory and inventory check all passed. No broad full
suite, build, PDF, browser or PostgreSQL/Preview rehearsal was run for this package.
The actual V5.2 failure remains unresolved by runtime observation here; these
socket-free lifecycle controls prove local shutdown behavior, not remote session
absence. Main source, dependency lock and library implementations were untouched.
The final patch, causal receipt hash, all test/control sources, successful logs
and the original type-command failure are retained under
.local/upgrade-evidence/nov04-hosted-recovery-pool-lifecycle.


## Main integration and actual disposable PostgreSQL16

On main source3d13cfe116f0ee491551c0546ed1bdeaa71a0d93, the independently reviewed
four-file successor was copied byteexact after confirming the original script
baseline and absence of the three new paths. Only its derived inventory was
regenerated. Independent source/socket-free review receipt318738a554a7503ece032c4c57277c7a41aa7560ad15e7d8c25b58ac780b8ab0
recorded four reviewer controls plus unchanged author six passing.

The first actual disposable PostgreSQL16.14 attempt initialized its owned cluster
and independently observed zero recovery schemas/other client sessions, then the
CLI stopped before main with ERR_MODULE_NOT_FOUND for the existing contracts
workspace import. Receipt51f75168efa322a0c25e256896a1fea1659cd3796d6405f1e5596016eabd60b9
remains failed; its server/port/tempdir cleanup passed. The source/SQL/assertions
were unchanged. ROOT approved the single runner argv addition selecting the
existing apps/web/tsconfig.json for its existing workspace aliases. There is no
recovery command in package.json requiring a separate script change. pnpm10.34.8
was invoked by its explicit pinned path through the pinned Node26.13.0 executable.

The corrected actual CLI completed in1.594seconds, exit0, with nine tables,
two tenant workspaces, exact cost restored, metadata cleanup reapplied and
idempotence asserted. Independent psql after subprocess exit observed zero
recovery schemas and zero other client sessions. The uniquely owned loopback
PG16 cluster on127.0.0.1:55448 was stopped, its listener closed and its temporary
directory removed. Ports5432/55437 and other clusters were untouched. Actual
receipt1c4853855ae78012f331a6cd6fc613b103a44abea0ec60ceffd1856ef080333e
is retained under .local/upgrade-evidence/nov04-hosted-recovery-pool-lifecycle-main.

All eight main check sets then passed: new six plus existing24 tests (30/4files,
zero skips), root/web/contracts types, spec8205/8205 refs, AST776 controls,
owned two-file lint with zero warnings and inventory check. Original defaults,
SQL/loopback/ai_test/private error gates and dump/restore timeouts were preserved.
Only this results ledger append followed these checks. No broad suite, build,
PDF/browser, external/Preview database or provider operation ran in this main
integration. Local postprocess absence does not replace the historical V5.2
Preview failure, prove production recovery/PITR or establish release readiness.
No commit was made by the implementing agent; final diff awaits ROOT review.


Reproduce the actual CLI from the repository root only against a separately
initialized disposable ai_test loopback cluster, supplying
TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL=postgresql://ai_test@127.0.0.1:55448/postgres
and TAX_ENGINE_TEST_POSTGRES_BIN=/opt/homebrew/opt/postgresql@16/bin:

```sh
pnpm exec tsx --tsconfig apps/web/tsconfig.json scripts/rehearse-hosted-recovery.ts
```

The reviewed run-disposable-postgres.py creates/stops/removes that owned cluster
and invokes this command through the pinned Node26.13.0/pnpm10.34.8 executables.
Use that harness for the complete reproducible operation; the cluster is absent
after success, so the inner command alone is not a database provisioning step.
