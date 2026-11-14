# Actual provider usage and local PostgreSQL credit accounting, November 14

One bounded rehearsal passed against application source `d711b5b43d99f5f3a17d868d6bab3cffe08cb432`. Actual OpenAI Responses calls used the existing authorized testing key, the unchanged Luna High document-classification policy and fictional redacted W-2 text with no identifiers, monetary amounts or tax year. Actual `executeAiTask`, `hostedAiTaskAccounting`, schema initialization and `createHostedAiLedger` executed against a new, isolated loopback SCRAM PostgreSQL 16.16 cluster. No Vercel credential transfer, Stripe transaction, purchased credit, production change or model promotion occurred.

| Actual logical request | Reported input/output/cached tokens | Exact provider cost, USD | Local included retail debit |
| --- | --- | --- | --- |
| Application-schema and grounding acceptance | 1,633 / 157 / 0 | `0.0002418` | 1 cent |
| Deliberate engineering rejection after genuine parsing and grounding | 1,633 / 145 / 0 | `0.0002358` | 1 cent |
| Total | Two HTTP 200 responses | `0.0004776` | 2 cents |

The second request demonstrates billing after an intentionally rejected output, not a naturally occurring model failure or independent quality judgment. Both provider request identifiers and actual usages are retained privately. Monetary verification independently used Decimal arithmetic at precision 80 and the official [standard pricing table](https://developers.openai.com/api/docs/pricing): Luna input `$0.10`, output `$0.50`, cached input `$0.01`, 30-minute writes `$0.125` and 12-hour writes `$0.25` per million tokens. This run reported no cached input or writes. It stayed below its two-request maximum and `$0.02` additional allowance.

The actual database reported `NUMERIC` provider costs and `bigint` credit amounts. Each reservation settled with its exact matching usage/cost and one-cent minimum charge; included and purchased holds, purchased charges and refunds were zero afterward. There were no purchased-credit, issuance or legacy-usage rows for the synthetic owner. The actual hooks denied an identical request before provider dispatch, then denied a distinct request after the two-cent budget was exhausted. Identical settlement replay left rows unchanged. These observations exercise the real advisory-lock/transaction implementation; this sequential rehearsal supplies no new concurrent-race or deployed retail qualification claim.

Both connection pools closed. The controller's four init/start/admission/stop commands exited zero, its total elapsed time was 40.073 seconds, cleanup errors were empty and normal fast PostgreSQL shutdown completed. The owned postmaster PID file and temporary bootstrap-password file were absent afterward. The isolated database/schema remains stopped and retained for inspection. The API key was never written by this rehearsal; only private in-memory transfer to the owned helper was used. The helper has a durable one-use authority claim and cannot automatically replay an uncertain invocation.

## Cost reconciliation boundary

The previously recorded known usage total `$0.26282160` plus this run's `$0.00047760` is **`$0.26329920`**. The historical unresolved timeout reserve remains **`$0.022384`**. Accounted exposure is therefore **`$0.28568320`**, below the user-authorized `$140` cap. This is usage-priced accounting, not an invoice reconciliation. The earlier timeout has not been released, refunded or claimed reconciled. Retail cents remain separate from exact provider costs.

## Artifact custody

Private evidence is under `.local/upgrade-evidence/nov14-live-ai-local-ledger-prepared/`, `nov14-live-ai-local-ledger-actual-ae71ba510974/` and `nov14-live-ai-local-ledger-controller-ae71ba510974/`. No raw provider output, API key or connection URL is included in this document. Independent review recomputed all 12 packet members, 32 source/tool pins and 25 matching committed Git blobs, checked the real journal and database result rows, independently recomputed both costs and verified normal cleanup. It made no provider request, database connection or credential load.

| Artifact | SHA-256 |
| --- | --- |
| Frozen packet `manifest.json` | `c5931c3f5f415506f52910dd0635cb34b1695897d868814eced68d0614610733` |
| Source/tool pins | `5a341bacec47d4f20a12e31664577f6d08621f2cf2f1a7ac25bf748624795340` |
| Actual application helper `receipt.json` | `bc2c898e5564aef4dc5846ae119f3e02bb3f9a6333dcfcbb74fb3896bdaa0834` |
| Actual fsynced `journal.jsonl` | `51e48695fb5ea1266f088954c3de78ffd455dcd21dfc056412d8bb6297beb860` |
| Actual `controller-receipt.json` | `b593b2e2b12f2abc9153a1056fa3feafba848116d94d2a66a10a98f6a3d80db7` |
| Independent `farmland-actual-review.json` | `8251733c047045dc3aeda1de3f1e1f80000f466cb26cf93d629f26e63cf118f5` |

Preparation passed 46 offline math/input/wire/import controls, 25 controller admission/private-file controls, scoped TypeScript and syntax checks. This limited actual integration adds neither held-out human labels nor qualified tax review. Filing, final model promotion, invoice reconciliation and deployed retail readiness retain their independent gates.
