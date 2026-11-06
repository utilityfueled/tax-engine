# Transient calculation for AI explanations

Contract version 1, 2026-10-25. This implements the authorized upgrade scope;
it does not qualify a tax year, model, filing artifact or deployment.

A separate `/api/workspace/tax-explanation` request contains a confirmed complete
`TaxYearInput` and an ordinary redacted workspace-help packet. The user must
explicitly choose this calculation explanation and confirm the entered facts.
Local-only preferences take precedence and send neither request nor facts.
The original `/api/provider/workspace` contract does not accept this envelope.

The private envelope is strict and bounded to the existing 1 MiB JSON limit.
It requires version 1, confirmation, workspace ID/revision and matching tax year.
When a guided-only workspace has no document-derived year, the confirmed input
supplies the private request's year. An existing conflicting document year is
rejected; no workspace year or original facts are overwritten.
Browser cross-origin requests are rejected. A configured `TAX_ENGINE_APP_URL`
is the authoritative origin behind a reverse proxy. Without that configuration,
only the request URL's origin is accepted, except that a self-host loopback
request may use the exact browser Host header with the same protocol and port.
This accommodates Next's internal localhost normalization without trusting
forwarded headers, other local ports or arbitrary hostnames. Hosted production
requires its configured public origin. Hosted requests authenticate and
check the paid entitlement before calculating or creating accounting hooks.
Shared rate limits, cancellation, private no-store responses and generic errors
apply on success and every failure. No private facts are persisted or logged.

The server validates the complete input and recomputes it using the deterministic
engine. A fresh in-process receipt is bound to the authenticated owner (or the
isolated self-host request), workspace/revision, year and current rule version.
A client audit, preview total, claimed owner, model or rule version cannot supply
that authority. Completeness means the user's confirmed entered facts; it is
not independent verification of documents or eligibility.

Only allowlisted audit line values and matching-year excerpts, plus redacted
workflow/question text, reach the AI task adapter. The server re-redacts the
packet using identifiers from the actual input, including employer, payer,
care-provider, beneficiary and other source names, private source references,
tax/account identifiers and addresses. This includes first and last names
when entered separately. The provider and accounting
hooks never receive complete facts. A SHA-256 digest of the validated input and
server-owned scope/rule version joins the accounting idempotency payload, so a
changed private calculation cannot reuse a previous request reservation.
The digest is not a reusable audit token and is not returned to the browser.
The logical request ID is an opaque server hash of authenticated scope and the
original request ID. Redaction and changed facts cannot rename a reservation;
changed facts instead change its payload digest and fail existing reuse checks.
An answer containing a known input identity is rejected before display through
the existing billed-failure path. Arbitrary unknown identities still require the
separate adversarial evaluation and independent privacy review.

No context or response cache is introduced. Opt-out, absent qualification,
unsupported years and missing source excerpts retain their existing fail-closed
behavior. Production configuration stays disabled. The same cancellation and
atomic reservation/settlement hooks apply to provider attempts; this transport
cannot enable evaluation, select profiles, spend without a qualified route or
claim filing readiness. Synthetic tests mock the provider; they are not live
provider or independent human review evidence.
