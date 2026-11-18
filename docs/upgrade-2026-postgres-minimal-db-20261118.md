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
pending at source adoption; the actual result follows.

Private evidence: `nov18-postgres-minimal-db-private`,
`nov18-postgres-minimal-db-privacy-review`, and
`nov18-postgres-minimal-db-root-checks`. No passwords or raw database diagnostics
are published. Full service, custom-hook, lower-layer, remaining CVE, composite
libxml/gosu, final recovery and release gates remain required.

## Actual isolated database result

Run `44243730083`, source `f9a3d1f7ef71c38d2fd9ffacb83cf7a1dc5709b8`,
completed successfully at 2026-11-18 05:25:01 UTC. Its fresh candidate is
`sha256:5288bcc9659da95501223c0740e4e93bcc8409b99bb0bf719fe4d350dc611570`.
Both seven-file/six-row initialization matrices and the unchanged precision,
XML/bytea, restart, dump/restore and baseline rollback assertions passed.
All 175 commands exited zero; the fixed result records verified cleanup,
zero cleanup errors, no uncertain child and no deadline overrun.

Independent actual review streamed and hashed all 21 artifact members
(916,500,652 uncompressed bytes), compared every regular ELF hash/owner and
package/status record, and checked source, recipe, image and scanner bindings.
Packages fall 155→150; regular ELFs 1,042→1,038; SQLite provider/direct consumer
counts fall 1→0. Scans retain eight active Critical findings and one suppressed
Critical finding. Original fourteen OCI layers remain plus two new layers.

Artifact membership and fixed schemas contain no raw command logs, environment
inspections, dump or private database diagnostics. Actual generated secrets are
intentionally unavailable to the reviewer; exact secret-value comparison and
independent live post-cleanup inspection are not claimed. Cleanup evidence is
source-bound recorded execution, with the retained adversarial publication tests.
Linux and host gzip fixture headers differ only by their OS byte; identical
decompressed bytes and all actual Linux fixture bindings were independently checked.

Actual review manifest SHA256:
`cd78165ba9894fbfaf2cdd93801b3c784334ec111920b97bb363de654cc3b75c`.
Assessment SHA256:
`838ffabcc4393a7984246d3ccd4baa28f2359fcab9252a260dffc3499c85cd13`.
Root verified all 34 input pins and the held assessment. This passes only the
isolated raw-base synthetic database stage. Composite image, remaining CVEs,
full application, final recovery and release qualification remain open.
