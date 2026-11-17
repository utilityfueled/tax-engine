# SQLite immutable consumer discovery — November 17, 2026

The default-off AMD64 workflow inspects the existing pinned PostgreSQL base
without starting its owned container. It records regular ELF direct dependencies,
SQLite SONAME providers, package ownership and archive/payload hashes. Indirect,
script, `dlopen` and unresolved alias uses remain outside this discovery scope.
An empty direct-consumer list does not establish absence of SQLite uses.

The original source controller retains native-hosted, exact-source, first-attempt,
capacity, supervised-command and normal owned-cleanup gates. Job/controller/cleanup
limits are 15/12/3 minutes. No production, candidate installation, advisory
acceptance or runtime compatibility qualification is authorized by this probe.

Spec-first controls initially failed. Independent review then reproduced two
additional defects: a nested reader buffered output before enforcing its cap,
and the tar reader consumed oversized PAX metadata before logical checks.
Separate failing regressions preceded each correction. The final parser starts
no nested process; a physical-header scan bounds metadata before logical parsing.
Six offline controls, syntax, lint, workflow grammar, spec references, generated
inventory and the browser evidence audit pass. Existing deadlines and assertions
are unchanged. The saved actual baseline ELF independently matches SONAME
`libsqlite3.so.0` and direct dependencies `libm.so.6`, `libc.so.6`.

Final source manifest SHA-256:
`b7729dd008c1573add9547992371e833fb164c85614e79b541847a3e703d2c6f`.
Independent review SHA-256:
`a5fcc795ee707daa93d4a5bb471068370acc5b2e1fc15e38640f007e14689541`.
All 43 source/evidence pins match; the review independently rejected a 65 MiB PAX
case before any logical archive reader or ELF reader call. Actual native discovery
was pending at preparation. [Reader and bounds](../infra/sqlite-runtime-consumers/README.md),
[spec](../spec/ops/sqlite-runtime-consumers.yaml).

[Actual run 44196293753](https://github.com/utilityfueled/tax-engine/actions/runs/44196293753)
at `bb3fd00e5b70f705655dec517c9613fbe75c6c30` passed. All 22 controller checks
exited zero, normal cleanup had no errors, and the deadline was not exceeded.
The never-started container's security/state checks pass before and after export.
The reader recorded 10,930 members and 1,042 regular ELF payloads, with one
SQLite provider matching the independently decoded baseline and exactly one
direct consumer, `usr/bin/gpg`. The 1,151 link entries were not followed.

Root and independent review verified the 87,559-byte artifact archive digest
`cd607793fcd2a7bf5cf90a5195ada7469a43675fdde474e98382bd8fef3ff08c`,
all 48 artifact file pins and exact-source bindings. Independent review:
`0ce1d67606facaabcdcccd5f1d5124dd3467e71ff5bd5c62fb1824df6d50a9b5`.
Neither raw rootfs nor ELF bytes were downloaded. Runtime tests must exercise
GPG's SQLite use; indirect uses and candidate compatibility remain unqualified.
