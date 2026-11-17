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
is pending. [Reader and bounds](../infra/sqlite-runtime-consumers/README.md),
[spec](../spec/ops/sqlite-runtime-consumers.yaml).
