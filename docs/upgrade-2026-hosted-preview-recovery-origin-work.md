# Hosted Preview recovery-email origin

This private package addresses a delivery-origin discrepancy reported from an
actual historical Preview exercise: auth selected its validated Preview origin,
while the recovery mail helper read the configured staging application URL
directly. The reported successful reset/session checks do not establish that this
successor is deployed or verified on a current Preview.

The official [Vercel system environment documentation](https://vercel.com/docs/environment-variables/system-environment-variables)
was refreshed November 3, 2026. `VERCEL_ENV` identifies the deployment environment;
`VERCEL_URL` provides the generated hostname without a scheme at build and runtime.
Production URL metadata can still point to production from a Preview. The existing
`resolveHostedAppBaseUrl` already validates this distinction for hosted auth.

The bounded correction will reuse that resolver only in exact hosted Preview,
reject blocked or unconfigured resolution before creating SMTP transport, and then
apply the existing recovery URL/TLS/loopback checks to the selected URL. Other
environments retain the existing direct configured-URL parsing, including silent
rejection of malformed development configuration. No auth,
database, deployment-mode, environment, token, transport, trust-list or production
configuration change is authorized here.

Source-first spec and synthetic existing-API controls precede product changes.
They cover the actual captured message's Preview fragment, stale configured origin,
missing/malformed deployment metadata before SMTP, exact environment selection,
production and explicit loopback/TLS behavior, fixed private errors and no mutation.
All original mail, Preview-origin and auth controls remain unchanged. No SMTP,
provider, actual credential, browser or deployment operation is performed by these
tests. The initial source-first checkpoint and both genuine regression logs remain
retained; completed software checks are recorded below, with actual delivery
qualification still pending.


## Completed private software verification

The unchanged original mail API reproduced 29 failures and 18 passes across the
42 new and five existing mail controls. Root's independently frozen eleven controls
then reproduced ten genuine failures and one pass before the product change. Both
regression logs and original source/control hashes remain preserved.

The product delta only imports the existing Preview predicate/resolver, selects its
validated URL inside exact hosted Preview, rejects blocked/unconfigured selection,
and feeds that URL into the existing recovery parser. All other environments retain
the original direct configured-URL parsing. SMTP options, recipient/token checks,
message text/fragment format, private errors, TLS and loopback rules are unchanged.

All 58 focused controls and 202 disjoint hosted/auth/middleware controls passed
(260 tests / 15 files), along with all three type checks and 7,756 spec references.
The first strict AST pass stopped at the independent YAML's unquoted line identifiers;
that failure remains retained. Root supplied a metadata-only quote correction and
explicit presence narrowing for its test's non-null assertions, preserving all eleven
test names, expected values and assertions. The corrected 58 controls and all 732
strict reference checks passed. Strict lint across the product and both new test
files passed with zero warnings/errors. Engine and webpack builds passed, as did
private generation/check of the 798-entry inventory. That generated inventory is a
separately declared check artifact; root regenerates the integrated main inventory.

No actual SMTP, provider credential, browser, deployment, environment or auth/schema
mutation was performed. The historical external delivery/reset evidence reported by
root predates this private correction. A fresh source-bound Preview message-origin
and reset replay remains necessary to qualify actual delivery behavior. Main
integration, commit and all readiness decisions remain root-owned.


## Main integration and staging distinction

Fresh main on `5ef2b385` reproduced39 genuine failures/19 passes before frozen
helper adoption. All260 tests/15 files and all12 checks passed: types3, spec7756,
AST732, inventory798 generation/check, strict lint zero warnings, both builds.
Root reviewed the full two-hunk product diff.

Actual historical Preview account creation, delivered email, reset, consumed-token
denial, old-session revocation and old/new password checks were observed on
`1a4ec213`; the wrong email origin found there does not qualify corrected source.
Fresh corrected Preview delivery/reset, tenant/billing/outage/human reviews and
final artifact qualification remain open. No recipient, password, session, recovery
token or private access link is published.

Actual source-bound staging verification on b42afbf53ad7e894da4ef9e0987b152c6b669a68 / deployment dpl_8pDxcXUhKGtsQhqoW2dHpiFwodcV now passes. The approved isolated account signs in200; Zoho delivers a support@vivalatax.com recovery message using the exact Preview deployment origin with a fragment token, without the old staging-domain origin. Reset returns200/private-no-store; the pre-reset session is revoked, consumed-token replay400, old-password sign-in401 and new-password sign-in200. Private credentials/tokens remain ignored0600 files; no secret is committed. Receipt `.local/upgrade-evidence/nov03-staging-signup-api/b42-recovery-completed-redacted.json` records the exact source and limits. This bounded remote auth result is distinct from later source identity, full hosted tenant/security/billing/outage qualification and production operation.
