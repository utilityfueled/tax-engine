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

Use the Node version pinned in `.node-version`. No provider key is needed to create
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
qualify. The allowlist is part of the frozen execution policy. A missing or
mismatched model leaves the attempt's maximum budget held until authoritative
usage evidence identifies the approved model. The executor keeps the hashed
response reference to help locate that evidence.

The public provider documentation snapshot is separate from account evidence and
is included in the approved request contract. GPT-5 Mini's published shutdown is
December 11, 2026; new plans and each paid dispatch reject from 00:00 UTC that day.
Pre-shutdown costs remain recorded. January baseline costs are labeled historical
projections for a retired model, with no silent replacement or gate relaxation.
See [the current provider refresh](upgrade-2026-provider-refresh.md).

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

### Independent case review

Make a private copy of the [frozen fixture pack](../prompts/provider-model-eval/fixture-pack.json).
It contains 160 development cases and 80 held-out cases. For each case,
review the fictional source, proposed answer or abstention, expected
fields and case-specific criteria. Independently check money, dates and
their source records. Record any disagreement by fixture ID. If a case
needs a different oracle, correct the source corpus before preparing a
new qualification plan.

Keep all frozen content, IDs, splits and `review.author` intact in the
copy. After a human independent of the case author resolves the review,
set `review.status` to `reviewed`, identify the actual reviewer in
`review.reviewer` and use the actual ISO date or timestamp in
`review.reviewedAt`. Leave unresolved cases pending. This offline
command checks the reviewed copy against the frozen corpus and counts
accepted case reviews without contacting providers.

```sh
pnpm eval:models:live-summary -- \
  --reviewed-fixtures-file=.local/ai-eval/reviewed-fixtures.json
```

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
If cancellation occurs during the durable dispatch write, the executor has
still to call transport. It records the attempt as unsent and gives it no score
or provider charge. Resuming the journal skips that attempt ID. A dispatch
without a durable terminal record still holds the full maximum. After transport
starts, missing or unpriceable usage also holds the full maximum and stops more
requests. If headers arrive before a body error, the journal retains the HTTP
status and a hash of the provider's request reference. Those fields can help
review the attempt and do not establish authoritative usage. The runner also
stops for an expired approval or capability, request ceiling, budget limit or
observed overrun. Capabilities expire after 24 hours and record actual model,
strict-probe and usage evidence. API acceptance alone cannot establish quality
or retention settings.

Every dispatched attempt, including probes and failed, invalid or refused
responses, counts toward the same Decimal budget. Maximum reservations
conservatively cover the bounded input and output and supported cache and
regional rates. Actual authoritative usage settles at its dispatch date.
Output includes reasoning tokens once.
Unpriced service tiers or cache durations, unknown usage and unexpected models
retain their holds and stop more requests. When the response establishes the
approved model, known usage remains billable even for a failed or refused output.
A known overrun is retained exactly and blocks more spending.

## Usage reconciliation and reporting

After obtaining the provider's authoritative usage for an uncertain attempt,
save its supported usage fields in a private JSON file. Supply the durable
account usage or invoice reference and the billed model ID that evidence names.
Reconciliation releases the hold only if that ID matches the approved model or
a documented snapshot in the same pricing profile. The missing response,
capability and human review remain unverified.

Older reconciliation records without a billed model and result records with
usage but no matching model remain in the journal. While those attempts are
unresolved, reports show their assumed-profile costs separately as
`legacyUnverifiedProviderCostUsd`. Those attempts keep their full budget holds
and export unknown usage to the scorer. Append one reconciliation
with verified model evidence to release the hold and count the exact cost once.
If the evidence names a different model, leave the hold in place pending
investigation. Use a CLI that supports `--billed-model` to open journals with
the new records.

The reporter validates the recorded plan’s request policy. For a historical
plan whose policy has changed, use its pinned source revision in `report` mode
with credentials absent from the environment. Keep the original plan and
journal bytes intact. Replay and promotion require separate authorization.

```sh
node --import tsx scripts/run-provider-eval.ts reconcile \
  --plan=.local/ai-eval/plan.json --journal=.local/ai-eval/attempts.jsonl \
  --attempt=EXACT_ATTEMPT_ID --usage=.local/ai-eval/actual-usage.json \
  --reference=ACTUAL_USAGE_EVIDENCE_REFERENCE --billed-model=ACTUAL_BILLED_MODEL_ID
node --import tsx scripts/run-provider-eval.ts report \
  --plan=.local/ai-eval/plan.json --journal=.local/ai-eval/attempts.jsonl \
  --output=.local/ai-eval/results.json
```

For each run response, preserve the original report and review a copy.
Use the retained source context and case criteria to judge grounding,
quality and PII exposure. Where possible, omit the provider label from
the review material and associate the finding with the original case,
profile and repeat afterward. Enter the actual human assessment in
`independentReview` with `method` set to `human`, the reviewer identity,
and the boolean `grounded`, `qualityAccepted` and `piiLeak` results.
Leave `independentReview` null for unreviewed entries. Keep the response,
measurement and usage fields as recorded.

```sh
pnpm eval:models:live-summary -- \
  --live-run-file=.local/ai-eval/reviewed-results.json \
  --reviewed-fixtures-file=.local/ai-eval/reviewed-fixtures.json
```

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
