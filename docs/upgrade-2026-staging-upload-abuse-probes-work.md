# Preview upload and shared-auth probes

The original probes below target historical committed source
`377fe75500f2be900176c71bfb2150b3d1a66628` at the authorized isolated Preview.
They do not qualify the newer branch head or a final artifact.

At 23:20 UTC November 3, two synthetic, CRC-valid PNG uploads exercised the
existing multipart API. A 1,048,576-byte file (1,048,859-byte request) returned
200 with matching document identifiers, size and metadata keys. A 5,242,880-byte
file (5,243,163-byte request) returned Vercel's platform 413 payload-size error.
This demonstrates the platform boundary precedes the application's historical
25 MiB allowance; it does not prove a client-readable JSON response.

The authorized owner/workspace tuple was absent before use. Cleanup deleted
only that disposable tuple and verified it absent afterward. Private/no-store
checks passed. No raw response, filename, credential or document content is
published; original-filename matching and forensic blob erasure are not claimed.
The two file hashes and response hashes are retained in ignored evidence
`nov03-staging-upload-limit/receipt.json`.

At 23:38 UTC, two independent platform-access-only clients, without app sessions,
alternated empty JSON POSTs to a nonexistent auth route from the same IP.
The first 20 returned empty 404 responses; requests 21 and 22 both returned
the same generic application 429 body, with Retry-After 416/415 seconds. Every
response was private/no-store. The 23-request cap was respected. No signup,
password, recovery email, account, billing or provider operation occurred.

This shows a shared allowance across these two clients. Physical worker count,
Redis failure behavior and expiration recovery were not observed. No rate-limit
key was reset or removed. The receipt is retained as
`nov03-staging-shared-auth-limit/receipt.json`.

Distinct offline receipt/script review passes with hash
`c9c301bd21045153c2f8bb5c825708760d5f0a659ceb052f209ba87d34e74423`.
It verifies the PNG structure/CRCs, request envelopes, bounded observations and
cleanup logic; it does not independently repeat network requests. The later
application correction and its exact-source Preview successor are recorded below.
Complete hosted outage/recovery and final-artifact qualification remain active.

## November 4 UTC: actual multipart correction on Preview

The deployment API verified READY source
`73f9551779e69cf43ad317dd4d725b36dc99452b`, deployment
`dpl_6HMwthLv7BzVnrofVUzWE2EEx7rZ`. One sign-in to the existing authorized
test account and its fresh session check returned200; the session response was
private/no-store. A temporary23-hour access link remained private during the
requests. An initial link exposed by a diagnostic was revoked and replaced before
use; this did not change the separately authorized Stripe automation token.

Five synthetic CRC-valid PNG requests completed at02:59UTC. The application
limits are its conservative policy, not a claim about Vercel's exact byte cutoff.

| Case | File bytes | Whole request bytes | Actual result |
| --- | ---: | ---: | --- |
| File limit inclusive | 4,194,304 | 4,194,603 | 200, exact metadata |
| File limit plus one | 4,194,305 | 4,194,604 | 413, fixed application JSON |
| Multipart limit inclusive | 4,194,304 | 4,456,448 | 200, exact metadata |
| Multipart limit plus one | 4,194,304 | 4,456,449 | 413, fixed application JSON |
| Platform rejection | 5,242,880 | 5,243,179 | 413, Vercel payload-size response |

Both application rejections returned exactly the intended error object; neither
was attributed to the platform. The platform rejection was separately identified
by its actual payload-size response. All application responses checked here were
private/no-store. Before writing, the exact approved owner/workspace tuple was
absent. A flushed write-ahead intent covered uncertain POST outcomes; no request
was retried. The upload never created a workspace shell. Final scoped deletion,
absent readback and exact unrelated-workspace baseline hashes all passed.

The receipt is retained at ignored
`nov04-staging-73-multipart/receipt.json`, SHA256
`762a430b974367b9097e7e8386de51048caa054f785ffabe522ba3aa40abe95b`.
Prepared-source independent review verified every PNG chunk/CRC, literal envelope
size, account boundary and cleanup path before execution. Its receipt SHA256 is
`3514d6752b94b0105765b2d4aa998efa4513bb6f00e9ae9233a2f0e56e3bcb4a`.
Distinct saved-result review passes with SHA256
`da74ee95e920525b488899305ebc8cfa562f9b1ce65aa1695b1fcc3c8ccf3040`;
it checks the recorded results and unchanged scripts without repeating requests.

These are actual direct multipart API observations. They do not establish browser
uploader wiring, durable blob readback or forensic erasure, exact hosted Node
patch identity, outage/recovery behavior, or final release qualification. The
existing exported multipart client remains separate from local file-selection
wiring. No billing, provider, recovery email or production operation occurred.
