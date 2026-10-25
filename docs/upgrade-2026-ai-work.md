# 2026 AI and billing execution evidence

Updated 2026-10-25 UTC. This is a durable package checklist, not release approval. No live model call, paid service use, staging deployment, model promotion or human qualification review occurred.

| Package | Status | Evidence |
| --- | --- | --- |
| Atomic credit ledger | Implemented; local PostgreSQL verified | Owner-serialized reservations, exact attempt cost, one-cent aggregate retail minimum, idempotency, failure holds, reconciliation and refund; 19/19 tests against disposable PostgreSQL 16.14 on loopback |
| Task adapter/responder | Implemented; focused tests passing | Fixed providers, explicit task profiles, structured response/schema versions, bounded usage/timeouts/cancellation, actual usage hooks, local fallback |
| Local opt-out | Implemented | Workspace-scoped default local help, failed-write fail-closed behavior, conversation clear on workspace change |
| Tax grounding | Confirmed transient transport implemented; production disabled | Separate private endpoint recomputes actual input, binds owner/workspace/revision/year/rules, redacts source identities and verifies output;2026 incomplete and client previews rejected |
| Evaluation | Infrastructure implemented; qualification blocked | 240 individually authored draft cases across eight tasks, 80 fixed held-out; **zero independently reviewed cases** and **zero measured provider runs** |
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

## Guarded repeated evaluation executor

The separate executor is implemented in `scripts/run-provider-eval.ts` with a
[local operator contract](ai-evaluation-executor.md). Offline planning freezes
the synthetic corpus, real application schema manifest, prices, profiles,
repetition count and limits. The generated approval template is unapproved;
explicit actual authorization is still required. No live call was made here.

The runner persists and syncs each dispatch before its one network request,
uses an exclusive private hash-chain journal, counts capability probes and
failed outputs against the exact Decimal budget, and preserves unknown-usage
holds across restarts. An operator may reconcile authoritative usage once with
an evidence reference; missing responses are never recreated. Resume skips all
dispatched identities. Capability, model, effort-request acceptance and usage
are captured as observations with a24-hour expiry. Failure, cancellation,
timeout, unknown pricing/usage and overruns remain nonpassing. Provider errors,
keys and rejected private-looking outputs are not echoed into records.

Shared application schemas were extracted without changing their current web
behavior. The executor validates against those real schemas, but explicitly
records missing normalization as an internal blocker. It refuses qualification
planning until those production bindings are complete; smoke runs cannot use
the declared held-out cases. The next separate package implements the actual
task contracts/normalizers rather than declaring normalized benchmark JSON an
application success. Live account measurements, approved spend and independent
human reviews remain absent, and all production rollout gates remain closed.

Spec-first red regressions caught ineffective durable append, missing required
output preflight, multiply linked journals, held-out smoke use and premature
qualification planning. They are preserved in
`.local/upgrade-evidence/ai-executor-*-red.log`. The offline runner/transport/
journal/CLI, scorer/corpus and actual web adapter cohort passes121 tests across
11 files (`ai-executor-scoped.log`). Dedicated script typechecking and web types
pass. Scoped lint has0 errors and27 pre-existing scorer assertion warnings.
These are synthetic software checks, not provider availability or human review.

Independent parent review of the first executor snapshot found two real gaps:
an aliased report path could replace the journal, and a same-ID model/policy
change could retain an old approval digest. Both were reproduced in new failing
regressions before correction. Artifact preflight now resolves existing
ancestors, symbolic targets, inode identity and conservative case/Unicode
aliases, including the reserved lock. Plans retain and hash resolved profiles,
complete task policies and the actual shared transport/prompt/wire contract.
The review fixes are in `ai-executor-review-{red,green}.log`; the reviewed initial
tree's passing tests did not establish those missing boundaries.

Final executor tree `5777d1a83108f6720d1a808abf9cc58404024f2a` passes123 tests
across11 files, dedicated script/root/web typechecks, all4,497 spec references,
artifact freshness and scoped lint (0 errors;27 unchanged scorer warnings).
Parent independently reran44 tests across5 files and both original alias/policy
probes; the journal stayed byte-for-byte unchanged and changed request policy
rejected. No remaining actionable finding in that bounded agent review
(`parent-ai-executor-5777-review.log`, `parent-ai-executor-{alias,policy}-fixed.log`).
This documentation append does not add a provider result or human approval.

## Actual application source contracts

The separate application contract slice adds explicit abstention, actual source
citations, signed decimal strings and null unknowns to the real task schemas.
Document callers validate proposals against literal supplied source text before
accepting a response. Suggestions retain unconfirmed business purpose; source
facts survive normalization and display separately without seeding engine input
or changing income/expense totals. Explanations and explicit cancellable
reconciliation require matching-year source/audit context and unchanged values.
Task prompt/schema versions change; production routing remains disabled.

Independent parent review found two acceptance gaps despite the initial passing
286-case cohort: arbitrary text fact values were not compared with their quote,
and unsupported-route prose could imply permission to file. Both were reproduced
in failing regressions before correction. Known text now requires nonempty literal
source text; unknown remains null. Unsupported assistance can select only a
bounded reason code, and the application renders its readable review message.
Model-authored unsupported prose is rejected, including the original filing claim.
The targeted corrected cohort passes24 tests across4 files in
`.local/upgrade-evidence/ai-bindings-review-{red,green}.log`. Final exact-tree
checks and independent re-review follow; this is not human or provider evidence.

Evaluation still has an explicit normalization blocker at this package boundary.
The next separate slice will send the actual schemas directly, derive observations
from accepted application output and independently authored synthetic request
context, and remove the model-authored evaluation sidecar. A passing normalized
benchmark object is never substituted for application-schema or grounding validity.

Final application tree `992da9c155fd688f146689b8e5ff2aa6de2a68c7` passes272
checks across16 files, root/web/executor types,4,537 spec references, generated
artifact freshness and the production webpack build. Scoped lint has0 errors
and18 unchanged assertion warnings. The first archive test command lacked the
pinned PDF prerequisite and a later command named the wrong script tsconfig;
explicit pinned Python and the correct config passed without code changes.
Parent independently reran24 cases across4 files and inspected both original
review findings (`parent-ai-bindings-992-review.log`), with no remaining
scoped finding. This final evidence append changes documentation only.

## Evaluation bound to application output

Application source contracts are committed as `556cfe4`. The next separate slice
removes the evaluation wire wrapper: providers receive the actual task JSON
schema, and both the runner and independent scorer derive observations from the
saved actual payload using shared source validation. Claimed passing flags or
normalized fields cannot replace validation. Unsupported responses retain their
actual constrained reason code. Failed grounding preserves real usage/cost;
private-looking output is discarded without discarding its billed attempt.

Corpus r4 retains240 cases and the fixed80 held-out split, adding explicit,
separately authored synthetic application contexts for explanation/reconciliation.
These contexts are request preconditions, not production tax-engine receipts or
independently verified tax oracles. Twelve missing/stale/conflicting/cancelled
contexts are recorded as deterministic preflight outcomes without dispatch,
provider schema scores, latency or usage. Model accepted-task cost excludes
these deterministic outcomes. All240 human reviews remain pending. A draft
contract cross-check found ambiguous compact source formatting and a synthetic
text oracle that inferred "yes"; source count labels and the literal printed
repayment phrase now preserve the declared contract instead. Known opaque
fixture references are excluded from person-name slug detection; actual private
text and invented references remain checked.

The new spec-first application/sidecar/preflight regressions initially failed
before implementation. Current focused executor/scorer/CLI/corpus cohort passes
56 tests across8 files (`ai-eval-bound-final.log`); root/web/executor types and
all4,563 spec references pass. Exact-tree checks and independent review follow.
No provider was called and no live approval, human review or rollout was added.

Independent parent review of tree `6a534660` found that passing flags were
recomputed but a stale corpus digest could still count against the current corpus.
The new regression reproduced acceptance before correction. Measured and preflight
records now carry SHA-256 identities for the full corpus and individual source
case, including request context. Scoring recomputes those identities, preserves
known cost, and rejects missing/stale context from qualification metrics. Reporting
also rejects a stale plan rather than relabeling an old journal with current facts.
The browser-safe hash dependency was declared separately as `d078cf4`; no new
package version was introduced. Plan references remain correlation, not signed
proof of live authorization or human review. A literal second execution now also
verifies preflight replay leaves the journal unchanged and makes no transport call.

Parent's next independent probe on `8e74cbf6` found that a correct payload with a
missing or different reported model still qualified. The new regression first
reproduced that acceptance (`ai-eval-model-identity-red.log`). Execution and scoring
now share an explicit documented model alias/snapshot allowlist; final attempted
profile and allowed Sol High escalation are checked, and arbitrary suffixes reject.
The allowlist is hashed into the approved execution contract. Known usage/profile
cost remains visible after failure, without claiming the mismatched model's invoice
is authenticated. The focused rerun passes44 tests across3 files
(`ai-eval-model-identity-green.log`), including actual baseline snapshot, unknown
snapshot, missing identity, wrong model, wrong initial profile and escalation.
All examples remain synthetic unit evidence, with no live run or human review.

Final immutable tree `449010cb3d2e7d73e02659351eb32d28e5dca634` passes105
tests across13 files, root/web/executor typechecks,4,571 spec references,
generated-artifact freshness and the production webpack build. Scoped lint has
zero errors and23 unchanged assertion warnings (`ai-eval-4490-exact-*.log`).
Parent independently reran49 tests across4 files and the original model/provenance
probes, with valid controls and228 request envelopes still within input bounds.
The parent's four extra identity/cost controls passed; no remaining scoped issue
was found (`parent-ai-eval-4490-{review,model-probe,final-probes}.log`). This is
agent software review, not independent human tax/AI review or provider evidence.
This final append changes evidence documentation only.

## Final provider refresh and finite scope

Actual application/corpus/model provenance is committed and pushed as `f4da2a6`.
The separate [October 25 provider refresh](upgrade-2026-provider-refresh.md)
preserves rates/effective dates, captures public model capability sources and the
December 11 GPT-5 Mini shutdown, and closes the confirmed legacy Google regional
pricing guard. Actual account availability remains unverified for every profile.

The final refresh tree `4b2808c96814c5bcf200ed54bd41917a7603314e` passes106
tests across13 files, all three typechecks,4,584 spec references, generated
freshness, scoped lint with no warnings/errors and the production webpack build.
Parent's independent18-test rerun and separate lifecycle/cost/immutability probes
pass with no scoped finding; exact evidence is in the linked refresh ledger.
The finite internal AI queue is now the reviewed refresh's scoped commit and the
parent's final-head integration/release checks. No unresolved extraction schema,
context transport, corpus construction or guarded-executor TODO is being labeled
external. Agent review does not constitute human or live provider qualification.

External completion evidence remains: approved provider project/account access
and spend cap; actual capability/usage results; independent human review of 240
drafts and repeated held-out results; authenticated staging Stripe/account/DB
failure, restore and rollback evidence; and explicit owner approval before any
model rollout. Local PostgreSQL/concurrency, synthetic transport, privacy and
browser checks are recorded separately above. They do not replace those results.
