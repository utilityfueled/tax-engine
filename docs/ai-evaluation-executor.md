# Synthetic provider evaluation executor

`scripts/run-provider-eval.ts` supplies offline plans, explicit live execution, a
durable local attempt journal, usage reconciliation and export into the existing
evaluation scorer. It does not approve spending, review cases or responses,
qualify a provider, or change a production route.

The current corpus contains 240 draft synthetic cases. All human reviews are
pending. Smoke runs use only its 160 development cases; the 80 published held-out
cases require qualification mode with a separate, complete, independently
reviewed copy of the frozen corpus. Publication is not evidence of secrecy or
absence from model training. The executor sends source input, source references,
requested field names/types and the actual application schema. It never sends
golden values or reviewer criteria.

## Offline preparation

Use the repository's pinned Node 24 toolchain. No provider key is needed to create
a plan. Choose explicit profiles, a short expiry and both a dollar and request
ceiling. For example, this creates one capability probe plan and an **unapproved**
approval template; it does not call a provider:

```sh
node --import tsx scripts/run-provider-eval.ts plan \
  --run-id=capability-example --purpose=capability --profiles=luna-high \
  --max-usd=0.01 --max-requests=1 --expires-at=REPLACE_WITH_UTC_EXPIRY \
  --plan=.local/ai-eval/plan.json \
  --approval-template=.local/ai-eval/approval.json
```

For a smoke plan, supply `--purpose=smoke` and optionally comma-separated
development `--fixtures=...`. The default is every development case, three times
per profile. A capability probe precedes actual provider cases. When every named case fails deterministic context preflight, no probe or provider request is made. Qualification uses
`--purpose=qualification --reviewed-fixtures=path.json`; that JSON must contain a
`fixtures` array preserving every frozen field except actual review metadata.
All 240 cases are required. A plan commits to the corpus, reviewed copy, actual
schema binding manifest, pricing table, resolved provider/model/effort profiles,
every task's budgets/timeouts, actual prompt/transport constants, wire schema,
repetitions and limits. The complete execution contract is retained in the plan
as well as hashed, so a same-ID configuration change cannot reuse its approval.
Changes require a new plan and authorization.
Actual bindings now use all eight production task schemas and the same source
validation as the application. Each response is the real task JSON; no
model-authored normalization sidecar is accepted. The independent scorer reparses
the saved actual payload, derives its observations and rejects inconsistent flags,
fields or old binding versions. Human review remains required for prose grounding,
quality and PII; shape and literal-source checks do not establish those judgments.
Measured and preflight records include the complete corpus digest and individual
fixture digest, including actual request context and golden contract but excluding
review metadata. The scorer recomputes both against the current frozen corpus.
Missing or stale provenance cannot count as a current schema, exact-field,
accepted-response or deterministic-preflight success. Known costs remain visible.
The plan digest is a correlation reference with a required SHA-256 format; it is
not a signature or independent proof of authorized live execution. Preserve and
review the actual plan, approval and durable journal alongside exported records.
Both dispatch and scoring require the reported model to match the final attempted
profile, including an explicit Sol High escalation. The shared allowlist accepts
documented aliases/snapshots only; an unknown model or invented suffix cannot
qualify. The allowlist is part of the frozen execution policy. Known attempt
usage and its recorded profile cost remain visible after an identity failure;
that retention does not authenticate the responding model or its true invoice.

Corpus r4 keeps240 cases and the fixed80 held-out split. It adds separately
authored synthetic application-context literals for explanation/reconciliation,
including explicit stale/conflicting/missing/cancelled contexts. These are test
preconditions, not actual production engine receipts or validated tax oracles.
The12 context-rejected cases produce separate preflight records with no provider
schema score, latency, tokens or invented model quality. Qualification reports
require their three actual deterministic outcomes separately from the228 provider
cases. Preflight successes never inflate model accepted-task counts or lower
cost per accepted model task. Golden values and human criteria are not sent;
only actual request context and requested field/audit names are visible.

The approval template deliberately contains null authorizer, time, account and
approval reference. A human authorized to spend must approve the exact plan and
provide the resulting reference. Filling the file or adding a command flag is
not itself permission. The operator must verify that the configured account,
standard text service tier, global endpoint, retention settings and pricing
match the authorization. Never put keys in the plan, approval, command line,
corpus, logs or journal.

## Authorized execution and resumption

Only after actual authorization, inject the selected providers' keys through the
local process environment: `OPENAI_API_KEY` and/or `GEMINI_API_KEY` (the existing
`GOOGLE_API_KEY` alias is also accepted). No key discovery or credential printing
occurs. Every selected provider must be configured before execution starts.

```sh
node --import tsx scripts/run-provider-eval.ts execute --live-authorized \
  --plan=.local/ai-eval/plan.json --approval=.local/ai-eval/approval.json \
  --journal=.local/ai-eval/attempts.jsonl --output=.local/ai-eval/results.json
```

Qualification execution also supplies the same `--reviewed-fixtures` file.
Repeating the exact execute command resumes; it never repeats a durable dispatch
ID. Each append is synced before network dispatch. A private single-writer lock,
one-link regular file and hash chain reject concurrent, modified or torn
history. Creation also syncs the containing directory. Interrupted/stale locks
require operator inspection of the recorded host/process and preservation of
the journal before manual lock removal. Do not delete a paid run to retry it.
These are local filesystem guarantees, not a distributed or tamper-proof ledger.
Before opening or writing any artifact, canonical parent/target paths and inode
identities must be distinct, including the journal lock. Case-only and Unicode
normalization aliases are conservatively rejected on every volume. A report may
never replace an input or durable journal via a symbolic or hard link.
Keep the exact reviewed code revision with the run artifacts. Reconciliation
and reporting validate its frozen corpus, schemas and price-table digest too;
use that revision for historical records, rather than rewriting old plan hashes
after a code or price refresh.

Fixed official Responses/GenerateContent endpoints use one request, no redirect,
automatic retry, continuation, tools or persisted conversation. OpenAI requests
set `store:false`; that flag is not proof of account retention configuration.
Cancellation/timeout may occur after a provider has billed a request. Missing or
unpriceable usage therefore retains the entire reserved maximum and stops all
further requests. The runner also stops for an expired approval/capability,
request ceiling, budget limit or observed overrun. Capabilities expire after
24 hours and record actual model/strict-probe/usage evidence; successful API
acceptance alone does not prove quality or retention settings.

Every attempt, including probes and failed/invalid/refused responses, counts
toward the same Decimal budget. Maximum reservations conservatively cover the
bounded input/output and supported cache/regional rates. Actual authoritative
usage settles at its dispatch date. Output includes reasoning tokens once.
Unpriced service tiers/cache durations, unknown usage and unexpected model
responses do not become passing results. A known overrun is retained exactly and
blocks more spending; no automatic extra authorization is assumed.

## Usage reconciliation and reporting

After obtaining the provider's authoritative usage for an uncertain attempt,
save only its supported usage fields in a private JSON file and record the
durable account usage/invoice reference. Reconciliation closes cost uncertainty
once; it does not fabricate the missing response, capability or human review.

```sh
node --import tsx scripts/run-provider-eval.ts reconcile \
  --plan=.local/ai-eval/plan.json --journal=.local/ai-eval/attempts.jsonl \
  --attempt=EXACT_ATTEMPT_ID --usage=.local/ai-eval/actual-usage.json \
  --reference=ACTUAL_USAGE_EVIDENCE_REFERENCE
node --import tsx scripts/run-provider-eval.ts report \
  --plan=.local/ai-eval/plan.json --journal=.local/ai-eval/attempts.jsonl \
  --output=.local/ai-eval/results.json
```

`results.json` fits `pnpm eval:models:live-summary -- --live-run-file=...`.
Results remain nonqualifying until independent fixture and output review,
measured coverage, actual application normalization and every existing gate
passes. Smoke provenance cannot pass qualification. Task schemas and source
normalization are shared with the application; the scorer derives observations
from the actual payload and exact current source context. A claimed normalized
observation is not an application-schema pass. The journal retains valid outputs for real
review; known direct-identifier output is discarded and recorded as a failure.

Offline tests use synthetic transports and local files. They establish software
behavior, not account availability, paid results, retention, human review or
production readiness.

Sources: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[OpenAI model optimization](https://developers.openai.com/api/docs/guides/model-optimization),
[Gemini structured outputs](https://ai.google.dev/gemini-api/docs/generate-content/structured-output),
[Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking),
[GenerateContent API](https://ai.google.dev/api/generate-content).
