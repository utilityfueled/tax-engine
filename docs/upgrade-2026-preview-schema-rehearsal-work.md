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

Current-source rehearsal, final deployed artifacts, real outages, provider
internal transport evidence, historical DDL/PITR coverage and independent human
security/privacy review remain required. No production deployment, model request,
filing activation or risk acceptance occurred.
