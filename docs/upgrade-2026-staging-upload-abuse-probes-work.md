# Preview upload and shared-auth probes

These actual probes target historical committed source
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
cleanup logic; it does not independently repeat network requests. The app upload
correction, complete hosted outage/recovery and final-source qualification remain
active work.
