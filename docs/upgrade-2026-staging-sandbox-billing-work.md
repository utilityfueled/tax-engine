# Actual Preview sandbox billing rehearsal — November 3

The existing Preview deployment `dpl_HfauLa1AFrxqkSVokJmrd7R6YKPj`, source
`80bc752f751ebd642cb039a1c65c7e8e6a603403`, completed an actual Starter
Checkout and received the same Stripe-signed test event twice. This is evidence
for that deployment; the branch has advanced since it was built.

After the owner completed Vercel verification, the Preview-only billing setting
was observed as `test`. The authenticated checkout endpoint returned HTTP200,
test mode and a `cs_test_` session without the self-host bypass. Stripe's sandbox
reported the session complete and paid, `livemode:false`, one existing Starter
price at1900USD cents/month, and a test subscription. The public test-card flow
used synthetic billing details. No real funds moved and payment-method saving
was left unchecked. [Stripe's testing documentation](https://docs.stripe.com/testing?testing-method=card-numbers)
describes the simulated sandbox transaction and public test card.

The existing sandbox webhook delivered `checkout.session.completed` at
21:27:29UTC with HTTP200 and `{"acknowledged":true}`. Manually resending that
same event at21:35:04UTC produced another HTTP200 acknowledgement. The actual
dashboard shows both attempts; the API reports `livemode:false` and zero pending
webhooks. The event uses Stripe API revision `2026-03-25.dahlia`.

Independent authenticated HTTP reads of the application billing page after
checkout and after replay both returned200, Starter active and the AI
qualification-pending disclosure. These reads used the existing isolated test
account and its private session. The browser's separate signed-out session is
not evidence against the authenticated API results.

Evidence is retained under `.local/upgrade-evidence/nov03-staging-signup-api/`:

- `sandbox-billing-rehearsal-redacted.json`, SHA256
  `0eeb20763c93f6b9e5f845895a50896fcfff64266a242ca7335af4c94a20bafc`.
- `starter-test-checkout-redacted.json` records the original checkout creation;
  its no-payment-attempted value describes that earlier point in time.
- `billing-after-sandbox-checkout-redacted.json` records21:30:40UTC and private
  HTML SHA256 `4a1b600085c38aa14ca0508249861d2b8ab2b4010f011db4a7063c5979a88f56`.
- `billing-after-sandbox-replay-redacted.json` records21:36:36UTC and private
  HTML SHA256 `16be8751fa37c41f5ff8e2da7e6cf39575d62ef62ca2fdcfb531595af76cfe5a`.

Private checkout URLs, webhook access tokens, cookies, email and credentials
remain outside Git in private local files. The owner explicitly authorized the
current staging automation token to remain active; no new revocation is pending.

- [x] Actual Preview test checkout and persisted active Starter view.
- [x] Actual signed event and manual replay both acknowledged200.
- [ ] Database event row-count and exact atomic credit reconciliation.
- [ ] Failed-delivery retry/backoff, Redis/provider/DB outages and spending limits.
- [ ] Two-account isolation, persistence/deletion, telemetry and upload limits.
- [ ] Staging migrations, backup restoration and rollback on the final artifact.
- [ ] Repeat relevant checks for the final source revision and complete independent
  security/privacy review.

This manual duplicate replay does not establish database-level exactly-once
effects, credit-purchase settlement, automatic retry backoff or whole hosted
qualification. AI credits remain unavailable while qualification is pending;
there was no live provider spending, model promotion or production deployment.

## November3 scoped read-only database follow-up

Root retained the actual read-only observation at2026-11-03 22:57:45UTC in `.local/upgrade-evidence/nov03-preview-scoped-readonly-actual/receipt.json`, SHA256 `c0b216944d55161177c31e609d62aadb485a55a6c266577603be2f0186ad7916`. The existing Preview-only Neon Query editor remained Read-only checked. Two metadata-only SELECTs verified seven application tables/68 columns plus user/profile12 columns, including text user ID/email; two data SELECTs resolved only the two approved existing test accounts internally and returned counts/booleans only. The rejected broader Data UI remained unopened. The safer Query path used existing scoped authorization and required no additional permission. No mutation, credential transfer or raw private record output is reported.

The exact retained sandbox event has one recorded event row and one matching checkout.session.completed row with non-null processed_at. Its exact subscription belongs to approved actor A, remains Starter active, and still names that event as last_event_id; approved actor B has zero rows for that same subscription. The exact subscription checkout has zero AI-credit-purchase rows and zero credited budget cents within the two approved owners. This is the expected absence of an AI credit grant for a subscription checkout, not proof of an AI credit-pack settlement. The saved billing CSV SHA256 is `f7af461f51ea20cbed55a47476440e3d6cee1067c5d10dc2c242377a7cf9c553`.

The old unchecked combined database event-row/atomic-credit item now separates into: [x] present exact event/subscription state observed; [ ] crash-atomic event/effect reconciliation, credit-pack settlement and spending/provider reconciliation. No new webhook or replay was performed by these SELECTs. Present primary-key counts cannot establish historical exactly-once chronology or crash recovery; subscription persistence and event marking remain separate source operations. The credit-cycle aggregate query07 was not executed because no actual cycle was supplied.

Independent offline review verified the receipt/CSV hashes, scalar labels, per-actor1/1 identity counts, expected1/0 counts and described query scope against the source-bound plan. The UI variant used total-owner/distinct-owner checks rather than the plan's stronger per-actor guards; actual per-actor1/1 results validate this observation only, without authorizing a future safety relaxation. Exact compacted executed SQL text is not retained in this three-file receipt, so the independent review verifies the described variant and its saved results, not every executed SQL byte. The reviewer performed no network/database/Node operation. Remaining failed-delivery retries, outages, final-artifact staging/migration/restore/rollback and independent security/release gates stay open.
