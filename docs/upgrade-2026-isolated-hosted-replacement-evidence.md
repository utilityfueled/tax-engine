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

The separately reviewed V11 continuation then passes complete admission-only
validation without a service connection. Actual execution returns its one
read-only app connection and single combined SQL query, then fails result
validation. The child closes naturally with exit 1 in 2.50 seconds. No raw row
contents or exception were saved, so the exact failed predicate is unknown.
This is neither a SQL-query failure nor a successful durable baseline.

The current journal has 2,127 rows and 1,203 cumulative operations, including
all nine allowed inspection operations; normal operations remain 14. Its SHA256
is `121b4543396e44db6142da141a45304f920f5c7f212a4f84dba259e8db4a35b9`.
Both original HOLDs remain immutable. No mutation, Stripe request or fault
occurs in this continuation. Private natural-close and source records are in
`nov06-hosted-inspect-v11-root-actual`; its eight-member manifest is
`4e22f92afcd650834416dcee8101a9c144e5340f486b2816d5194d6adae4076a`.

A diagnostic that returns only fixed predicate booleans and count classes is
being prepared for separate review and explicit supplemental operations
authority. Exhausted inspection operations will not be reassigned or reset.
Database outage/restoration, automatic Stripe retry, exact durable billing
effects and cleanup remain unexecuted. No hosted security, recovery or release
qualification follows from the successful setup phases.
