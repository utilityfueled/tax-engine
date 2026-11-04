# Current a4ac Preview tenant and ingress observations

All observations below bind deployed application source
`a4ac9f0ea004bfaed3f9713af62a3bf1b56f0d45` on November 4, 2026. Test-only 8487
has the same application products but is not substituted for that deployment
binding. These are separate operations with separate authority and receipts.
There is no combined successful 57-request tenant run.

## Existing-account authentication prerequisite

Fresh independent cookie jars for the two existing approved accounts pass the
bounded auth bootstrap: eight requests, including one sign-in and one exact
identity/session check per account. No signup, reset, billing, provider, workspace
or database operation is part of this bootstrap. Private credentials, actor
values and cookies are not reproduced here.

## Three separate tenant/upload episodes

| Operation | Actual result | Preserved limitation |
| --- | --- | --- |
| V2 two-account tenant/limits rehearsal | **FAIL**, 48 requests:32 GET / 9 POST / 7 DELETE. The source-checked sequence reaches the first multipart upload after owner-scoped save/reopen/edit/list, cross-owner isolation, same-ID composite isolation and all three JSON boundaries. All five owned metadata tuples are absent after cleanup and both complete unrelated baseline response digests are restored. | The first 4 MiB multipart file / request 4,194,697 returns500. The four later multipart cases do not run. No raw error/body/headers were saved, so the 500 origin remains unclassified. |
| Separate single-upload diagnostic | **PASS for this observation only**, eight requests. The same original 4 MiB file and4,194,697-byte multipart body later return 200 with exact source-bound owner/document metadata and private/no-store checks. Its one owned tuple is absent after cleanup and the unrelated baseline is unchanged. | The later 200 does not explain or erase the earlier 500. This is a separately authorized operation on a new reserved tuple, not a successful rerun of the whole tenant sequence. |
| Separate four-case remainder, network-enabled invocation | **PASS for four remaining boundaries only**, 23 requests:15 GET / 4 POST / 4 DELETE. Original bodies/order/status/category expectations remain unchanged; all four owned tuples have fresh-null readbacks and verified cleanup, with the final unrelated baseline exact. | The preceding default-sandbox invocation fails on its first attempted session GET, with no HTTP response and zero write-ahead tuples/writes. Its cleanup result is vacuous. A separately observed DNS failure corroborates an environment explanation but does not establish the redacted request's exact exception. Both invocations remain retained. |

The V2 JSON observations are request 4,194,304→200 with the exact sanitized
shell,4,194,305→the fixed application 413, and 5,242,880→platform 413. The failed
tenant run remains failed despite these three passing categories and cleanup.

The separately completed remainder records:

| Multipart case | File bytes | Whole request bytes | Actual result |
| --- | ---: | ---: | --- |
| File plus one | 4,194,305 | 4,194,698 | 413, exact application limit error |
| Whole request inclusive | 4,194,304 | 4,456,448 | 200, exact owner/document metadata |
| Whole request plus one | 4,194,304 | 4,456,449 | 413, exact application limit error |
| Platform | 5,242,880 | 5,243,273 | 413, recorded FUNCTION_PAYLOAD_TOO_LARGE body/header code |

The remainder's application responses meet private/no-store assertions. The
platform 413 observation records neither cache flag; it is not evidence that
the application cache policy applies to platform-generated responses. All four
uploads leave no workspace shell. Cleanup proves scoped metadata absence and
list equality, not durable blob erasure or unrelated backend invariants.

## Source, controls and retained evidence

V2 preparation passes 14 author fake-transport controls and eight independent
offline methods before live execution. The remainder has a separate 14-method
offline pass, independently replayed with zero real network/private-input
attempts. Its full source/contract review verifies the four original case tuples,
exact body hashes, nine current product pins, 23-request cap, one upload/delete
per owned tuple, write-ahead-before-mutation and reverse owned-only cleanup.
The inherited 35-second deadline bounds synchronous open/read/close, not disk
I/O or total operation duration. A 429, expiry or deadline stops prohibit later
network cleanup; no such stop occurs in the successful remainder.

The independent tenant saved-evidence reader reconciles 683 checks against the
**failed** 48-request run. It does not reread private identities, raw response
values, cookies or headers; strict owner/privacy/header claims are attributed to
the frozen checked execution and safe hashes. The remainder source/offline
review is not an independent live-network execution or raw-value audit.

A distinct saved-result review then passes459 reconciliation checks for the
completed remainder: the four original body hashes and response categories,
15GET/4POST/4DELETE, four verified cleanups and the complete baseline response
hash agree. It hash-checks the filled ROOT configuration and its recorded grant
without reading credentials. This remains a review of saved evidence.

Durable ignored evidence, each retaining its source/config bindings:

- Auth: `.local/upgrade-evidence/nov04-current-preview-auth-bootstrap-sourcefirst-v2/actual-once/receipt.json`.
- Failed tenant: `.local/upgrade-evidence/nov04-current-preview-tenant-limits-sourcefirst-v2/actual-once/{receipt,calls,private-cleanup-intent}.json`; saved reconciliation in `nov04-current-preview-tenant-limits-saved-independent-v2/checks.json`.
- Later single upload: `.local/upgrade-evidence/nov04-current-preview-upload-diagnostic-sourcefirst/actual-once/{receipt,calls,private-cleanup-intent}.json`.
- First remainder failure: `.local/upgrade-evidence/nov04-current-preview-multipart-remainder-sourcefirst/actual-once/{receipt,calls,private-cleanup-intent}.json`.
- Completed remainder: `.local/upgrade-evidence/nov04-current-preview-multipart-remainder-network-enabled/actual-once/{receipt,calls,observations,private-cleanup-intent}.json`; byte-identical derivative/source proof is retained alongside it.
- Distinct remainder source/offline review: `.local/upgrade-evidence/nov04-current-preview-multipart-remainder-independent/independent-review-result.json`.
- Distinct remainder saved-result review: `.local/upgrade-evidence/nov04-current-preview-multipart-remainder-saved-independent/checks.json`, SHA256 `c24880d2544a771708846e1a7dd7ec5f584867caf825811206e8a52653cfb5da`.

These finite observations do not establish a natural outage, physical-worker
distribution, durable blob recovery/erasure, current integrated billing/provider
settlement, independent professional security/tax/AI review, final 2026 forms,
filing activation or release qualification. The first 500 remains open. Isolated
upstream failure/recovery and final-artifact qualification remain separate work.
