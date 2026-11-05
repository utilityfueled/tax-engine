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
| Vercel | Separate `tax-engine-outage-8487` project created; Preview-only deployment/billing/rate-prefix settings and four auth/Stripe bindings saved. CLI sign-in expressly approved. No deployment yet. | App credential, migrations, webhook/origin configuration, exact-source build and runtime checks. |
| Neon | Separate free project and schema-only `qa-outage-8487` branch created; integration connected to Preview only. Read-only direct connection proves empty application catalogs, absent target role/database, TLS1.3 with certificate/hostname verification, and SCRAM-SHA-256-PLUS with validated server proof. | The original literal-exclusive bootstrap remains failed. Later V3 commits only a restricted NOLOGIN role, administrator-owned synthetic DB and scoped ACLs after the separately reviewed rollback diagnostic. Credential admission, migrations and broader privacy qualification remain open. |
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

## Observed creator edge and committed NOLOGIN setup

Independent review identifies exactly one prior mismatch: the creator membership
records cloud_admin as grantor, rather than the assumed neondb_owner. The role
has no outgoing membership or elevated attributes; all original roles and edges
match. The successor requires that exact single reverse administrator-in-app
edge, including ADMIN=true/INHERIT=false/SET=false, and retains every other
privilege, old-catalog, transport, deadline and partial-failure guard. It saves
safe observations before assertions. No general provider default is inferred.

V3 source review passes40author Node,14author Python and3distinct independent
save-boundary controls. The one actual execution then completes
`PASS_NOLOGIN_BOOTSTRAP_METADATA_ONLY`, with closed launcher exit0 and verified
receipt binding. It commits only the new restricted NOLOGIN role, administrator-
owned synthetic database and that database's scoped schema/database ACLs. Four
complete metadata/effective-privilege maps are retained. No password, LOGIN,
application migration or deployment occurs.

Actual accounting is305ordinary queries/9cleanup rollbacks/82,126rows/
14,230,997row-JSON bytes/44,091ms. The100-query preflight and205-query later
phase are included, each within its original bounds. All broad privacy,
app-role qualification, literal CONNECT, template0 and provider-hop flags remain
false. Independent actual review verifies the restricted role, exact newDB
connect-only/public-schema CREATE+USAGE rights, secret-column denials and old
inventory/ACL equality. Exact poststate fingerprints are frozen. A separately
reviewed credential helper remains required before the synthetic functional
rehearsal proceeds.

- Independent actual diagnostic review: `a06e8b3cd816ad7f8e929f679ccffe483d0ece36a1b0c609cfa8d46ff45e8fca`.
- V3 source manifest: `b024ea7f5993ba34f44d50c81bb71de03004109f0d4f0a41ea9b4e175ae82bb9`.
- Independent V3 source-review receipt: `8038501fb01c6393df97030153a75bb755dccde7d7c23b2612dc70651e8a7765`.
- Actual V3 receipt: `ae4c6ecda16bdbc3dd49c72340abc2973f964aa05013a4a370bccd7f5194a54d`.

- Independent actual V3 review: `28e22439e23abbf172304a317e883f6fefa1a13970f1b48ffc08091fbc27ff12`.
- Exact poststate pins: `35c04765d56dee2de517dba69b1ba5447a7dc053883d7228139cf1157c94e6fe`.

## Credential COMMIT failure and read-only reconciliation

The separately reviewed credential helper generates one private synthetic app
credential after fresh restricted-state checks. Its client-derived SCRAM
verifier is bound to a transaction-local setting and used by a fixed internal
ALTER ROLE; plaintext is not sent in that attempt's SQL. Password and LOGIN
operations return, but COMMIT returns SQLSTATE `XX000` without confirmation.
The one actual attempt ends `FAIL_PARTIAL_OR_UNKNOWN_APP_LOGIN_NO_RETRY`.
All five sessions subsequently return ROLLBACK and close, but that cannot
establish the attempted COMMIT's outcome or external authentication state.
No app authentication, Preview installation, deployment or retry follows.
The private generated credential remains preserved without disclosure.

Actual failed-attempt accounting is198ordinary queries/five cleanup rollbacks,
66,120rows/11,172,044row-JSON bytes/27,771ms. The receipt distinguishes attempted
mutations from confirmed effects and retains `serverOutcomeUnknown=true`.
Its false password/LOGIN confirmation fields are not evidence of actual absence.

ROOT's subsequent primary-source recheck identifies a missed provider contract:
[Neon's role documentation](https://neon.com/docs/manage/roles), updated October3,
requires unhashed password input and excludes hashed inputs. ROOT and the
independent source reviewer missed this before execution. The prehashed path is
incompatible with that documented contract and must not be repeated. This
compatibility defect alone does not prove the cause of the observed SQLSTATE.
Public upstream role-forwarding source also documents possible transaction abort
after forwarding; its deployed version and the actual external outcome remain
unqualified. No forwarding bypass or privilege expansion is proposed.

A new, independently reviewed, strictly read-only helper then completes once.
It compares all four exact database/catalog/effective-privilege maps against V3,
permitting only an explicitly observed consistent app LOGIN boolean. All four
observations show **NOLOGIN**, with every original inventory/proof digest matching
the V3 restricted state. App OID40960, DB OID40962, the single creator reverse
membership and scoped ACLs remain unchanged. It reads no app credential file,
password field or business data and performs no authentication or mutation.

The read-only operation returns152ordinary queries/four cleanup rollbacks,
52,936rows/8,945,187row-JSON bytes/21,538ms; all four sessions roll back and close.
Distinct saved-evidence review recomputes all eight map digests, exact counters,
transport and authority/launcher bindings. The result establishes only current
logical metadata. Password state, the original COMMIT and provider/proxy
authentication state remain unknown. All broad privacy, app-readiness, CONNECT,
template0 and internal-hop qualification flags stay false.

Retained SHA256 bindings (private evidence remains ignored):

- Failed credential source manifest: `c742468789149b63bca8b218ce018800917c847032a5f356ffaa449a753127d9`.
- Actual failed credential receipt: `18610e56c5d8ef47b1ab2f5442a1d626adfa864bc1ccbbaf1782d81056303089`.
- Independent historical compatibility correction: `762a4f3330c1481214d7ff1d40608c6796d117c8fb7a8907f6bd7ae26d43daa6`.
- Read-only source manifest: `200369e474a935c0c54ceb43c11869505585810bcd2d5e067801ca93c7e65f52`.
- Independent read-only source review: `23397c14ab6d964739945b2e8212288bb3100ab4f7f8d76f158449e5f238dc6b`.
- Actual read-only receipt: `2b512e3a868d2ee49c69e6c7509b30101bdd8a792abd474b62917f725ffc0c06`.
- Independent saved-actual review: `a1f32a0641e91a890d0584228424fc65dc7153463c952803822065f233197cd0`.
- Observed metadata pins: `11057968b64ae6b702bb7a9cb168ab57942f580b0fc500de5bc9de8a0c19d00c`.

A provider-supported credential path still needs a separate source proposal,
private-input/logging admission, independent review and exact authority. Current
NOLOGIN metadata does not justify overwriting the retained credential, assuming
password rollback or repeating the old helper. The actual isolated outage,
automatic Stripe retry and deployed qualification criteria remain open.

## November 5 UTC: supported isolated app authentication

A new read-only observation checks effective column permissions and only the
exact role's catalog password-presence boolean. It reads no password/verifier.
The result is strictly false, with NOLOGIN and all four original maps unchanged;
permission failure would be unavailable, never absence. Actual accounting is154
ordinary queries/four rollbacks/52,938rows/8,945,319bytes/21,401ms. All four
connections close with verified frontend TLS1.3 and SCRAM-SHA-256-PLUS.

The supported successor uses a fresh random32-byte hex password, exclusive private
credential file, bound transaction-local setting and fixed scoped DO/ALTER ROLE,
one COMMIT, full metadata checks and actual app authentication. The old prehashed
helper/private artifact remain unchanged. The [official Neon SDK source](https://github.com/neondatabase/neon-pkgs/blob/31ed7870e186a09b90997c4bcb3f6a7117a43112/packages/sdk/src/project/role-access.ts)
supports plaintext provisioning. The provider receives plaintext and the server constructs
a password-bearing utility statement; logging, forwarding and internal-hop
encryption remain unqualified. Client SQL literals, argv, receipts and public
files contain no plaintext credential. An absolute provider-internal no-plaintext/
logging requirement was an added engineering interpretation, not a user/repo rule.

The first disabled successor compares the producer's app-specific membership
projection to all13 global rows, and its fake fixture repeats that wrong shape.
The actual receipt catches this before credential generation. Preserved V1 stays
HOLD. Immutable V2 uses the exact original per-database role-related projection,
retaining every edge/flag and whole-map check. ROOT41Node/15Python and distinct
47Node/15Python controls pass, including actual-receipt regressions.

One actual operation now passes353ordinary queries/nine rollback cleanups,
119,058rows/20,117,436bytes/48,056ms. Its COMMIT returns; all nine metadata hashes
match with only the intended LOGIN bit change. The restricted app authenticates
in its synthetic database with verified frontend TLS1.3, SCRAM-PLUS and server
final validation. All ten connections close. Distinct saved review recomputes
every stage hash, row/byte total and source/authority/launcher binding; one
positive and24negative controls pass without opening credential contents or
contacting the database.

The new operation is confirmed; the historical failed COMMIT remains unknown.
Broad privacy/CONNECT/provider-hop/release gates stay false. No Preview variable
installation, deployment, migration, actual outage or automatic retry occurs in
this package. Private evidence remains ignored; SHA256 bindings are:

- Actual boolean observation: `ac24fbaaedb8481cf1d222e551ca20b172f5f8c4669037182bd3701731313af2`.
- Supported V2 source: `09e9fb29772387940b6639b21b0187f85f47e4f1cf664a610aa8c6c4e9bc1a53`.
- Distinct source review: `907527ce6c23fc8ad3be7b8a7a3bb66ac420075b54db0d8745a3835400cd1c56`.
- Actual app authentication: `39a5d7510d0c54ceae95f2111176c70d8df0dc7b6b2b924c918033c148e77812`.
- Distinct actual review: `9856815caa817a3009ce6ea7474271d1254a77b59f71d35b32b51b3f81e0139b`.
- Poststate pins: `06d8ae42212d46fc302b6ad2dc4675c6e58b7fe9285e108622806a4bff9feeb7`.
