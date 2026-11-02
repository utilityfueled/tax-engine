# Isolated hosted preview database selection

This package changes only hosted Vercel previews. Operator-confirmed metadata names
`TAX_ENGINE_STAGING_DATABASE_DATABASE_URL` as the sensitive Preview-only pooled Neon
connection. No secret value was inspected or recorded. An exact `VERCEL_ENV=preview`
in hosted mode must use that variable. Missing, blank or invalid isolated configuration
blocks auth/database access without falling back to shared `DATABASE_URL`, the unpooled
connection, or other integration aliases. Production and self-host retain their existing
connection contract. TLS, schema setup, runtime cache and pool deadlines remain intact.

Official sources: [Vercel system variables](https://vercel.com/docs/environment-variables/system-environment-variables)
and [node-postgres connections](https://node-postgres.com/features/connecting).
The stricter preview URL admission is this application's isolation policy, requiring
PostgreSQL scheme, explicit host and database; it is not a claim that all libpq
connection forms require those components.

Spec `spec/federal/hosted-preview-database-selection.yaml` and 15 scoped controls were
written before implementation. On exact `aeb2604bb440f868f8efc75d6a2ca9cdda255f32`,
unchanged product produced 10 genuine failures / 5 passes, retained in ignored evidence
`.local/upgrade-evidence/nov02-hosted-preview-db/genuine-red.json`. Non-preview and
self-host preservation controls already passed. No test connected to a database: the
real Pool constructor is inspected while Pool.connect is intercepted before any socket.

Product was written after red, in a private archive reconstruction. Original 15 controls
passed on first green; 158 unchanged security/auth/billing controls also passed (173 tests
in seven files). Root/web/contracts types, spec validation (6845/6845), strict product/test
lint (zero warnings), root build and synthetic hosted-preview webpack build passed.
The homepage remained dynamic and the loopback-only database listener recorded zero
connection attempts. The first sandbox attempt stopped at bind permission before any
Node process; the same explicit synthetic-only build passed after automatic approval.
No main edits or commits were performed. No staging/runtime qualification is inferred.
No readiness gate, privacy control, production configuration, provider/model or filing
promotion changes are included. A local selection test does not prove deployed preview
connectivity, schema permissions, authentication delivery, backup or recovery.

Parent main independently reproduced10 genuine failures/five passes before adopting the exact product. Main89/four and all11 package checks pass: three type checks, spec/inventory generation+check, strictlint0, engine build and explicit-preview webpack build, diff. Separate real auth/billing regression follows in the same evidence directory. Parent reviewed the complete diff, actual auth propagation, strict mode matrix, pool/TLS/deadline preservation and credential-free diagnostics. `.local/upgrade-evidence/nov02-parent-hosted-preview-db-main/` retains original/final full source and hashes. This is source/local synthetic verification; actual hosted migration/auth/email/Redis/Stripe/outage/recovery remain required.

The approved free Neon resource was created after retained provider failures: Available/Free, iad1, Auth/Realtime false; saved connection tax-engine/Preview only/Sensitive. Default connection rejected an existing DATABASE_URL conflict, then the isolated prefix succeeded. Existing shared credentials were neither read nor modified. Browser evidence `nov02-parent-hosted-access-refresh/staging-database-mail-browser.json` retains both earlier failures and successful creation/connection. SMTP credentials and provider access remain separate.

Parent real auth/billing regression:173/seven passes (`nov02-parent-hosted-preview-db-main-regression/checks.json`); cohorts overlap with89/four and must not be added. All original15 selector controls remain exact.
