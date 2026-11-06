# AI routing and credit accounting contract

Version: 2026-10-25. This defines software behavior; it does not qualify a model, tax rule or filing artifact.

## Dispatch and privacy

- The server owns task, profile, effort, prompt/schema version, output budget and provider endpoint. Request JSON cannot select evaluation mode or supply rollout evidence.
- Production has no enabled route without current, independently reviewed qualification and owner approval. Credentials alone do not enable a model. Optional Google selection is explicit. A failed provider attempt never silently switches providers or retries.
- Local help is the default per workspace. Opt-out or missing qualification produces deterministic help with no provider cost. Failed preference writes keep the current session local. Switching workspace clears the helper conversation and aborts pending work.
- Only redacted extracted text reaches a provider; PDFs/images and direct identifiers are rejected. OpenAI uses fixed HTTPS, redirects disabled, `store:false`, standard service tier, and explicit caching with no breakpoints. No response cache is enabled.
- Input bound is UTF-8 byte length of content, instructions and JSON schema plus 1,024 framing tokens. Task output limits include reasoning. Routine timeout is 30 seconds; complex reconciliation is 120 seconds and requires a cancellation signal. Response bytes are bounded at 1 MiB.
- Schema, citation, identifier, readiness and exact numeric checks precede acceptance. Failed validation retains billed usage and returns deterministic help. Sol explanations require matching-year server-owned spec excerpts and a fresh server-calculated audit receipt bound to authenticated owner, workspace revision and rule version. Browser previews cannot establish authority.

## Money and concurrency

- Monetary arithmetic uses an isolated Decimal precision of 80 digits; PostgreSQL stores exact provider USD as `NUMERIC` and safe-integer retail cents as `BIGINT`. No floating dollar arithmetic is permitted.
- Reserve the task's bounded maximum before dispatch in a transaction protected by an owner advisory lock. Included credits are cycle-scoped; purchased credits and pending holds are owner-scoped across cycles. Existing legacy charges remain counted without repricing.
- `(owner_id, request_id)` is an idempotency key bound to a SHA-256 payload digest. A duplicate cannot dispatch again. A different payload under that key fails. Raw request/response text never enters the ledger.
- Record each dispatched attempt exactly once. At most one explicitly approved Sol High escalation follows a known rejected attempt. Its maximum is reserved before the first dispatch. Known failed validation and retry/escalation usage are billed, not dropped.
- Settle reported tokens, including cached reads and duration-specific writes, context tiers and configured regional uplifts, at dispatch-time effective prices. Unknown models, prices, service tiers, missing usage or ambiguous cache writes require reconciliation.
- Exact provider costs sum across attempts. Retail charge is `max(1, ceil(totalProviderUsd * 100))` once per logical request. Release unused holds atomically. Never debit beyond the authorized hold: retain an overrun and mark reconciliation required.
- Transport failures, timeouts and cancellation after dispatch retain the hold; an authoritative reconciliation reference is required before settling unknown usage. Only never-started reservations can be released without provider evidence.
- Settlements and refunds are idempotent. Refunds require an operator reference, restore the original included/purchased charge allocation and preserve immutable provider usage/cost history. No public refund/reconciliation endpoint exists.
- A known-cost overrun can be closed only by `reconcileOverrun` with a durable operator reference, no remaining holds and every attempt final/known. Closure retains the exact overrun and original capped charge, never adds a debit, and permits an ordinary referenced refund afterward. Unknown usage cannot take this path.

## Qualification and rollout

- Draft cases are not independent review. At least 200 reviewed cases, a fixed held-out subset and three repeats are required. Preserve failed/abstaining results and all billed attempts.
- Each profile needs dated account capability evidence for structured output, effort and token usage, expiring within 30 days and covering attempt times. Unavailable/failed profiles are explicit nonpassing records.
- Gates include 99.5% schema/critical exact fields, no observed safety failures or critical regression, independent prose/PII review, and accepted-task costs including failures at actual and January 2027 prices.
- Initial P50/P95 limits are 10/30 seconds routinely and 60/120 seconds for reconciliation; accepted-task spend limits are USD 0.50/1.00. A candidate must show at least 10% cost reduction or one percentage point quality gain against both baseline reports. Missing baseline evidence blocks promotion review.
- A measured report permits human promotion review only. Production config remains empty. Authorized rollouts progress 5% → 25% → 100%, using stable HMAC cohorts scoped to owner/task and reviewed observations from the previous stage. Rollback selects a still-qualified previous route or deterministic help immediately. Changed prompts/schemas, expired evidence or opt-out fail closed.

## Migration and rollback

The additive schema preserves the legacy usage ledger and adds reservations/attempts. Apply through `ensureHostedAppSchema`; repeat application is idempotent. Back up all three ledgers plus purchases before staging migration. Rehearse a backup restore and verify sums, in-flight holds, refunds and provider references. Do not delete the new tables on application rollback or resume the old estimated debit path: disable provider dispatch first, reconcile outstanding attempts, then roll back the application while preserving ledger data. A local disposable PostgreSQL rehearsal is not staging evidence.

## Audit transport boundary

`calculateVerifiedAiAudit({ownerScope, workspaceId, workspaceRevision}, confirmedTaxInput)` accepts a complete confirmed `TaxYearInput` only inside a trusted transient server calculation. It validates and recomputes through the deterministic engine, then returns an in-process receipt. `resolveServerAiTaxContext` accepts only that receipt and matching scope/current rule version. It exposes mapped line values and source excerpts, never identity fields or raw inputs.

The existing `/api/provider/workspace` packet is redacted browser state and cannot establish an audit receipt. A separate `/api/workspace/tax-explanation` transport accepts a bounded, explicitly confirmed complete input under the [transient calculation contract](ai-transient-calculation-contract.md). The server validates and recomputes it, passes only its request-local receipt to the responder, and removes known household/source identities from free text. Provider and accounting hooks receive only the projected redacted packet and a calculation digest. The opaque logical request ID is independent of facts/redaction, so changed input cannot create a different reservation identity by changing a name. Known-identity answers fail validation while retaining billed usage. Facts are never persisted or logged by this transport.

Production routes remain disabled. The2026 catalog is unavailable while the federal pack is incomplete; adding matching-year reviewed line excerpts accompanies rule qualification. A completed synthetic transport test does not qualify a model, provider account, tax year or filing artifact.
