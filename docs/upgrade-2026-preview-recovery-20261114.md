# November 14 current-source Preview recovery evidence

The protected original-project Preview passed the bounded account-recovery
rehearsal on application source
`9b6202e7b2b309d5adc62ddf7d405ad7067fb8ac`. This refreshes the historical
[b42 recovery evidence](upgrade-2026-hosted-preview-recovery-origin-work.md)
after the later authentication, mail and PostgreSQL changes. It qualifies this
specific recovery path, not the whole hosted release.

## Source and target

- Original Vercel project: `prj_OIUMNxUHuNUIcqL1kJa42wWbiD4b` (`tax-engine`).
- Disposable deployment: `dpl_5MzFZdySfyqfCXjntJvSbUtwPUEu`, explicitly Preview,
  submitted from a separate tracked-only archive of the source above. All 5,762
  Git blobs, executable modes and symlink contents were verified before upload.
- The source's ten static/install/build checks passed before the remote build.
  Root reviewed the frozen controller and receiver; their four offline control
  groups passed, including a real no-echo private PTY transfer of a synthetic
  message larger than 12 KiB. These controls are separate from actual mail proof.
- The existing Preview-only Zoho configuration and `support@vivalatax.com`
  sender were inherited by the deployment. SMTP credentials were never revealed,
  copied locally, printed or changed. The existing authorized test
  account and its mailbox were used; no new account or mailbox was created.
- Generated Preview URLs retained Vercel Authentication. The previously approved
  retained project token was verified against the original project's existing
  token and reused only on the exact new Preview origin. No protection setting
  or access token was created or changed. No production application request or mutation was made.

## Actual delivery, reset and cleanup

The actual mailbox connector returned the new recovery message. The private
receiver verified its sender, recipient and subject, its exact generated Preview
origin and `/account/recover#token=...` fragment, its freshness and token shape.
The connector JSON reached the receiver through private stdin with terminal echo
disabled; no message body, reset link, token or password appeared in tool output
or command arguments.

| Actual control | Result |
| --- | --- |
| Existing account sign-in and authenticated session | 200; expected account |
| Recovery request using the exact Preview callback origin | 200 |
| Delivered recovery link | Exact new Preview origin and fragment verified |
| Reset using the delivered single-use token | 200; private/no-store response |
| Pre-reset authenticated session | 200 with null session after reset |
| Consumed-token replay | 400 |
| Previous password sign-in | 401 |
| New password sign-in | 200; expected account |
| Final sign-out and session check | 200; null session |
| Disposable Preview deletion | Verified absent |
| Project environment metadata before and after | Same variable identities, types and target metadata |

The new password was saved in a private write-ahead intent before reset. After
reset succeeded, the existing private test credential was replaced atomically.
Independent post-run checks confirm that it matches that intent, differs from
the retained prior credential, and remains owned by the local user with mode
0600. Session, cookie, token and intent files are private and ignored.

The controller finished successfully at **2026-11-14 17:24:37 UTC**, exit 0.
It recorded 24 direct Vercel/auth requests, one CLI build-submission execution
and two Gmail connector operations. These are counted explicit operations,
not a claim about the CLI's internal wire-request count. No billing endpoint,
model provider, upload or database-outage operation was invoked by this
recovery rehearsal. The separate isolated Stripe retry rehearsal was unchanged.

## Preserved first attempt and timestamp precision

The first fresh Preview accepted the recovery request and delivered its message,
but no reset occurred. Its Gmail `internal_date` was
`1794676568000` ms, while the local request marker was
`1794676568417` ms: the API's whole-second timestamp preceded the millisecond
marker by 417 ms. The first controller's strict millisecond comparison could
not admit that message. Root interrupted only the owned waiting controller; it
exited 130 after verifying sign-out, Preview removal and unchanged project
metadata. That failure and its receipt are retained.

A distinct reviewed successor used a fresh Preview and a new message. Both its
receiver and parent admit the actual Gmail timestamp only when it is at least
`floor(requestMilliseconds / 1000) * 1000` and no later than the observed current
time. The timestamp is never rewritten. Controls explicitly accept the 999 ms
same-second boundary and reject the preceding second and future timestamps;
exact origin, account, sender, recipient, fragment and token checks remain.

The successful request marker was `1794677038666` ms, and the message's original
Gmail timestamp was `1794677039000` ms. The receipts preserve both values and
label the whole-second freshness admission explicitly. This is timestamp-source
precision handling, not evidence of subsecond delivery latency.

## Durable receipts and limits

Private evidence is under `.local/upgrade-evidence/`:

| Artifact | SHA-256 |
| --- | --- |
| `nov14-original-preview-recovery-prepared/receipt.json` — first attempt, exit 130 | `659e0b8632200ff1c673f9615effb358ae42b1b296ac85f1a7a876ebead38e0e` |
| `nov14-original-preview-recovery-second-precision-prepared/manifest.json` | `b36df0df147ced4cfce6c650b919da97b7014d465a10b110cf0f4e9a7d07fba0` |
| Same directory, `receipt.json` — actual successful rehearsal | `d9cf5aa2a14beec2520c4383332ce213c6eb9fdc72a3ac35cb0079f969ce9aee` |
| Same directory, `mail-receipt.json` — redacted delivery checks | `1021b49b1486c17d2ebe4fb9ad47851a661bde911135d01dda1b1d4f948ad68a` |
| `nov14-recovery-receipt-review/result.json` — independent saved-artifact review | `2da6b9a2642be7b581b953547e8d137f137e5d01ad76e82e21c0e47076d750f4` |

`nov14-recovery-receipt-review/result.json` independently verifies the frozen
manifest and executed snapshot, all ten actual authentication status controls,
private credential/intent consistency, unchanged actual timestamps and verified
session/Preview cleanup. It makes no whole-hosted qualification claim.

This evidence does not replace final integrated source comparison, other hosted
security and outage checks, Stripe's actual scheduled retry, native image
qualification, tax review, final forms or release authorization. No production
deployment, public push, filing activation or model promotion was performed.
