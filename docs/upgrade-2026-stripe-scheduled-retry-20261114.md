# Actual isolated Stripe automatic retry

Exact `9b6202e7` passed the protected isolated Preview outage successor on
November 14. The original two test actors were reused with two new fictional
customers and no-card sandbox trials. No production or live charge occurred.

The controller verified the exact synthetic database and role, found only two
owned idle client sessions, terminated those sessions and proved zero remaining
connections plus a fresh login rejection. It then created one real Stripe
sandbox subscription-update event. Stripe Workbench recorded these actual
attempts for the same event, with no manual resend:

| UTC time | Observation |
| --- | --- |
| 16:57:20 | Initial delivery returned HTTP 503. |
| 16:57:36 | First automatic retry returned HTTP 503. |
| 16:57:55 | Database login restored and independently verified. |
| 17:57:38 | Automatic retry returned HTTP 200, Delivered and Recovered. |

Root observed the final attempt in Workbench, including its same event ID,
timestamp and “Resent automatically” label. Provider pending-webhook count then
reached zero. The actual scoped database verification found exactly one event
receipt, the other actor unchanged and all five scoped AI-ledger effects zero.
Three separate read-only probes preserve the earlier cancellation rows and
deletion receipts before the rehearsal, after retry and after cancellation.

Both new trials were cancelled, their customers deleted, both cancelled plans
returned signed HTTP 403, and both sessions were signed out and revoked. The
existing webhook URL/status was restored, the temporary Preview and environment
entries removed, and four owned versioned pseudonymous Redis keys deleted.
All cleanup checks pass. The free isolated branch remains for the separately
scoped schema recovery check; branch deletion is not claimed.

The terminal controller exited zero at 18:01:31 UTC and records 97 known
explicit operations, including 60 direct HTTP operations. That is a count of
the recorded client operations, not every internal CLI/protocol request. The
earlier 541-operation GUI run and its pre-outage drain failure remain separate
historical evidence. No failed run has been relabelled.

Independent saved-artifact review passes, without additional external calls.
Root checked all eleven reviewed artifact hashes and the actual event ordering,
single receipt and cleanup. SHA-256 receipts:

| Artifact | SHA-256 |
| --- | --- |
| Controller | `20991d6bdcfb0959483d42735f675d9471611ea17b87c4e678a6ba37e87b3387` |
| Scheduled retry | `b2e23f2d4d443a7d71539f2bde597c565a46e899968508b6b4d9a60e6854a909` |
| Root Workbench observation | `597f4183f9d931f42e88848d7920313c849e382099420da588f9c74396382840` |
| Independent review | `ea21cb7112a99b1c75f553d4b1f57091f8f78cabe337c618c9a774032221ea49` |
| Root terminal review | `3ec8ba0dda3c0be3a1c33bde156177356bee871a4008524fda1e99b914075d50` |

This establishes this bounded staging failure/restoration/automatic-retry path.
It does not establish production availability, general security acceptance,
deployed paid AI accounting or final hosted release readiness. Those gates
remain false. Commits remain local under the production-deployment push hold.
