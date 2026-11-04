# Actual Preview subscription reconciliation successor

The existing Stripe sandbox destination was pointed to READY deployment
`dpl_JBeGtajVHSpT9Sn29Q9WGpgLqERa`, source
`5996cbda71678c70f16f3c909590163f38b21909`. Only its Preview hostname changed;
the existing private access token and three subscribed event types remained.
This deployment contains the atomic subscription package, before the separate
configuration guard in `29abd291`.

ROOT observed these destination-specific Stripe delivery details on November4 UTC:

- 00:08:59: the previously recorded checkout event manually resent, 200.
- 00:20:19: a new authorized test subscription metadata event, 200.
- 00:22:08: the same new event manually resent, 200 and Delivered/Recovered.
- 00:22:21: the metadata cleanup event, 200.

Each selected response was `{ "acknowledged": true }`. Exact event/subscription
IDs and the source/deployment binding are retained in the ignored receipt;
credentials, raw account rows and webhook access URLs are not published.

The synthetic metadata key was added and removed through the sandbox connector.
No price, quantity, cycle, cancellation, payment method or monetary parameter
was sent. ROOT compared fourteen subscription fields before and after cleanup,
including the original metadata, item price/quantity and period boundaries;
all matched. The returned sandbox item remained USD1900 cents, quantity1, active.
No live charge, production deployment, new access grant or model run occurred.

## Verification and limits

Receipt `b83c1f10b187da9256b6ac2f87d67a1312fdc75a80f072c719b4515a49744eb6` is retained in
`.local/upgrade-evidence/nov04-staging-subscription-5996-receipt.json`.
Distinct read-only consistency/source review
`663b09bbfc65093ba3c0b397de6e47020abe3d3b741fd5c02e4e95bf8a2b1d66`
passes fourteen receipt checks. It did not independently execute network or DB
operations or reperform the provider comparison. A cropped screenshot attempt
showed a loading placeholder; it is not visual delivery evidence.

Identical acknowledged200 responses do not distinguish applied, duplicate or
superseded outcomes. The duplicate path intentionally returns before provider
lookup. A fresh scalar-only SELECT for the exact two authorized test accounts,
two new events and subscription is prepared but NOT RUN: Vercel requires fresh
owner authenticator/passkey verification. Do not infer exact receipt cardinality,
current entitlement, crash atomicity or credit-pack settlement from these200s.
The earlier scoped read-only database proof remains historical and separate.

Final-source auth/isolation/security, failure/outage behavior, shared spending,
credit-pack/provider reconciliation, migrations/backup/restore/rollback and
both distribution artifacts remain required. All filing/model/release gates
remain closed; this is bounded staging evidence.
