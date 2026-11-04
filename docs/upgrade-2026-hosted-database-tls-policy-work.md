# Selected hosted database TLS policy: source-first work

Status: selected-verification repair adopted on the upgrade branch after independent source review. All 12 private check sets and the scoped main integration checks pass. This package alone does not impose the separate all-remote default.

The source-first planning entries below are preserved historical statements; the dated results section supersedes their pre-runtime status.

Exact baseline5a03fa4e5a21c1a9d783f94bff204cc032542b78, 4,990 tracked regular files and six literal links independently verified against git blobs. The sole existing product is unchanged. New YAML was written and hashed before the new test. Existing tests/configuration fixtures are untouched.

Source-confirmed gap: pg8.23.1 reparses connectionString after explicit Pool SSL; pg-connection-string2.14.1 URL semantics can defeat selected transport/certificate/hostname validation. Official node-postgres SSL documentation describes the precedence; PostgreSQL16 SSL instructions distinguish encryption and authenticated server identity. The change will preserve previously selected verification, not claim every hosted URL has a verified-TLS policy or that a deployed database is insecure.

26 frozen controls: 10 preserved baselines first, then16 targeted downgrade cases (eight effective source cases, production and isolated Preview). Real installed pg Client is constructed without connect for preserved effective TLS, including custom synthetic CA/client certificate contents; source-selected downgrades must block config and actual runtime before cache allocation or the forbidden synthetic certificate file read. Separate spies forbid Pool and Client connect. Existing deadlines/cache/isolation/self-host and test/development local behavior remain asserted. No private credentials or database/network invocation is permitted.

The future all-remote hosted production/Preview policy remains internal follow-up, requiring explicit scope/source-first contracts and any truthful old fixture setup migration. It is not an external blocker and is not solved by this first repair.

No Node, tests, database, browser, containers or PDF operations have run for this package. Actual RED and scoped checks require the root runtime grant. No product changes until actual existing-API RED. No risk acceptance or deployment qualification.

## 2026-11-04 private implementation and results

The corrected source-first baseline10 passed, followed by16 genuine configuration-admission failures. The first baseline attempt instead exposed a test-only URL reserialization expectation; its log and exact successor patch are retained separately. No downgrade behavior was claimed from that diagnostic. The approved repair changes only hosted-server-db.ts: effective selected TLS cannot be downgraded by later URL options, and the blocked runtime rejects before allocating or reusing a pool. Custom CA/client certificates and effective-last URL semantics remain intact.

All26 unchanged controls now pass. The eight adjacent files pass192 tests; three type checks, spec validation, AST references, strict owned lint, generated inventory/check and both engine/web builds pass. Product/source hashes and every log are frozen in the ignored nov04-hosted-database-tls-sourcefirst evidence package. Only inventory-2025.json changed as an explicitly generated artifact; it is separate from these four owned paths. No existing test or assertion was edited.

This is constructor/configuration and build evidence, with Pool/Client connections explicitly forbidden. No database connection, provider access, TLS handshake, deployment or professional qualification was performed. The separate all-remote verified-TLS default and real synthetic trusted-CA loopback handshake remain authorized internal successors.

## Main integration after hosting outage repair

The exact four reviewed paths were adopted after hosting commit5b5cc475; the
inventory was regenerated from current main. All26 TLS controls and78 auth/cache
controls pass. The nine-file adjacent invocation gives201pass/7skip: its eight
ordinary files pass, while the seven PostgreSQL outage cases correctly skip
without their explicit disposable-database environment. They are not counted as
executed and remain part of final PostgreSQL-backed verification. Web types,
specs, AST references, strict lint with zero warnings, inventory generation/check
and both builds pass. Evidence is in `nov04-root-selected-tls-main`,
`nov04-root-selected-tls-adjacent` and `nov04-root-selected-tls-builds` under the
ignored local evidence directory. No existing assertion or fixture was changed.
The separate all-remote successor retains its own spec, RED and actual trusted-CA
handshake evidence rather than attributing it to this constructor-only package.
