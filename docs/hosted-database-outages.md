# Hosted database outage boundaries

Implementation contract, October 25, 2026. This package is separate from the
account-recovery transport and does not establish staging qualification.

The shared PostgreSQL pool must bound connection establishment and exhausted-pool
waits to five seconds. Each server statement has a ten-second deadline, lock
waits have a three-second deadline, and idle transactions expire after fifteen
seconds. A fifteen-second client query deadline also bounds an established
connection that stops returning packets. The server deadline precedes the client
deadline so an ordinary slow statement is cancelled by PostgreSQL first.

No mutation is automatically retried after a timeout: the server may have
committed before a response was lost. Existing idempotency and reconciliation
rules remain authoritative for billing and password reset. A timed-out
transaction must roll back; a broken pooled connection must be discarded.
An idle-connection error must not crash the process or print connection strings,
SQL, credentials, taxpayer values or driver diagnostics. Emit only a fixed
operational message. Later requests can acquire a new connection.

These limits also apply to runtime schema setup. A migration that cannot finish
within them fails closed and needs a separately controlled migration; this is
not permission to disable runtime limits. Staging must exercise its actual
network, provider, connection pool and schema size before release.

Sources refreshed October 25:
[node-postgres client options](https://node-postgres.com/apis/client),
[pool lifecycle and idle error events](https://node-postgres.com/apis/pool), and
[PostgreSQL 16 statement, lock and idle transaction deadlines](https://www.postgresql.org/docs/16/runtime-config-client.html).
The installed pg 8.23.1 and Kysely 0.29.7 implementations were inspected for
timeout and connection-discard behavior. A client-side pg read timeout does not
cancel an already-sent query. In particular, Kysely releases its client without
passing the query error to the pool. Merely setting `query_timeout` therefore
left a timed-out connection available for reuse, and a transaction could wait
another fifteen seconds for its rollback response. The shared pool now ends
the affected client through pg's public API before it can be returned to the
pool. Normal SQL errors retain their existing handling.

Local validation used a disposable PostgreSQL 16 database and synthetic
loopback TCP faults, with no external database or taxpayer records. The initial
tests reproduced unbounded connection startup, absent server deadlines and an
absent idle-error handler. A separate agent review reproduced the additional
Kysely reuse bug before it was repaired.

All 16 tests across `hosted-database-outages`, `hosted-recovery-postgres` and
`hosted-postgres-workspace` passed in 67.28 seconds after the repair. They cover
silent connection startup, exhausted connection pools, server cancellation and
transaction rollback, packet loss through both pg and Kysely, transactional
packet loss without committed writes, discarded idle connections, fresh
connections after faults, password-reset atomicity and workspace persistence.
The web TypeScript check and scoped lint also passed. The corresponding local
logs are under `.local/upgrade-evidence/hosted-database-outages-*`; this evidence
does not qualify a deployed service. Actual staging network, database-provider,
SMTP, account recovery and outage rehearsal remain release prerequisites.
