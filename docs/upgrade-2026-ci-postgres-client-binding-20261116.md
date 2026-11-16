# Match CI recovery clients to PostgreSQL 16 — November 16, 2026

The unit and coverage jobs now select `ubuntu-24.04` and the explicit
`/usr/lib/postgresql/16/bin` client directory. Before tests, both jobs require
`pg_dump`, `pg_restore` and the actual disposable loopback server to report
major version 16. Missing tools, malformed output, a different database URL,
query failure or a mismatched major stops the job. Actual versions are logged.

The preceding `c0760d2b` coverage job failed one recovery case, with 28,936
other tests passing. Its PostgreSQL 16.16 server explicitly rejected
`SET transaction_timeout=0` during restore. The updated `ubuntu-latest` runner
was Ubuntu 26.04; its official software inventory lists PostgreSQL 18.6.
The workflow previously allowed recovery tools to fall through to `PATH`.
The exact invoked client version was not logged, so that historical detail
remains unknown. The observed restore-command incompatibility is retained.

PostgreSQL introduced `transaction_timeout` in version 17. Its dump documentation
does not guarantee restoration into an older server major. The selected Ubuntu
24.04 inventory lists version 16.15; the new checks verify the real clients and
server on every execution rather than relying on that inventory alone.

Validation before commit: the actual workflow parses as YAML; structural
comparison preserves all other jobs, service images, commands, worker counts,
deadlines, assertions and coverage thresholds. Eleven positive/negative cases
exercise the extracted version-check shell, independently repeated by root.
The initial shell-control failure is retained; explicit failure exits resolve
it. No application, tax rule, dependency lockfile or recovery assertion changes.
The corrected remote jobs are pending execution.

Separately, exact `c0760d2b` passes all twelve local checks, with two completed
saved-artifact reviews: 28,937 unit tests and 28,937 coverage tests across 2,125
files, 92.04% statements, 88.20% branches, and 650 browser passes with five
original skips. Original failed sandbox lane starts and the first stale
artifact-reader comparison remain recorded. Those local results do not replace
remote CI or establish hosted, security, filing or model qualification.

Evidence references: remote CI run `43896502483`; root shell controls
`57377d/0`; local completed review hashes
`b831ee7950114a4941e73d21253ca65483719b59e223e0bfcfb72e48af974585`
and `43c4cf52f64c3eecae88909548d4bb8dcff6f960d71f1458aa7b5778e9f5372e`.

Sources: [PostgreSQL dump compatibility](https://www.postgresql.org/docs/16/app-pgdump.html),
[PostgreSQL 17 release notes](https://www.postgresql.org/docs/17/release-17.html),
[observed Ubuntu 26.04 runner inventory](https://github.com/actions/runner-images/blob/ubuntu26/20261111.196/images/ubuntu/Ubuntu2604-Readme.md),
[selected Ubuntu 24.04 runner inventory](https://github.com/actions/runner-images/blob/ubuntu24/20261111.370/images/ubuntu/Ubuntu2404-Readme.md).
