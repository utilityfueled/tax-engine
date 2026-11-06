# Local hosted HTTP fault composition

This rehearsal exercises the production Next HTTP server, actual Better Auth
sessions and a new disposable PostgreSQL cluster. It supplements staging;
it does not establish Neon, Upstash, SMTP, Stripe or provider availability.
The execution brief's staging and independent review gates remain required.

Write and review this contract before its runner. No tax formula changes are
included. Existing application gates, timeouts, response bodies and privacy
policies are the objects under test.

## Resource boundary

- Use the existing production bundle and two distinct owned loopback ports.
- Create a private temporary PostgreSQL cluster on another loopback port,
  using an ephemeral certificate with a matching IP SAN. Require verified TLS
  using its explicit CA; never disable certificate or hostname verification.
- Start a loopback-only controlled Redis REST transport. It supplies the
  pinned SDK's documented command/reply boundary and shared synthetic counters;
  this is not an actual Redis server or an independent Lua algorithm test.
  Hold, disconnect and HTTP-error modes exercise the real SDK and application
  timeout/error paths. No deployed service credentials are read.
- Sanitize the child environment. Use synthetic accounts and locally inserted
  active entitlements only; this insertion is not Stripe evidence. No preview
  actor, local draft, injected auth or memory persistence bypass is permitted.
- Preserve the first failed assertion and actual logs. Remove only owned
  processes and temporary cluster files, verify ports close, and retain evidence.

## Required observations

1. Actual unauthenticated workspace HTTP requests return 401 with explicit
   private/no-store policy. Auth session errors remain generic and uncached.
2. Two actual accounts receive distinct owner IDs and sessions. Each can create,
   save, list, reopen and delete its own shell on either server. The other owner
   cannot read or delete that shell. Client identity and query parameters cannot
   substitute for a session. Server rows retain only allowlisted metadata;
   synthetic private names, notes, facts and file references are absent.
3. Both servers use verified TLS to the disposable database. Actual
   `pg_stat_ssl` observation records encryption; a trusted CA is configured,
   without a permissive verification flag.
4. Alternating requests across the two processes consume one shared synthetic
   rate-limit bucket. The existing tier's exact boundary remains in force.
5. Controlled REST disconnect, error and delayed response produce the existing
   generic 503/unavailable policy rather than a memory allowance or a database
   write. Restore transport and demonstrate successful authenticated readback.
   Observe the unchanged two-second SDK timeout with a bounded outer deadline.
6. Stopping the owned PostgreSQL server produces sanitized, private service
   errors on actual auth/workspace HTTP paths. Restart it and prove the exact
   prior owner rows and sessions recover. Database startup failure is distinct
   from an outage after successful initialization.
7. Actual oversized workspace JSON rejects under the unchanged body limit;
   interrupted body delivery does not overwrite the previous shell. Recovery
   without SMTP remains unavailable. These observations do not qualify email,
   browser-only backup recovery, billing or raw-document storage.
8. Actual application logs and response bodies do not contain the supplied
   private markers or credentials. This finite observation is not a general
   privacy proof. Report every failed gate and the exact source/bundle identity.

Implement the runner against this contract, then execute without loosening it.
If a real HTTP defect appears, retain its failing evidence before changing the
smallest relevant product seam and rerun the affected observations.
