# Isolated hosted outage rehearsal: provisioning and remaining gates

November 4, 2026. Application source remains `8487fb4b6d8818d83739fb902fc0730e19698053`;
these observations do not qualify a deployed artifact. Production is untouched.

The owner approved a separate Preview-only project, empty Neon branch/database,
dedicated Redis resource, and separate Stripe Sandbox. The later Redis approval
permits at most $1 actual spending and a brief disconnected setup window.

| Component | Actual result | Next gate |
| --- | --- | --- |
| Vercel | Separate `tax-engine-outage-8487` project created; Preview-only deployment/billing/rate-prefix settings and four auth/Stripe bindings saved. CLI sign-in expressly approved. No deployment yet. | App database/role, Redis, webhook/origin configuration, exact-source build and runtime checks. |
| Neon | Separate free project and schema-only `qa-outage-8487` branch created; integration connected to Preview only. Read-only direct connection proves empty application catalogs, absent target role/database, TLS1.3 with certificate/hostname verification, and SCRAM-SHA-256-PLUS with validated server proof. | Strict bootstrap refuses provider-maintenance PUBLIC CONNECT. No app role/database, migrations or permission mutations performed. |
| Stripe | New isolated sandbox identity verified. Two synthetic Starter/Plus products and monthly test prices created; four catalog POSTs in twelve total requests. Key remains private and Preview-only. | No customer, trial, webhook or charge endpoints invoked by this bootstrap. Automatic failed delivery/retry and exact reconciliation remain untested. |
| Redis | Disconnected cache created; no app connection, data or test commands. Budget form rejects $1 with minimum $20. Unused cache permanently deleted after the owner's explicit deletion approval; installed-products readback confirms absence. | Pending owner decision: permit $20 automatic cutoff while retaining $1 actual spend, or keep Redis rehearsal blocked. No replacement created and no $20 budget saved. |

## Retained database failures and current permission boundary

The initial bootstrap stopped before a database result. V2 failed verified admin
connection: a separate credential-free TLS handshake reproduced
`UNABLE_TO_GET_ISSUER_CERT_LOCALLY` with five system roots. V3 explicitly combines
Node's bundled public roots and system roots, preserving certificate/hostname
verification and required channel binding; the pooled connection then failed
with SQLSTATE `08P01`. Its exact provider message was not retained.

V4 uses the same branch's documented direct endpoint for administrative work,
keeping the pooled application endpoint separate. Its read-only identity passes.
The [Node trust documentation](https://nodejs.org/learn/http/enterprise-network-configuration)
and [Neon connection guidance](https://neon.com/docs/connect/connection-errors)
support these transport choices; successful direct administration does not qualify
the future pooled application connection or provider internal hop.

The immutable bootstrap requires the new app role to connect only to its own
non-template database. Actual catalog results show `postgres` is owned by
`cloud_admin` and grants CONNECT to PUBLIC. A separate read-only privilege query
proves `neondb_owner` cannot grant/revoke that database's CONNECT privilege and is
not a `cloud_admin` member. Role-specific REVOKE cannot negate PUBLIC access.
The helper stops before password generation or DDL. Its exclusivity assertion
has not been relaxed. Resolving this requires a provider-supported permission
boundary or an explicitly reviewed alternative; ordinary database credentials
alone cannot satisfy this exact gate. Template and provider-hop boundaries also
remain unqualified.

## Durable receipts

Private raw evidence stays ignored with credentials omitted from public records.
SHA256 bindings:

- V2 failed identity: `23b0dfc72371cf8046b403ad87bc2aa801cdd36ae78f857ac8335500ca319636`.
- V3 failed identity: `1bc41bafa6da979da8d85477137d7f0d39ae53216db1d796342638e66e123f50`.
- V4 read-only identity: `ff95bb76f337d9e5a3bd4aa5212dba7a05c253a2b64543ca6ec9c0351a9e2b51`.
- Read-only maintenance privilege diagnostic: `01858f4f25e18e5f956859f5a1c223d4caacb10f195dddd45e412bb4edbb09fe`.
- Four Preview bindings receipt: `ed5330ffdf4a5440ff8ca459df32fc7eadbc87f6d9a44df399a10dbfca5a4180`.
- New Stripe identity: `04d5f81ef337c908fc58159891994dc67e6bc055b6c8bbe7ecabd40b6a6be099`.
- New Stripe catalog: `dd2470cb4efa098cbac3301e4b2e1f9c42dc2720e3509b8a235b3e41a3cb386b`.

V2 distinct source/fake review passes31 controls. V3/V4 each pass21 inherited
bootstrap controls; their actual results above remain separately attributed.
Native controller/archive preparation continues independently. No hosted outage,
automatic Stripe retry, security review, AI qualification or release completion
is claimed.
