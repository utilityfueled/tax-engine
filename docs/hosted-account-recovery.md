# Hosted account recovery

Implementation contract, 2026-10-25. Qualification and staging delivery remain
pending. Self-hosted tax preparation does not require an account or SMTP.

The installed Better Auth 1.7.12 implementation owns reset-token generation,
expiration, transactional consumption, password hashing and session revocation.
The application supplies delivery and the request/reset interface. Recovery
must not enable AI, billing, filing or access to another owner's workspace.
Browser-only tax facts and original files still require the separate encrypted
return backup; resetting a password cannot recover them from hosted metadata.

Requirements:

- Recovery is unavailable when hosted SMTP is absent or invalid. Configuration
  is server-only. A valid production sender uses encrypted SMTP with certificate
  verification, authentication, bounded connection/delivery times and no raw
  transport diagnostics. No tax data, display name, password or source document
  appears in mail. Only the account email and reset link are sent.
- Reset links use the configured application origin and a token in the URL
  fragment. The client removes the fragment immediately and holds the token
  only in memory. Tokens never enter local/session storage or rendered text.
- Every reset request receives the same success message for existing and absent
  accounts. Delivery runs under Next's post-response lifetime. Shared IP and
  recipient limits, bounded JSON and generic dependency errors remain in force.
- Token identifiers are hashed in PostgreSQL and expire after 15 minutes.
  A valid reset consumes the token once and
  revokes all prior sessions; invalid passwords do not consume the token. A
  failed reset cannot report success or clear unrelated local tax data.
  Token consumption, password update and session revocation share one database
  transaction. A failed password write leaves the token and old sessions usable
  for a later retry. Concurrent submissions of one token admit one winner.
- The recovery page and auth responses are private/no-store and use no-referrer.
  The client sends the token only in the reset POST body, never a query string.
- Local tests use synthetic recipients and a loopback SMTP sink. They do not
  send mail to a real account or establish staging/provider delivery evidence.

Official sources refreshed October 25:
[Better Auth email/password](https://better-auth.com/docs/authentication/email-password),
including background delivery and session revocation;
[Nodemailer SMTP](https://nodemailer.com/smtp), including TLS, certificate
verification and timeouts. The installed Better Auth password route and
transactional reset implementation were inspected directly before implementation.

SMTP dependency is pinned separately to Nodemailer 10.2.1 and its current
TypeScript declarations 8.0.2. The isolated strict-peer lockfile check passes;
the new 521-entry package audit has zero advisories. Existing dependency
versions, TypeScript, Decimal and pdf-lib remain unchanged.

Local implementation evidence:

- Red-first mail, route and DOM checks cover TLS/configuration rejection,
  bounded transport, private headers, recipient/IP limits, fixed destinations,
  generic errors, fragment removal, strict-mode initialization and cancellation.
  The combined run passes 21 tests in four files, including five actual local
  PostgreSQL and SMTP-sink cases. Adjacent auth, entry, tenant-route isolation
  and shared-limit outage checks pass 116 tests in six files. Web types and
  scoped lint pass without errors or warnings.
- Real PostgreSQL fault injection exposed plaintext token identifiers and
  nontransactional reset writes in the initial configuration. Enabling hashed
  identifiers and database transactions fixes the red regressions. Injecting a
  failed password update now retains the token and prior session, emits no raw
  database diagnostic, and permits a successful retry after the fault clears.
- A separate agent inspected the final exception/transaction mapping and ran
  15 mocked/DOM checks; no actionable finding remained. This is bounded code
  review, not independent human security/privacy qualification.
- Evidence is in `.local/upgrade-evidence/hosted-recovery-integration.log`,
  `hosted-recovery-hash-red.log`, `hosted-recovery-adjacent.log`,
  `hosted-recovery-web-types.log`, `hosted-recovery-lint.log` and
  `ai-auth-recovery-review.log`. Immutable staged and production-browser results
  are recorded below. No actual recipient, staging service or provider is used.

The immutable staged application tree `7d6a57fd2ec9897f1da5fe1b1f3b23f656836e50`
passes all 21 recovery tests with actual disposable PostgreSQL/loopback SMTP and
the production webpack build. Chromium passes two self-host viewport cases and
two hosted viewport cases (1280 and 375 pixels), with retries disabled. Hosted
browser responses are intercepted synthetic auth responses; production HTTP
privacy headers and rendered code are real. Fragment removal, body-only token
transport, keyboard submission, generic rate-limit feedback, retained local tax
data and absence of horizontal overflow are asserted. Both screenshots were
visually inspected. This does not establish an end-to-end hosted deployment.

Initial hosted startup correctly rejected missing shared Redis configuration.
The UI rerun uses an explicitly unavailable loopback Redis URL and no database;
backend authentication remains fail-closed. A broad alert selector then matched
Next's route announcer as well as the application alert. Only that test selector
was narrowed. Final test tree `2605b80246086894ff105dc71be263f874bf364d` differs
from the built application solely in that assertion; its two hosted tests pass
against the identical runtime. Evidence: `hosted-recovery-staged-tests.log`,
`hosted-recovery-staged-build.log`, `hosted-recovery-selfhost-browser.log` and
`hosted-recovery-hosted-browser-final.log` in `.local/upgrade-evidence/`.

Staging still requires an authorized environment and secure SMTP configuration
with an approved sender. The release rehearsal must prove actual delivery,
TLS/certificate behavior, rate limits and outages under that deployment's
database, Redis and post-response lifecycle. Resetting an account is separate
from restoring browser-only returns. Final human review remains required.
