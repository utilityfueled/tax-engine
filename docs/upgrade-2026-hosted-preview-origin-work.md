# Exact hosted preview origin

The actual11b6 Vercel Preview accepted a synthetic nonexistent-account sign-in
request but returned `Invalid origin`. No account was created and no email was
sent. The configured pre-production app URL is shared across deployments;
reading its value required a new Vercel verification, which was not completed.
No configuration value or credential was copied. The code path used that shared
app URL as auth/CORS canonical origin instead of the generated deployment URL.

Exact hosted `VERCEL_ENV=preview` now selects HTTPS plus its server-owned
`VERCEL_URL`, validated as a bare DNS hostname under `.vercel.app`. Missing or
malformed metadata blocks auth and supplies no fallback production origin.
Request Host/Forwarded/Origin headers never determine trust. Only the exact
selected deployment origin is added; existing explicitly configured additional
trusted origins retain their separate operator policy. Other Vercel environments
and self-host app URL selection retain their existing contract. Custom preview
domains/branch aliases require explicit qualification; no wildcard is added.

Official authority refreshed November2:
[Vercel system variables](https://vercel.com/docs/environment-variables/system-environment-variables).
`VERCEL_URL` is generated deployment metadata without a scheme, available at
build and runtime. The installed Better Auth origin middleware was also inspected
directly. The external Better Auth documentation reader failed and is not
substituted for a successful source fetch.

Spec and27 controls preceded product edits:22 genuine failures/five passes.
The original isolated-database15 controls then exposed one auth-positive failure
because the fixture lacked deployment metadata. Its complete original is retained.
The fixture now supplies an explicit fictional generated hostname. The missing
Preview-origin negative targets that metadata; the original missing app URL
negative remains asserted in Production. Database/TLS/secret/connection/privacy
assertions remain unchanged.

Distinct independent17 controls retained before runtime exposed three additional
real failures: development-mode hosted Previews preferred local drafts, enabled
loopback API/resume access, and accepted a localhost browser origin through real
middleware. A shared exact Preview predicate now closes those local-development
exceptions for hosted Previews, including when `NODE_ENV=development`. Normal
non-Preview local development remains covered. No CSRF/CORS check was disabled.

Final main132/seven and all11 checks pass: types3, spec6879, inventory generation
and check, strict lint0, both builds and diff. Independent59/three (overlapping
cohorts, not additive) plus root types/strict lint pass. Exact two-product review
receipt SHA256 `707af4852b3a3029c6bdbb635967d4af6fecf8fd3ebc24b8c32554bc86e95e9e`
and full source/archive are retained. All original27 and independent17 controls
are byte-identical after repair. Ignored evidence directories:
`nov02-parent-hosted-preview-origin{,-red,-green,-final-green,-loopback-green}`
and `nov02-hosted-preview-origin-independent*` preserve all failures and checks.

This establishes source/local synthetic behavior only. The pushed Preview must
still pass actual auth/session persistence, tenant isolation, rate limits, SMTP
delivery/recovery, Stripe test-webhook accounting, outages, migration and recovery
rehearsals. A READY deployment or anonymous session response does not satisfy
those criteria. Production settings, credentials, deployment and readiness were
not changed. The user is completing the SMTP password save; provider project
access and independent human reviews remain separate open gates.

## Actual Preview origin regression check

The pushed `dbd325ed` deployment `dpl_GB5jFcdwVV16536oTbaDrGBnkJvG` became READY at the exact generated deployment URL. In the existing signed-in browser, a nonexistent synthetic `.invalid` account now returns **Invalid email or password**; the prior deployment returned **Invalid origin** for that same bounded sign-in probe. No account was created, secret read, temporary share link generated or production configuration changed. This proves the observed origin failure is cleared; it does not establish account/session/database persistence or any other staging criterion. Exact nonsecret receipt is retained under `nov02-parent-hosted-preview-origin/actual-browser-origin-probe.json`.

A fresh metadata-only search still reports no `TAX_ENGINE_AUTH_SMTP_PASSWORD`; the user said they completed Zoho and are saving the password directly in Vercel. No value was revealed or copied. SMTP delivery/recovery tests remain pending that save and a deployment including it.
