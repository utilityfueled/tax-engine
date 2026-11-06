# Hosted subscription reconciliation

The previous webhook path could acknowledge an event without a durable receipt,
skip a retry using the local processing clock, or write the same entitlement
twice. Six source-first existing-API controls reproduced three genuine failures
and three passes before either product changed. The retained RED receipt is
`bf58aab97959bc2e2f96664e3a82d894124d9a5000ebc1649747fcd07303f6d0`.

Subscription reconciliation now checks out one PostgreSQL client and commits the
event receipt and subscription state in one transaction. Sorted customer and
subscription advisory locks cover absent rows as well as existing records. A
duplicate receipt causes no second provider read or entitlement write. The
transaction retrieves the current subscription from Stripe with bounded request
settings, validates its owner, customer, plan, period and explicit mode, and
uses that authoritative state rather than webhook arrival order. A canceled old
subscription cannot replace a different active subscription. Conflicts and
provider failures remain retryable; failed writes roll back the receipt too.

This follows Stripe's [event-ordering guidance](https://docs.stripe.com/webhooks#event-ordering)
and PostgreSQL's [transaction contract](https://www.postgresql.org/docs/16/tutorial-transactions.html).
No tax arithmetic, credit-pack settlement, model promotion or filing gate changes.
The legacy test adapter forwards only test dependency hooks; it is not a product
fallback or evidence of SQL behavior. All 157 prior complete assertions remain.

Distinct static review approves the exact twelve-file candidate:
`b05d37e2f9abcad13f80985bffbc7051c556814b7f814ff77727c6860fbcf698`.
Root adopted the three specs and tests before the products on a6f17d08, then ran
270 tests in ten files with zero skips: 35 new/API controls, eight actual
PostgreSQL cases and 227 adjacent controls. All thirteen command sets pass,
including three type checks, zero-warning scoped lint, spec/AST, inventory and
both builds. Check manifest:
`8b738ff1805bd9fa6a5270541891d5b69b7a75c9c030eef3735ee7729b70c298`;
terminal receipt:
`7955c3b1debdbef8cb2eae18cca765c36e80508ee4c283a3bfa2fb26f941549c`.

The real local PostgreSQL replay covers deferred commit failure, state-write
failure, replacement rollback, concurrent duplicate delivery, same-second
ordering, superseded cancellation, connection termination/recovery and
acknowledgement-loss retry. It uses an isolated disposable loopback cluster and
test schemas, not Preview or production. Its log hash is
`f10d217387184a3df0cfdc1af9357caeaf3af00131bf983f5084453ea8fa9330`.
The first sandbox-denied PostgreSQL attempt is retained separately; it executed
no database tests. Author and root actual replays subsequently pass.

Evidence lives under ignored `nov03-hosted-billing-atomicity-source-first`,
`nov03-hosted-subscription-candidate-independent` and
`nov03-root-hosted-subscription-main` evidence directories. Actual signed Preview
delivery on this successor, provider-account identity, credit-pack exactness,
outage/restore rehearsal, global checks and human/release qualification remain
open. A separately discovered missing-config gate is queued as its own
source-first package; this finite transaction fix does not claim to resolve it.
