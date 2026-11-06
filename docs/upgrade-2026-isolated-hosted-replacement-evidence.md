# Isolated hosted replacement rehearsal

The approved replacement rehearsal uses two synthetic accounts and no-card
Stripe sandbox trials in the isolated protected Preview. Its deployed source is
`fe1d14620f3f93f8ef7111e01a20fdada612bab9`, tree
`dfe96f9fdd28f3fa768c0e180e35d428e7513e3a`. These observations do not qualify
later upgrade commits or production.

The November 6 endpoint continuation closed successfully after four returned
requests and one sandbox endpoint configuration mutation. Two synthetic accounts
and seven-day trials were then created with exactly 11 requests. No payment
method, card or live charge was used. The baseline phase closed successfully
after eight requests, including two subscription metadata updates. Submission
alone does not establish durable delivery or automatic retry.

The following read-only database inspection stopped naturally with exit 1 after
seven attempts. Connection, transaction setup, identity query and final rollback
returned successfully; the owned-subscription query was recorded as unknown or
failed. No database mutation was attempted. The original failed inspection has
no success receipt and will not be reissued or overwritten.

At that stop, the operation journal contains 2,122 rows and 1,201 cumulative
operations, including all failed attempts, against the unchanged 1,793 limit.
Seven of the inspection phase's nine operations are consumed. Neither this
count nor the remaining allowance establishes current webhook effects.

Source inspection found unqualified application table names alongside the
restricted `pg_catalog` search path. A real local PostgreSQL regression confirms
that an unqualified synthetic relation fails with SQLSTATE 42P01 while its
schema-qualified name returns the original row; rollback removes the unique
synthetic schema. Six emitted-source qualification checks fail on the old
helpers. The discarded hosted error prevents identifying its unique cause.
The first local proof had the fixture's database and role reversed and stopped
before connecting; both that HOLD and the corrected actual regression remain
saved. No access rule, credential or privilege changed.

The frozen successor then passes 14 real local checks, including execution of
the actual combined inspector SQL against two synthetic subscription/event
pairs in a unique schema. Only the fixed table namespace is substituted for
that local proof; exact identity, row, read-only and timeout checks execute.
Rollback removes all synthetic objects. This local result authorizes no hosted
effect and is not a substitute for reading the actual staging rows.

Private evidence is retained under `nov06-hosted-endpoint-v10-root-actual`,
`nov06-hosted-create-v10-root-actual`, `nov06-hosted-baseline-v10-root-actual`,
`nov06-hosted-inspect-v10-root-actual` and
`nov06-hosted-schema-root-local-red-v2` / `nov06-hosted-schema-root-local-green`
in `.local/upgrade-evidence/`.
Credentials, access tokens and synthetic session contents are excluded.

A separately reviewed read-only continuation must preserve the old HOLD and fit
the remaining two inspection operations. Database outage/restoration, automatic
Stripe retry, exact durable billing effects and cleanup remain unexecuted at
this observation. No hosted security, recovery or release qualification follows
from the successful setup phases.
