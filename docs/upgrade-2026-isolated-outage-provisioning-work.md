# Isolated hosted outage rehearsal: provisioning and remaining gates

November 4, 2026. Initial provisioning binds source
`8487fb4b6d8818d83739fb902fc0730e19698053`; the later functional successor
`045fbedbdfbe612cb3caa28956fa7228bb3df320` is not deployed here.
These observations do not qualify a deployed artifact. Production is untouched.

The owner approved a separate Preview-only project, empty Neon branch/database,
dedicated Redis resource, and separate Stripe Sandbox. The later Redis approval
permits at most $1 actual spending, a $20 automatic cutoff and a brief
disconnected setup window. The specific existing-integration Install workflow
was subsequently approved.

| Component | Actual result | Next gate |
| --- | --- | --- |
| Vercel | Separate `tax-engine-outage-8487` project created; Preview-only deployment/billing/rate-prefix settings and four auth/Stripe bindings saved. CLI sign-in expressly approved. No deployment yet. | App database/role, webhook/origin configuration, exact-source build and runtime checks. |
| Neon | Separate free project and schema-only `qa-outage-8487` branch created; integration connected to Preview only. Read-only direct connection proves empty application catalogs, absent target role/database, TLS1.3 with certificate/hostname verification, and SCRAM-SHA-256-PLUS with validated server proof. | Strict bootstrap refuses provider-maintenance PUBLIC CONNECT. No app role/database is durably created; a later temporary role transaction and rollback diagnostic are recorded below. Migrations remain unexecuted. |
| Stripe | New isolated sandbox identity verified. Two synthetic Starter/Plus products and monthly test prices created; four catalog POSTs in twelve total requests. Key remains private and Preview-only. | No customer, trial, webhook or charge endpoints invoked by this bootstrap. Automatic failed delivery/retry and exact reconciliation remain untested. |
| Redis | The original unused cache was deleted. A separately approved replacement now exists in iad1 with auto-upgrade/eviction off. Its provider UI verifies Budget: $20; the pre-budget display showed zero commands and $0.00. | The owner approved the separate credential grant; the cache is now connected only to the isolated project’s Preview with Sensitive enabled and Production/Development excluded. Retain the $1 actual-spend limit and 240-request ceiling before rehearsal; no outage qualification follows from provisioning. |

## Retained database failures and current permission boundary

The initial bootstrap stopped before a database result. V2 failed verified admin
connection: a separate credential-free TLS handshake reproduced
`UNABLE_TO_GET_ISSUER_CERT_LOCALLY` with five system roots. V3 explicitly combines
Node's bundled public roots and system roots, preserving certificate/hostname
verification and required channel binding; the pooled connection then failed
with SQLSTATE `08P01`. Its exact provider message was not retained.

V4 uses the same branch's documented direct endpoint for administrative work,
keeping the pooled application endpoint separate. Its read-only identity passes.
The [Node trust documentation](https://nodejs.org/learn/http/enterprise-network-configuration)
and [Neon connection guidance](https://neon.com/docs/connect/connection-errors)
support these transport choices; successful direct administration does not qualify
the future pooled application connection or provider internal hop.

The immutable bootstrap requires the new app role to connect only to its own
non-template database. Actual catalog results show `postgres` is owned by
`cloud_admin` and grants CONNECT to PUBLIC. A separate read-only privilege query
proves `neondb_owner` cannot grant/revoke that database's CONNECT privilege and is
not a `cloud_admin` member. Role-specific REVOKE cannot negate PUBLIC access.
The helper stops before password generation or DDL. Its exclusivity assertion
has not been relaxed. Resolving this requires a provider-supported permission
boundary or an explicitly reviewed alternative; ordinary database credentials
alone cannot satisfy this exact gate. Template and provider-hop boundaries also
remain unqualified.

## Durable receipts

Private raw evidence stays ignored with credentials omitted from public records.
SHA256 bindings:

- V2 failed identity: `23b0dfc72371cf8046b403ad87bc2aa801cdd36ae78f857ac8335500ca319636`.
- V3 failed identity: `1bc41bafa6da979da8d85477137d7f0d39ae53216db1d796342638e66e123f50`.
- V4 read-only identity: `ff95bb76f337d9e5a3bd4aa5212dba7a05c253a2b64543ca6ec9c0351a9e2b51`.
- Read-only maintenance privilege diagnostic: `01858f4f25e18e5f956859f5a1c223d4caacb10f195dddd45e412bb4edbb09fe`.
- Four Preview bindings receipt: `ed5330ffdf4a5440ff8ca459df32fc7eadbc87f6d9a44df399a10dbfca5a4180`.
- New Stripe identity: `04d5f81ef337c908fc58159891994dc67e6bc055b6c8bbe7ecabd40b6a6be099`.
- New Stripe catalog: `dd2470cb4efa098cbac3301e4b2e1f9c42dc2720e3509b8a235b3e41a3cb386b`.

V2 distinct source/fake review passes31 controls. V3/V4 each pass21 inherited
bootstrap controls; their actual results above remain separately attributed.
Native controller/archive preparation continues independently. No hosted outage,
automatic Stripe retry, security review, AI qualification or release completion
is claimed.

## Later complete read-only catalog inspection

A separately reviewed metadata-only successor inventories all three reachable
databases: neondb, postgres and template1, followed by a fresh neondb identity
witness. It completes 100 ordinary queries and four cleanup rollbacks within
the declared bounds: 21,850 rows, 3,955,910 row-JSON bytes and 15,543 ms. Each
database has a repeatable-read, read-only transaction; these are not one atomic
cross-database snapshot. Verified TLS1.3, hostname validation and mandatory
SCRAM-SHA-256-PLUS remain enforced. No relation contents, passwords, function
bodies or connection strings are selected. All sessions close according to the
reviewed receipt path; no independent backend-session observation is claimed.

Independent actual-evidence review verifies all 25 catalog sections per database,
row field allowlists, source/authority bindings and bounds. It identifies no
ordinary user/tax relation in the baseline. It does identify provider-owned
relations/routines in postgres and PUBLIC SELECT on two statistics views.
The current administrator inherits statistics-reader privileges; its visibility
cannot represent a new app role. PostgreSQL documents statistics visibility and
restrictions on other users' SQL text; normalization is not a redaction boundary.
[PostgreSQL18 pg_stat_statements](https://www.postgresql.org/docs/18/pgstatstatements.html)
and [Neon role guidance](https://neon.com/docs/manage/roles) support the separate
SQL-created restricted-role approach.

This inspection leaves literal CONNECT exclusivity, app-role privileges,
privacy, template0 inventory and provider internal-hop encryption unqualified.
The original bootstrap failure is unchanged. No new app role/database exists
at this stage. A separate source-only package prepares an initially NOLOGIN
role, a new synthetic database and metadata-only effective-privilege checks
before any password, LOGIN or deployment. Existing provider databases, roles
and ACLs will not be changed by that proposed package.

Retained receipt SHA256:

- Actual catalog: `168899eaffbef4cec03c4bde62f2e4c9b8c6e93c3d61b9f4897d238d3530f793`.
- Independent actual review: `419f924070ef55d8931a16049bde2cdc8e2146c3ea07bb92fd2ac179e62c5805`.
- Independent bootstrap conditions: `9969d4ce33357e7d6da57313cf9abee79825c5d3cc9790a8ed2d519730be3a8d`.

The catalog launcher V1's independent offline review found a safe failure could
return zero. Its failure evidence remains preserved. V2 requires a verified,
exact inventory-only PASS before exit0; 46 author/independent offline controls
pass before the actual operation. This correction enables no privacy or release
claim.

## NOLOGIN setup: reviewed guards and retained actual failure

Independent review of the first setup helper found two concrete defects:
preflight counters were omitted from its aggregate receipt, and an observed
asynchronous session error could precede another durable mutation. Both original
negative controls remain failed and frozen. The separately reviewed V2 fixes
both; 26 author Node, 14 author Python and five distinct independent controls
pass. Phase limits remain unchanged and their aggregate is explicit, rather
than describing the later phase as the entire operation.

ROOT reviewed and bound that exact successor, then executed it once. Fresh
read-only catalog comparison passes. The role transaction stops during its
create/metadata stage, before a role COMMIT attempt; its cleanup ROLLBACK returns.
There is no confirmed committed mutation, database-create attempt, password,
LOGIN or new deployment. The receipt remains
`FAIL_PARTIAL_OR_UNKNOWN_NO_RETRY_ROLE_MUST_REMAIN_NOLOGIN`; rollback alone does
not replace independent state reconciliation. The retained failure has no SQL
state or detailed assertion difference, so its provider cause remains unknown.
A separate bounded diagnostic is being prepared; this helper is not retried.

The actual operation reports 107 ordinary queries, five cleanup rollbacks,
21,891 rows and 3,962,324 row-JSON bytes in 16,424 ms. Those totals include the
100-query preflight. All privacy, app-role readiness, literal CONNECT,
template0 and provider-hop qualification flags remain false.

Retained SHA256 bindings:

- V2 source manifest: `b747c09d89c52080874f48e1d55f6292ac250fac2f41e66df2d4f49533dab270`.
- Independent source-review receipt: `73d88eafcd688f6e7b24b8fb2b1bc57b1babecd2d246cfea535cb4bc35b710be`.
- Actual failed setup receipt: `e7e75d564f34e7652e59ce616b3597af5a9ad54d4971b51666c73c4a3027b250`.

The earlier catalog review's prose count of 26 was incorrect; its complete key
set and 100-query accounting were correct. A preserved independent correction
identifies 25 categories without changing the inventory or its qualification.
The Redis cutoff screenshot and raw setup evidence remain private and ignored;
no credential values are included in this ledger.

## Rollback-only role metadata diagnostic

The separately reviewed diagnostic completes once with
`PASS_ROLE_METADATA_CAPTURE_ROLLBACK_RECONCILED_ONLY`. It captures safe role
attributes and membership metadata before evaluating the prior strict policy,
which reports `MISMATCH_REQUIRES_INDEPENDENT_REVIEW`. No policy is relaxed.
Both local transactions roll back and close; fresh full catalog reconciliations
before and after match the original three-database baseline and prove target
role/database absence on that source path. No committed mutation, password,
LOGIN, database creation or deployment occurs. Physical OID/WAL advancement is
not represented as byte-identical restoration.

The closed launcher verifies receipt binding and reports exit0 without stderr.
Actual accounting is217ordinary queries,10cleanup rollbacks,43,815rows and
7,929,858row-JSON bytes in32,017ms, within the declared aggregate bounds.
All privacy, app-privilege, CONNECT, provider-hop and bootstrap-assumption
qualification flags remain false. Independent actual-metadata review is next;
this result authorizes no setup retry or model/release promotion.

- Diagnostic source manifest: `0504ca317295a0fbcc134f679a8ff6f2721ab0e88889c0dcad9f0f3a1fbea224`.
- Independent source-review receipt: `b99494bc2054edc3b8d685c48546aea35649e762bafe221a9a9ef0d939ff1f2a`.
- Actual diagnostic receipt: `47c8120ce5021889db546cf56bb49d67fa1ee5647d9897584b5c42fa869235b9`.
