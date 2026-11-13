# Original AI-credit Checkout issuance

This package starts from `fe7b327906792bce251b9e8105e0c784e7f6bc8b`, which includes the earlier paid-event and fixed-offer controls. It adds original issuance authority before a real Checkout URL can be returned. Existing AI qualification, entitlement, authentication, rate, price, paid-status and test/live gates remain in place. Development preview redirects remain previews. No provider call, account operation, cash refund or release qualification is established by this local work.

## Original terms and fulfillment

An opaque issuance ID identifies a database row holding the authenticated owner, actual Stripe customer, test/live mode, exact positive integer paid USD cents, credited cents and one-hour Checkout expiry. The ID is sent as the Session's namespaced `client_reference_id` and its create-call idempotency key. The Session response must match those original terms. Its real Session ID and credential-free HTTPS URL are checked before the unique Session binding commits and the route returns a URL. Real Stripe Checkout custom domains are accepted; the URL is taken from the Stripe response, never a client-supplied checkout destination. Production cannot use the reduced test-only Checkout adapter to bypass this persistence.

Fulfillment finds the original issuance by retained Session ID even when mutable metadata is removed. A matching immutable reference also recovers an unbound intent after a lost create response or a webhook/response race. The database locks and compares the original terms again inside the transaction that inserts the purchase and receipt. Owner, customer, mode, paid cents, credited cents, currency, subtotal, expiry and contradictory metadata/reference changes fail. Unknown namespaced intents never become legacy purchases. A signed unpaid completion binds the original Session without a grant or receipt; a later paid success can grant it once. A trigger prevents original-term changes and rebinding a retained Session. Event timestamps do not establish Session creation or a rollout boundary.

A commit with an unknown outcome may already have persisted all three effects. The same valid signed event safely reconciles that outcome. A separate client Checkout POST creates a fresh issuance, and may create another Session. A contradictory signed snapshot keeps returning 503 without granting credits. Editing the underlying Session does not change that snapshot on resend. A paid conflict needs original Stripe records and separately reviewed settlement or refund authority before any repair. Keep credit sales gated.

## Rollout, rollback and legacy URLs

Deploy compatible fulfillment before enabling issuance-aware Checkout. Old instances draining during rollout may still mint unmarked legacy Sessions. Those Sessions retain their original signed terms, including their historical credit offer, and existing purchased rows remain replayable. Table creation is not a time cutover.

New Session metadata uses `ai-credit-issuance-v1` and carries no legacy owner/credit grant authority. This prevents routine old-consumer fulfillment, but an old webhook does not understand the immutable reference or the new table. It is therefore **not a safe rollback target for outstanding new Sessions**, including if mutable metadata has been rewritten. Keep compatible fulfillment when rolling back other application features. If it cannot be retained, pause new Checkout, preserve incoming deliveries and reconcile/replay them with compatible code before resuming fulfillment. Do not route new deliveries to an old consumer that can acknowledge them without the new checks. The additive schema and retained issuance/purchase rows must survive rollback and restore. These are deployment requirements, not evidence that a remote rollout or rollback occurred.

## Retention, privacy and recovery

Cleanup deletes at most 100 unbound intents per call, only after Checkout expiry plus 32 days, with row locks and `SKIP LOCKED`. A concurrently locked binding is skipped. Bound Sessions are retained, including expired Sessions awaiting delayed payment. A pruned unknown reference still fails closed. The 32-day abandoned-intent policy exceeds Stripe's documented ordinary retry and manual-resend windows; it is not a guarantee against later charges or evidence authorizing release of an unrelated reserve. Issuance rows contain references and original credit terms, not card numbers, Checkout URLs, raw Stripe payloads, prompts or tax documents. The factual Privacy storage list names these records.

The actual recovery script now backs up and restores all ten hosted application tables, including bound and pending issuance rows and the immutable trigger. It verifies idempotent paid replay after restore. A second actual synthetic `pg_dump` archive in the old nine-table layout is restored, then the additive issuance migration is applied twice; every old row is unchanged and the new table is empty. The full ten-table archive is restored again. This covers the local application-table archive; it does not establish remote recovery of auth-provider records, object stores or Stripe.

Source inspection found no implemented account-deletion job or enabled hard/soft account-delete path to extend. Account deletion is an operator request in the existing UI; neither automated hard deletion nor soft deletion is claimed. Individual workspace-shell deletion is a separate hard delete. Operators handling account deletion must include `hosted_ai_credit_issuances` in the same account/financial-record policy as existing credit purchases and must consider backups and outstanding paid fulfillment. This package adds bounded abandoned-intent cleanup and restore support; it does not invent a financial retention or cash-refund policy.

## Local verification and limits

All checks use the private source archive, pinned Node 26.13.1, pnpm 10.34.8 and a dedicated synthetic loopback PostgreSQL **16.16** cluster. There are no Stripe/provider calls or credential reads.

- Initial outbound controls retained three intended failures for invalid Session identity, HTTP and credential-bearing URLs. The final billing/mode/qualification cohort passes **203 tests / 7 files**.
- Actual PostgreSQL issuance, race, receipt, deferred-failure, connection-loss, cleanup and backup/restore controls pass **16 tests / 3 files**. This includes a failed outbound binding commit, metadata removal, unknown references, old-instance Sessions, existing-purchase replay, expired bound payment, concurrent cleanup and migration of the old table layout.
- The additional database adjacency cohort has **108 passes / 20 failures**. A separate unchanged baseline archive reproduces the exact same 20 failure headers: two subscription test files still expected thrown private errors where the earlier route already returned redacted HTTP 503. Those tests were fixed separately on main in `be6fc326`; this patch does not own or replace them. Real subscription transactions, the existing AI ledger, workspace isolation and TLS controls pass in this cohort.
- The final combined focused cohort passes **219 tests / 10 files**, one worker, with the actual PostgreSQL controls enabled. Root, web and contracts type checks pass. Spec validation has **8,769 references**, zero missing or broken references. Scoped lint passes with zero errors or warnings; an initial control-character-regex lint error and a reader non-null-assertion warning were corrected without changing URL rejection or recovery assertions. The generated inventory preserves all 954 prior rows exactly and adds the single software-spec row (955 total); the initial stale check and the successful regeneration/check are retained. Exact logs and file hashes accompany the private delivery manifest.

Retained setup failures include the first missing PDF-Python preflight, sandbox-denied local database access, a non-hoisted test mock, the old idempotency-argument expectation and the recovery child process initially using the wrong TypeScript alias config. They are separate from the intended regressions and successful final controls. No assertion, default test deadline, global coverage threshold, dependency version or tax rule metadata was weakened. Full native/remote verification and independent source review remain separate from these local results.

Independent engineering review against `c94971cd` passed 219 focused and 49 adjacent controls on disposable PostgreSQL 16.16. It also reproduced two unresolved release behaviors. A contradictory signed paid snapshot stayed at 503 with zero grants or receipts. Test grants were spendable in live mode on the same database and owner, because the inherited balance and debit queries use the owner alone. Separate test/live storage requires enforcement before qualification. The signed Stripe mode guard did reject a test event sent to the live handler. The private review receipt SHA-256 is `1cc710a7b830b1745bbd172525cb0bf9adffc290aeb285b9178a918c8432a338`. No staging or human review follows from these results.

The integrated local main candidate repeated all 219 focused tests on disposable PostgreSQL 16.16 and closed that database normally. Three type checks, scoped lint, 8,782 spec references and the 959-row inventory check passed. The focused transcript SHA-256 is `ef76c2d58e088969685dd72bd31b6117a797b49d7ff5d6118a4670c592752229`.

## Separate test and live AI accounting

The successor stores one immutable test/live marker per PostgreSQL application schema. Use a separate database or application schema for each mode. A budget read does not claim an empty schema. First writes serialize, and the matching mode is verified before the application reads balances, creates or binds a Checkout issuance, grants credits, reserves provider spend or reconciles usage. Existing AI rows without a marker require an operator to establish provenance before migration. The application keeps those rows intact and withholds their balances and spend in both modes. The billing page continues to offer ordinary subscription management when this specific guard blocks AI accounting.

Pause AI sales and provider usage during the migration and drain old writers before admitting a current writer. Earlier releases lack this enforcement and must not run against the same AI data during rollout or rollback. Preserve the marker and original rows in backups. For a legacy database, determine the source mode from independently corroborated deployment and Stripe evidence, account for all outstanding reservations and credits, and have the owner review the proposed migration before running it. When provenance is mixed or unknown, leave it held. Do not use Session ID text or the current deployment setting as proof.

The recovery rehearsal now checks all eleven application tables. It restores and enforces the original mode, confirms a 600-cent balance after restoring the original grants and their idempotent replay, and restores the historical nine-table archive without classifying its retained AI rows. This is a local synthetic database check. Neither an operator migration nor a contradictory signed payment refund has occurred.

Three spec-linked regressions failed before the guard. The final PostgreSQL 16.16 cohort passed 247 tests in 13 files, including both mode directions, an empty nonbinding balance read, concurrent first writes, an exact 1,000-cent hold followed by a one-cent charge, and the archive rehearsal. Scoped lint, three type checks, 8,787 spec references and the 960-row inventory check passed. The retained before and after transcript SHA-256 values are `ac0a38ea2c19ff0cc4eb62cd093bc9c2d9ffb47a0669999d896ea49e3cb41a1f` and `8eb791ad9028ba1709c4ba3cc919dc41911174f01121932d7e38fcae2d26c18b`.

## November 13 receipt identity and recovery

New paid AI-credit receipts retain their Checkout Session ID and product. New
subscription receipts retain their own product. Paid duplicates must match
the stored Session, event type, original creation time, and exact purchase
terms. A previously unclassified receipt can acknowledge a matching already
settled purchase without granting credits, binding an intent or backfilling a
historical association. A receipt already identified as one product cannot
acknowledge the other. The original issuance lock, grant and receipt remain
within the same transaction.

Two original failures on PostgreSQL 16.16 showed that an event could be
acknowledged against a different already settled Session, and that an unbound
historical receipt could acknowledge a changed event type. The retained failed
transcript SHA-256 is `c516ec59517e0680a7654fed421fc733fa3ee2ba14e3872a2ae043cb27cc65d5`.
The corrected cohort passed 252 tests in 12 files on disposable PostgreSQL
16.16. A real 11-table archive retained the new receipt binding. A historical
nine-table archive preserved its original receipt values and left both new
columns unknown. The rehearsal database stopped normally. The passing
transcript SHA-256 is `84c3a17a4a2db7ba31f61225958e491f3bc94d1ddc9f926672271519a51768cc`.
Automatic retry in isolated Preview and repair of contradictory paid Stripe
snapshots still require separate evidence. The receipt binding does not
authorize refunds or enable credit sales.

## Primary API references

- [Create Checkout Session](https://docs.stripe.com/api/checkout/sessions/create): internal `client_reference_id`, expiry and Session creation.
- [Update Checkout Session](https://docs.stripe.com/api/checkout/sessions/update): mutable metadata and the documented update parameters, which do not include `client_reference_id`.
- [Checkout custom domains](https://docs.stripe.com/payments/checkout/custom-domains): genuine Stripe-hosted Checkout may use an operator's custom domain.
- [Webhook delivery](https://docs.stripe.com/webhooks): retry, manual resend and duplicate/out-of-order delivery behavior.

The CLI documentation attempt used `/dev/null` configuration and failed DNS before any account operation; the official web references were read instead. A create-only documented field is the application binding boundary, not a claim that a privileged provider or database operator cannot alter infrastructure.
