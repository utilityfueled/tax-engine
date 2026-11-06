# Homepage request boundary

The resumed Vercel preview for f4be3b75 compiled and typechecked, then failed
homepage prerender when authentication initialized against a deleted database
branch (SQL28000). The homepage caught the Next request-header rendering signal
and substituted empty headers, allowing database initialization during prerender.

The homepage now awaits actual request headers directly. Rendering errors reach
Next unchanged before authentication starts; actual request headers retain their
identity, and request-time authentication failures still propagate unchanged.
No auth or database initialization code, privacy controls or readiness gates
changed. The older direct component UI test supplies explicit synthetic headers.

Source: [Next headers documentation](https://nextjs.org/docs/app/api-reference/functions/headers),
retrieved November2,2026; actual pinned Next16.4.3 implementation independently
inspected. The request API opts the route into dynamic rendering.

Verification: spec and three controls preceded the product change. The first
private test targeted an unresolved bare Next module; those diagnostic failures
are retained and excluded from proof. Retargeting the actual web-installed
module, with the product restored, gives one genuine failure/two passes. Fresh
main repeats that result before the edit, then eight tests/two files, all three
typechecks, spec validation, strict scoped lint and diff checks pass. Main
evidence: `.local/upgrade-evidence/nov02-parent-homepage-main-*/`.

Independent agent review adds five controls, including the actual pinned Next
rendering interruption, deferred request headers, empty actual headers and
request-time database errors:13tests/threefiles, root/web types and strict lint
pass. An isolated full hosted production build passes in45.8seconds; `/` is
dynamic and a local synthetic PostgreSQL monitor records zero connections.
Synthetic Redis configuration preserves the hosted shared-rate-limit requirement.
No actual environment credentials were used. The first sandbox-denied local
listener attempt was retained; the exact approved retry passed. Independent
receipt SHA256 `eb257247311dd91f3e82b6c85c1e60ca79fad348621cc38a361f17fa78f112e6`
in `nov02-homepage-request-boundary-independent/independent-review-result.json`.

This fixes build-time request handling. A valid Preview database, SMTP and actual
hosted auth/security/recovery/Stripe tests remain required. The free Redis cache
is connected to Preview only but has no runtime qualification yet. No production
deployment or release readiness is claimed.


Follow-up to pushed `dcede825`: remote Spec Validate exposed a stale generated
coverage inventory. An isolated archive of that exact committed head regenerates
one unsupported hosting-contract row, with no changed support/readiness flags.
Generation and inventory check pass; the actual inventory control file passes.
An initial guessed test path found no tests and was retained as a diagnostic,
then corrected to `tests/spec/coverage-inventory.test.ts`. No runtime/product
change. Evidence `nov02-homepage-inventory-followup/` and
`nov02-homepage-inventory-real-controls/`; the separate PA work stays uncommitted.
