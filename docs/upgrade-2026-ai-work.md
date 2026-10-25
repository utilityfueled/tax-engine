# 2026 AI and billing execution evidence

Updated 2026-10-25 UTC. This is a durable package checklist, not release approval. No live model call, paid service use, staging deployment, model promotion or human qualification review occurred.

| Package | Status | Evidence |
| --- | --- | --- |
| Atomic credit ledger | Implemented; local PostgreSQL verified | Owner-serialized reservations, exact attempt cost, one-cent aggregate retail minimum, idempotency, failure holds, reconciliation and refund; 19/19 tests against disposable PostgreSQL 16.14 on loopback |
| Task adapter/responder | Implemented; focused tests passing | Fixed providers, explicit task profiles, structured response/schema versions, bounded usage/timeouts/cancellation, actual usage hooks, local fallback |
| Local opt-out | Implemented | Workspace-scoped default local help, failed-write fail-closed behavior, conversation clear on workspace change |
| Tax grounding | Safe catalog/receipt infrastructure implemented; current helper transport cannot supply verified audit | Server recomputation receipt bound to owner/workspace revision/year/rules; 2026 incomplete and client previews rejected |
| Evaluation | Infrastructure implemented; qualification blocked | 270 draft cases: 240 template variants and 30 distinct source-layout/decision scenarios, 88 held-out; **zero independently reviewed cases** and **zero measured provider runs** |
| Rollout | Implemented and disabled | Empty production config; qualification hashes/version/account evidence/owner approval, 5/25/100 observations, immediate prior-route/deterministic rollback |

Software contract and operator migration/rollback procedure: [AI routing and accounting](ai-routing-accounting-spec.md). The overall completion checklist remains in the parent upgrade progress/checkpoint files.

## Refreshed official sources

Read through official developer documentation on 2026-10-24/25; these are documented capabilities/prices, not proof this account can use a model.

- [OpenAI pricing](https://developers.openai.com/api/docs/pricing): Luna standard USD 0.10/0.50 per million input/output, cached read 0.01, 30-minute/12-hour writes 0.125/0.25; Sol 2/10, cached read 0.10, writes 2.50/5. Above 272k input, input/cache charges double and output is 1.5×; regional uplift 1.10. Exact dated registry preserves each applicable price.
- [Luna model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna): candidate profile uses High effort and the Responses API with structured output.
- [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching): cached read/write categories are disjoint, writes require TTL detail. Adapter validates `cache_write_tokens_details.ttl_30m_tokens` / `ttl_12h_tokens`; unknown allocation is held for reconciliation. Request uses standard service tier and explicit caching without breakpoints.
- [Google pricing](https://ai.google.dev/gemini-api/docs/pricing): Gemini 3.8 Flash standard 0.75/3.75 through 2026-12-31, then 1.50/7.50 from 2027-01-01; cache/read/storage prices are dated separately. All evaluation reports recompute January accepted-task cost.

## Checks and commits

- `pnpm typecheck:web` passed after the adapter migration and corpus type fix. Final server catalog tests passed 4/4; web typecheck passed. Scoped lint: zero errors, existing evaluator non-null warnings remain.
- Focused AI, privacy, routing, billing-hook and evaluation tests: 284/284 across 16 files, including the final catalog, adapter, routing, pricing and evaluation tests.
- Isolated real PostgreSQL ledger tests: 19/19. Exercises 12 concurrent requests sharing a budget, owner/idempotency isolation, legacy balances, cross-cycle purchased credits, settled failure + escalation, unknown transport usage + authoritative reconciliation, refunds, overrun cap, cancellation, settlement replay and referenced overrun closure without extra debit.
- Default unit runs skip database integration unless `TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL` explicitly points to a disposable loopback database. No staging/database credential is reused.
- Generated artifacts are drafts: `pnpm eval:models:sync`; `pnpm eval:models:check` checks freshness. The harness performs no provider calls.
- Commit references: `0d90200` atomic ledger foundation. Further scoped package references are appended below.

## Remaining required actions

1. Owner must supply approved synthetic-only provider account access and an explicit spending cap. Record actual model IDs, structured-output/effort/usage capability, account settings and dated evidence for Luna High, Sol Low/High, optional Gemini 3.8 High and the two baseline profiles. Document unavailable/failed profiles; do not infer availability from pricing pages. No API key was present in the inspected process/usual local env-file locations.
2. Independent human reviewers must validate 200–300 representative cases and their expected fields/source grounding, retaining the held-out split. The 270 drafts do not satisfy this requirement. Execute repeated runs within the approved budget; retain failures, actual tokens/cost and independent quality/PII judgments. No LLM-only monetary judge is used.
3. Complete and independently qualify year-specific tax rules/forms, then bind the existing server audit helpers to an authorized transient complete-confirmed-input calculation request. Current redacted workspace requests cannot safely prove taxpayer facts or audit values. Source catalog and exact blocked conditions are implemented; private-input transport is deliberately not expanded without a reviewed privacy/data contract.
4. Rehearse real authenticated staging billing/provider/DB outages, duplicate/retried Stripe credits, concurrent spend, migration, backup restore and rollback with approved staging credentials. Local PostgreSQL tests are useful software evidence, not staging/auth/provider evidence.
5. Require reviewed report/corpus hashes, capability evidence and explicit owner promotion approval before any rollout configuration changes. Production remains deterministic and filing readiness unchanged.
