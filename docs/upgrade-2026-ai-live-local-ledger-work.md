# Actual provider usage and local credit settlement

Three synthetic OpenAI requests through the actual task adapter and hosted
accounting hooks pass against a fresh local PostgreSQL schema. Independent
engineering review verifies 45 saved-source/evidence/Decimal controls and five
actual read-only queries. This is local integration evidence, with no hosted
staging or model qualification claim.

| Attempt | Reported input/output tokens | Exact calculated provider USD |
| --- | ---: | ---: |
| Normal Luna High | 1,561 / 143 | 0.0002276 |
| Deliberately rejected Luna High | 1,561 / 186 | 0.0002491 |
| Explicit Sol High escalation | 1,561 / 453 | 0.007652 |
| Total | | 0.0081287 |

The pinned effective prices are Luna $0.10/$0.50 and Sol $2/$10 per million
input/output tokens. Each request reports zero cached input tokens. Independent
Decimal arithmetic reproduces every stored NUMERIC cost without counting
reasoning tokens twice. These are policy-priced actual usage records, not a
provider invoice reconciliation.

The normal logical request charges one included cent. The second logical
request retains its 23-cent reservation after the known rejected first attempt,
then aggregates both known attempt costs before applying the one-cent minimum.
It charges one cent, rather than two separately applied minimums. Both final
reservations are settled, with zero held credit, purchased charges or refunds.
Duplicate-request denial occurs before any extra dispatch; identical settlement
replay leaves the actual database unchanged. Actual NUMERIC and bigint columns,
two reservation rows and three attempt rows match independent read-only queries.

The first attempt on the second request was deliberately rejected by the
engineering harness after application parsing and grounding. It demonstrates
known-cost accounting through that path; it does not establish a natural model
quality failure or a qualified escalation strategy. Raw provider outputs were
not retained. The successful run does not exercise transport-unknown recovery.

The root launcher first failed before credential loading or child creation
because it assumed a manifest mapping where one reviewed manifest used a list.
That zero-dispatch failure remains recorded. After the local preflight correction,
one actual child completed three requests in 48.36 seconds with closed pools and
unchanged application source pins. No dispatched request was retried.

Cumulative calculated testing cost is $0.17264080. The earlier unresolved
$0.022384 reserve remains held, yielding $0.19502480 known plus reserved exposure.
The supplied authorization permits testing strictly below $140; this rehearsal
used a separate $0.25 cap. Credentials remain private and absent from commits.

Retained local evidence under `.local/upgrade-evidence/`:

- Source: `nov05-live-ai-local-pg-ledger-sourcefirst`, manifest
  `bc9f0208398ef55215208688ed34e9cec9b74533ff52574139e619f6416a7414`.
- Distinct source review: `nov05-live-ai-local-pg-ledger-independent`, manifest
  `f1df315a3e3dda111dc0b3c08550a02ef1731bce24bbcdc08fbb407584c7e343`;
  87 offline controls pass before live execution.
- Actual receipt/journal: `nov05-live-ai-local-pg-ledger-actual-ai_live_20261105_5a2c1b03b166`.
- Distinct actual review: `nov05-live-ai-local-pg-ledger-actual-independent`,
  manifest `b03511a840561bd2ed4f64dbe25054d445058180c0b9ca74e3a3186973c16a7f`.

The exact disposable schema and nine tables were removed with a known committed
RESTRICT transaction after matching every captured row and a fresh read-only
identity/OID check. The client closed; public tables and the PostgreSQL service
remained untouched. Two earlier cleanup attempts stopped before database work
because the helper resolved PostgreSQL from the wrong package root. Their
receipts remain failed. A separate CIDR/host comparison defect was corrected
from prior captured evidence; it was not the observed cause of those failures.
The successor verifies the actual installed module before reading credentials.
Its source manifest is
`385cb46853e4338cf64a1dc039d6047478226332748967840f8a28558cf8891c`.

Hosted isolation/outages, concurrent races, purchase/refund handling, provider invoices,
representative repeated held-out evaluation, independent human review and
release qualification remain open. Filing and model promotion remain disabled.
