# Isolated Preview schema recovery — November 14, 2026

Exact application source `9b6202e7b2b309d5adc62ddf7d405ad7067fb8ac` passed the
bounded synthetic PostgreSQL 18.6 schema mechanism on the existing isolated free
Preview database at 18:19–18:20 UTC. This refresh covers eleven current tables and
nineteen synthetic records. It is client-TLS-only schema evidence, not hosted
security acceptance, production recovery/PITR proof or release qualification.

The [November 4 rehearsal](upgrade-2026-preview-schema-rehearsal-work.md) remains
historical nine-table/twelve-record evidence for `a4ac9f0e`; its successful receipt
and earlier failures are preserved. No real application rows were read or
written in this successor. No role/database privileges, normal application
schemas, production settings, provider routing or filing readiness changed.

## Source, scope and actual results

The terminal static lane’s installed source stage was reused read-only. All 5,762
tracked Git blobs—5,756 regular files and six literal symlinks, including
executable modes—match before and after execution. Source, Node 26.13.1,
PostgreSQL 18.6 native tools, dependency files, resource identity, unique schema,
namespace ownership, marker and default/direct ACLs were bound before mutation.
The process environment excluded inherited database/provider credentials and
used private 0600 credential files, never password-bearing arguments.

The actual run proves:

- Current eleven-table schema, two immutable trigger functions and two triggers;
  complete normalized catalog equality after transactional native restore.
- Two synthetic owners sharing one workspace ID, preserved unknown tax year and
  timestamps, metadata dry run without writes, and atomic rollback after a
  malformed later row. Migration apply strips the synthetic private note;
  reapplication is idempotent. After restore, metadata cleanup issues fresh UUID
  revisions for the two changed rows.
- Exact NUMERIC provider cost USD 0.0000006, a separate cancelled reservation and
  rejected undispatched zero-cost attempt, and preserved reconciliation data.
- One bound and one unbound credit issuance, actual test-mode initialization,
  preserved 700/500-cent issuance terms and historical 100-cent purchase, exact
  600-cent purchased budget, bound billing-event receipt, replay idempotence,
  rejection of live-mode reuse and functioning immutable triggers after restore.
  These are synthetic database fixtures; no checkout or provider request occurred.
- A 48,518-byte custom backup with 48 allowlisted TOC entries: eleven tables and
  eleven data sections, seven standalone indexes, thirteen separate constraints,
  two functions, two triggers, schema and comment. All 103 inline CHECK/NOT NULL
  constraints remain in full catalog comparison. Additive schema hooks were
  reapplied twice without data/catalog loss.
- Outside-schema relation identities unchanged, RESTRICT-only removal of the
  marked owned schema, both application/admin pools ended, schema and relations
  absent, and zero own rehearsal sessions. Generated credential files and the
  owned temporary backup directory were removed.

The controller closed normally with exit 0 in 64.968 seconds: six owned Node
connections, 354 explicit Node query invocations and seven native-tool
invocations. These counts exclude native clients’ internal protocol/catalog
queries. No cooperative abort, forced process-group termination, native timeout
or unresolved acknowledgment occurred.

## Retained failures and correction controls

The first prepared packet never ran. Independent source review found that
synchronous native TERM handling, pool close and the outer launcher could wait
without a hard bound. A distinct successor added remaining-work-clamped native
child deadlines, bounded pool close, a separately owned process group, cooperative
work cancellation and a bounded cleanup/reap window. Forced closure would be
reconciliation-required and cannot produce a cleanup PASS. Real offline
TERM-ignoring child/grandchild controls verify those boundaries.

That bounded successor ran once but stopped at archive admission before metadata
apply or restore. Cleanup proved schema absence, both pools ended, zero own
sessions and removal of generated credentials/temp files. Its receipt remains
`2b744cbfae339a4af19c090e621b84cc48a7a6241903182e2d062bc7018b374b`.
The failed run did not retain its raw TOC; the failing assertion is therefore not
claimed independently recovered from that run.

A separate actual local PostgreSQL 18.6 scratch cluster reproduced the checker
error with current source: its catalog contains 116 constraints—eleven primary,
one unique, one foreign, 27 CHECK and 76 NOT NULL—but pg_dump has only thirteen
separate constraint entries. CHECK/NOT NULL definitions are inline TABLE DDL.
The corrected allowlist distinguishes those representations while preserving
all 116 catalog rows in post-restore equality. Actual local dump/restore passed;
SQL controls that removed a CHECK or NOT NULL were detected by complete catalog
comparison, and restoring the archive recovered the exact baseline each time.
That new local server stopped normally and its cluster/credentials were removed;
existing services and the VM/Podman configuration were untouched.

The successful remote successor uses a new unique schema and retains synthetic
TOC/catalog metadata privately before archive admission. Unknown constraint
kinds, unvalidated constraints, foreign objects/owners, duplicate entries and
missing independent archive entries still fail closed. No coverage, privacy or
readiness threshold changed.

## Evidence and limits

| Evidence | SHA256 |
| --- | --- |
| Frozen 30-file source/artifact manifest | `c3c83e4d6f96148e21c165b08fa8beb9d4f7da305eae8f194c060e2db8f06796` |
| Separate source/offline review | `75cb8b9942e3a86f08282de1e9b38635c74d90e6594155af69df4cc8fa0dc167` |
| Saved-receipt postflight audit | `e8a84ca38742409349e65b91a6347844a29b96ed95ff3c1dcd593a3e76198fa0` |
| Actual operation receipt | `72bc390278b13c37759fcac4efbd140017055b4ac7dca2d675510225564b29ff` |
| Actual backup before cleanup | `505a6ff9d0b82f6e7337c0f51117c790cfcabf921d62313cb9681f2af0b5a600` |
| Retained synthetic TOC | `40f95e0ad95bac25281e276556974585cd63bbe001077cccec7e994c39fb2bb9` |
| Retained pretty-printed synthetic catalog | `a14013689a5c30323986951e0db7415b75840ecfe1382194045998355872307f` |

Ignored evidence is under
`nov14-preview-schema-11table-toc-prepared`,
`nov14-preview-schema-11table-toc-independent-review` and
`nov14-preview-schema-11table-toc-actual-8f765a6a`.
The separate postflight audit checks frozen files, receipts and retained
metadata. Transient row snapshots and the backup were removed by successful
cleanup; this audit does not claim a second database query or independent
inspection of removed backup bytes.

Owned Node clients actually negotiated CA/hostname-verified TLS 1.3 and required
SCRAM-SHA-256-PLUS with validated server final proofs. Native libpq required
verify-full/system roots, minimum TLS 1.2 and channel binding. Backend
`pg_stat_ssl` reported false; provider proxy-to-compute encryption remains
unqualified. Schema/table/column ACLs are owner-only; routine default EXECUTE
ACLs remain behind owner-only schema USAGE and are not described as owner-only
routine ACLs.

Historical DDL permutations, production/PITR recovery, operator custody,
provider internal transport and independent human security/privacy acceptance
remain separate gates. This result authorizes no production deployment, risk
acceptance, model promotion or filing activation.
