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
lookup. At this delivery checkpoint, the fresh scalar-only SELECT was prepared but
unrun pending owner authenticator/passkey verification. The November4 follow-up
below records its later actual execution. The acknowledged200s alone did not
establish receipt cardinality, current entitlement, crash atomicity or
credit-pack settlement; the earlier November3 database observation stays separate.

Final-source auth/isolation/security, failure/outage behavior, shared spending,
credit-pack/provider reconciliation, migrations/backup/restore/rollback and
both distribution artifacts remain required. All filing/model/release gates
remain closed; this is bounded staging evidence.

## November4 actual scoped read-only database follow-up

After the owner completed verification, ROOT ran two retained single-statement SELECTs in the existing Preview Neon Query editor with Read-only checked. Both internally resolve only the two authorized test accounts, require exactly one identity per actor and two distinct owners, and return scalar counts/sums only. No broad Data Editor, database write, credential transfer or raw private row output was used. Exact executed SQL, observed DOM and the full copied credit-result CSV are retained privately.

The first actual result was scope_valid=true, fresh_event_receipts=1, cleanup_event_receipts=1, exact_current_provider_state_rows=1 and wrong_owner_subscription_rows=0. The matched subscription row names the expected Starter/active plan state, cleanup last-event ID, exact period endpoint and false cancellation flag. This verifies the named retained state after the fresh event, duplicate and cleanup deliveries; it does not establish historical exactly-once chronology or crash recovery. The event receipt lookup is exact-event scoped; receipts themselves have no owner column.

For each approved actor, the second result contains zero credit-purchase rows/credited budget cents, legacy usage rows/included and purchased charges, reservation rows/net charges, and provider-attempt rows/provider cost. All nine values are exact SQL integer or NUMERIC aggregates, copied without truncating virtualized columns. Subscription events granted no AI credits in these observed accounts. This is not proof of included plan allowance, credit-pack settlement, live provider usage reconciliation or general spend protection.

Actual receipt: `.local/upgrade-evidence/nov04-preview-subscription-5996-readonly/receipt.json`, SHA256 `dc90e6961e26ea4243d179825113433445ef4cf421e3f01ff459e7137b419c2c`. Independent offline consistency/source review SHA256 `343f875d257f4559c16e030411780be70705b967fbc47bec3d98fcfe756fa8e5` verifies all five saved hashes, exact SQL scope/presentation-normalized DOM, scalar labels, full two-row CSV and current schema meanings. The reviewer did not query the database, replay events or independently fetch provider state.

The database MFA step is resolved for this observation. Automatic failed-delivery retry/backoff, actual outage recovery, crash-atomic and credit-pack/provider settlement, migrations/restoration, final artifact staging and independent security/privacy/human qualification remain open. No release, model or filing promotion follows.

### November 4: distinguish implemented atomicity from deployed failure evidence

The subscription transaction package already implements crash/rollback handling;
eight actual local PostgreSQL cases pass, including deferred commit failure,
connection termination/recovery and acknowledgement-loss retry. See the
[atomicity ledger](upgrade-2026-hosted-subscription-atomicity-work.md). The open
items above concern actual deployed failure/recovery qualification and broader
credit-pack/provider settlement. They do not describe missing subscription
transaction implementation. No staging failure injection is claimed here.
