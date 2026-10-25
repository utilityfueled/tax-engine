# 2026 AI and billing execution evidence

Updated 2026-10-25 UTC. This is a durable package checklist, not release approval. No live model call, paid service use, staging deployment, model promotion or human qualification review occurred.

| Package | Status | Evidence |
| --- | --- | --- |
| Atomic credit ledger | Implemented; local PostgreSQL verified | Owner-serialized reservations, exact attempt cost, one-cent aggregate retail minimum, idempotency, failure holds, reconciliation and refund; 19/19 tests against disposable PostgreSQL 16.14 on loopback |
| Task adapter/responder | Implemented; focused tests passing | Fixed providers, explicit task profiles, structured response/schema versions, bounded usage/timeouts/cancellation, actual usage hooks, local fallback |
| Local opt-out | Implemented | Workspace-scoped default local help, failed-write fail-closed behavior, conversation clear on workspace change |
| Tax grounding | Confirmed transient transport implemented; production disabled | Separate private endpoint recomputes actual input, binds owner/workspace/revision/year/rules, redacts source identities and verifies output;2026 incomplete and client previews rejected |
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

- `pnpm typecheck:web` passed after the adapter migration and corpus type fix. Final server catalog tests passed 4/4; web typecheck passed. Scoped lint: zero errors and zero warnings after removing evaluator assertions.
- Focused AI, privacy, routing, billing-hook and evaluation tests: Latest routing/privacy/billing integration run: 260/260 across 14 files. Final evaluation/corpus run: 26/26 across two files. Both include the final local-only and frozen-corpus guards.
- Isolated real PostgreSQL ledger tests: 19/19. Exercises 12 concurrent requests sharing a budget, owner/idempotency isolation, legacy balances, cross-cycle purchased credits, settled failure + escalation, unknown transport usage + authoritative reconciliation, refunds, overrun cap, cancellation, settlement replay and referenced overrun closure without extra debit.
- Default unit runs skip database integration unless `TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL` explicitly points to a disposable loopback database. No staging/database credential is reused.
- Generated artifacts are drafts: `pnpm eval:models:sync`; `pnpm eval:models:check` checks freshness. The harness performs no provider calls.
- Commit references: `0d90200` atomic ledger foundation. `a649c61` closes investigated overruns without extra debit; `d3778d8` migrates AI help and billing integration. Evaluation changes are committed separately with the corpus artifacts.

## Remaining required actions

1. Owner must supply approved synthetic-only provider account access and an explicit spending cap. Record actual model IDs, structured-output/effort/usage capability, account settings and dated evidence for Luna High, Sol Low/High, optional Gemini 3.8 High and the two baseline profiles. Document unavailable/failed profiles; do not infer availability from pricing pages. No API key was present in the inspected process/usual local env-file locations.
2. Independent human reviewers must validate 200–300 representative cases and their expected fields/source grounding, retaining the held-out split. The 240 individually authored drafts do not satisfy this requirement. Execute repeated runs within the approved budget; retain failures, actual tokens/cost and independent quality/PII judgments. No LLM-only monetary judge is used.
3. The transient calculation transport is implemented under [its explicit privacy contract](ai-transient-calculation-contract.md). Separate unchecked calculation consent is required, local-only preferences take precedence, and the server recomputes validated facts. Known source identities are removed before provider/accounting hooks; known-identity model answers use the billed-failure fallback. Opaque request IDs stay stable when facts change; a separate payload digest detects reuse with changed calculations. The2026 catalog and model promotion remain closed. Final integrated browser/release and human review evidence is still required.
4. Rehearse real authenticated staging billing/provider/DB outages, duplicate/retried Stripe credits, concurrent spend, migration, backup restore and rollback with approved staging credentials. Local PostgreSQL tests are useful software evidence, not staging/auth/provider evidence.
5. Require reviewed report/corpus hashes, capability evidence and explicit owner promotion approval before any rollout configuration changes. Production remains deterministic and filing readiness unchanged.

## Transient transport verification

- Initial route, consent, source-identity and output-privacy regressions failed before their implementation. Latest adjacent route/adapter/context/privacy/billing/rollout/DOM cohort:123 tests across11 files passed. Log:`.local/upgrade-evidence/ai-transient-privacy-final.log`.
- Independent agent review found an employer-name leak and then legacy payer/recipient identity keys; both were reproduced red and fixed. Human review and live provider evaluation remain absent.
- No raw facts are added to the ordinary provider packet. The private POST is bounded to1MiB, same-origin checked, authenticated and entitlement checked in hosted mode, no-store on every response, cancellable and nonpersistent. Only allowlisted audited values and matching-year excerpts can ground answers.

### Reviewed transport and browser proof

Exact application tree `e2505e8b5e1bf848a8ea0ac9da21d90608f3dd19` passes
225 tests across10 route/context/privacy/auth/DOM files, the production web build
and scoped lint with zero findings. Desktop1280px and mobile390px Chromium cases
both pass with retries disabled; screenshots were inspected. These exercise
keyboard consent, no fact transmission while opted out, one private confirmed
request, disabled production-provider fallback and consent reset on reload.
Logs: `.local/upgrade-evidence/ai-transport-reviewed-{tests,build,lint,browser}.log`.

The browser found two actual integration defects: a completed guided-only return
had no document-derived year, and Next normalized a loopback request URL to
localhost. The client now uses the explicit confirmed input year only when no
document year exists; conflicts still reject. The origin guard uses the configured
public URL, with a narrowly checked loopback Host fallback for unconfigured
self-hosts. An independent agent then reproduced an originless hosted-config
bypass, which is corrected. Its two original probes and16 origin cases pass.
Forwarded headers cannot establish trust, and missing/invalid hosted production
configuration rejects even originless requests. These are finite synthetic local
checks, not live provider, staging or independent human qualification.

## Representative draft corpus replacement

The earlier 240 template variants plus30 additional cases are superseded by
corpus `tax-assistance-2026-r3`:240 individually authored synthetic cases,30 per
each of eight tasks, with20 development and10 fixed held-out cases per task. No
task/year/amount cross-product remains. Each case has distinct source narrative,
literal expected fields/audit values and case-specific human review criteria.
All reviews remain pending. Published held-out cases are not a secret benchmark
or evidence of real-world prevalence; external human review is still required.

[OpenAI model optimization guidance](https://developers.openai.com/api/docs/guides/model-optimization#model-optimization-workflow)
was refreshed on2026-10-25: evaluation inputs should represent actual use cases.
This source supports the workflow, not the synthetic tax oracles. The new spec
and count regression failed first against the old270-case pack; the final corpus,
scorer and CLI freshness cohort passes28 tests across3 files. Web typecheck and
spec references pass; scoped lint has0 errors and27 pre-existing assertion warnings
in the scorer tests. No provider was called. Evidence is in
`.local/upgrade-evidence/ai-representative-corpus-{red,green}.log`,
`ai-corpus-{web-types,spec,lint}.log`.

The next separate software slice is an approval-bound, budget-bounded repeated
executor with durable dispatch accounting and account capability records. Actual
application-schema validity must come from the actual versioned task schema;
normalized benchmark JSON is insufficient. Unsupported normalization/binding
methods remain explicit internal implementation blockers. Credentials, approved
spend, independent human review and live measurements remain absent.

Exact corpus tree `40b251b08dfa22a95c8bc63ade38de306b5296a9` passed34 tests
across4 files (including strict AST test-reference validation), web types and all
4,464 spec references. Parent independently reran28 corpus/scorer/CLI cases and
reviewed the draft/source boundaries with no actionable finding; this is agent
software review only (`parent-ai-corpus-40b251b-review.log`). The final evidence
append changes documentation only; no live records or human approvals were added.
