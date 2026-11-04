# Isolated Preview database rehearsal

November 4, 2026: historical source `9d38882585e05b3fe42ca1657edfb746ec1a7075`
was rehearsed against the explicitly authorized Preview database using one unique
synthetic schema. No real application rows were read or written. Exact source,
resource, role/database identity, tools, namespace ownership and default/direct
ACL checks remained mandatory. Node and native clients verified CA/hostname TLS.
PostgreSQL reports backend SSL=false; the provider internal hop is unverified.
This result qualifies only the bounded mechanism, not hosted security or release.

The successful V5.3 operation receipt SHA256 is
`95716771e61450c4c18323ff74c3cd1a312019e6e2c86705be574e667d2a80a4`.
It records all of the following against 4,969 regular source files and six literal
links before and after execution:

- Nine application tables with twelve new synthetic records, two owners and a shared workspace ID.
- Nonmutating migration dry run; actual transaction rollback after a malformed later row; migration apply and idempotence.
- Exact provider cost `0.0000006` and paid/credited budget `100` cents.
- SHA-pinned custom backup with every TOC entry restricted to the owned schema, tables, indexes and constraints.
- Actual transactional native restore, exact normalized catalog and all nine original table snapshots, then exact migration reapply and idempotence.
- Outside-schema catalog identities unchanged; RESTRICT cleanup; explicit raw-pool closure; final schema/relations absent and zero rehearsal sessions. Generated credential files and owned temporary files were removed.

Earlier failed attempts remain retained. V5.1's restore schema filter omitted
the schema creation entry; offline projections and [PostgreSQL restore documentation](https://www.postgresql.org/docs/18/app-pgrestore.html)
support removing that filter only for the complete already-allowlisted archive.
Read-only reconciliation confirmed absence and zero sessions before retry. V5.2
restored successfully but failed its zero-session guard: raw pool use had never
initialized Kysely, so its destroy method did not close the pool. Installed source
review and a second read-only reconciliation preceded V5.3's explicit guarded
pool close. Distinct V5.2/V5.3 source reviews approve the narrow corrections;
neither failure is relabeled successful. The V5.1 validated synthetic backup is
retained privately with its hash; credentials, hostnames and row contents are not
published.

## Current-source successor

Exact application `a4ac9f0ea004bfaed3f9713af62a3bf1b56f0d45` now also passes
the same bounded synthetic mechanism on the approved Preview database. The fresh
archive contains 5,041 regular files and six exact literal links. A distinct
source review verifies 45,520 provenance assertions and the minimal inverse to
V5.3 before execution; the current tracked pool-closure helper replaces its
identical historical inline closure. Offline frozen installation is recorded
separately from the dependency-free source preparation.

The actual November4 17:26–17:27 UTC operation passes dry-run, malformed-row
transaction rollback, apply, native PostgreSQL18.6 custom backup, complete
single-transaction restore, exact normalized catalog and nine-table/twelve-row
baseline parity, reapply and idempotence. Exact cost `0.0000006` and budget100
cents remain unchanged. The 25,431-byte backup has36 allowlisted TOC entries.
Outside-schema catalog identities are unchanged; no real application rows are
read or written. RESTRICT cleanup confirms schema/relations absent, current raw
pool ended and zero own sessions; generated credential and owned temporary
files are removed. All tracked source bytes remain exact after execution.

Operation receipt SHA256:
`aabde7cd1090e2e148152a9e312080ebfafb19d969bdfb315c29d05c6b959831`.
Independent source-review SHA256:
`27e29ce5059bd17260558b55d039427b1d7bcc88029951842936df1e93b67302`.
Distinct saved-runtime review SHA256:
`64a75e5de7c2c18305fc9d57a1c9ec2fa5e10f67d7a90a1eaea555c7df8e74e9`.
That review passes10,361 checks of the closed receipts and unchanged executed
source. Successful cleanup removed transient snapshots and the synthetic dump;
the reviewer traces their assertions and saved hashes rather than claiming a
second database query or independent inspection of removed bytes.
Saved receipts are in ignored
`nov04-preview-schema-current-a4ac-sourcefirst/actual-root-current-a4ac-v1`.
Node negotiates verified TLS1.3 and native libpq uses verify-full/system roots
with minimumTLS1.2. Backend SSL remains false; internal-hop encryption is still
unqualified.

Final deployed-artifact integration, real outages, provider internal transport
evidence, historical DDL/PITR coverage and independent human security/privacy
review remain required. No production deployment, model request, filing
activation or risk acceptance occurred.
