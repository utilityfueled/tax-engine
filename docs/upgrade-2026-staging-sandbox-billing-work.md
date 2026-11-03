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
