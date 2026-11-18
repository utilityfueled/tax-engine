# Minimal raw-base PostgreSQL database compatibility experiment

This opt-in Linux/AMD64 stage tests a freshly rebuilt raw-base package-removal
candidate. It does not qualify the composite image, full application or release.
The earlier inventory/scan run is recorded in
[the raw-base ledger](upgrade-2026-postgres-minimal-runtime-20261118.md).

The controller repeats that paired inventory/scan stage and binds its actual image
identities before starting either database. Both images must process sourced and
executable shell scripts, plain SQL, gzip, xz and zstd fixtures. Exact SQL NUMERIC,
XML and bytea assertions, SCRAM authentication, rejected missing/wrong passwords,
nonroot PostgreSQL PID 1 and persistence after restart are required. The original
`Controller.databaseChecks` runs verbatim for precision, dump/restore and rollback.

Generated passwords, environment inspections, raw SQL/dumps and command logs stay
in a separate private execution directory through cleanup. Published DB results
contain fixed booleans, counts and hashes. The controller snapshots preexisting
volumes, rejects name collisions, and removes only verified fresh unused volumes
after normal container closure. Uncertain child closure stops daemon operations.

The workflow allows 75 minutes, with a 65-minute controller and ten minutes
reserved for cleanup. Database admission requires more than 20 minutes remaining
outside that reserve. Original resource ownership and source checks remain.

The producer and an independent source/privacy/lifecycle review passed before
adoption. Root retained the initial 13 lint failures, then added explicit Node
imports and removed unnecessary literal escapes. The fixture policy hash changed
accordingly. Final local checks passed: 16 Node tests, strict scoped lint,
actionlint, typecheck, 9,524 spec lines with no broken references and inventory
consistency. All previous 1,075 inventory rows remain identical; the new row is
operations traceability only. Independent adoption review also verified that all seven generated fixture files
remain byte-identical after the imports and literal cleanup. Native execution is
still pending.

Private evidence: `nov18-postgres-minimal-db-private`,
`nov18-postgres-minimal-db-privacy-review`, and
`nov18-postgres-minimal-db-root-checks`. No passwords or raw database diagnostics
are published. Full service, custom-hook, lower-layer, remaining CVE, composite
libxml/gosu, final recovery and release gates remain required.
