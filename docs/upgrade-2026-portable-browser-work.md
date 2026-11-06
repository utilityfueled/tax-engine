# Portable browser request windows

The browser runner now separates the 574-case suite into eight request windows
while retaining the existing protections and test contracts. Source review and
offline controls pass. The first actual managed run passed 111 cases, then
stopped on a build-identity check; it is a failed, incomplete full-suite run.
A corrected cache classifier has been reviewed. The corrected full managed run now passes 569 cases with five original hosted skips; the
immutable-container run remains open.

`pnpm test:web` keeps its existing entry point and pinned PDF dependency probe.
The delegate collects the installed Playwright suite, checks all 145 file
contracts against the reviewed [request budget](../scripts/browser-request-budgets.json),
and recollects each selected title list before execution. Every selected case
must appear exactly once with its original identity, deadline and expected
status. Unknown cases, changed sources, repeated attempts, new skips, missing
reports and uncertain outcomes fail the run. A known assertion failure remains
a failure while later independent windows execute once.

| Window | Cases | Filled-return request bound |
| --- | ---: | ---: |
| 1 | 111 | 20 |
| 2 | 56 | 20 |
| 3 | 126 | 18 |
| 4 | 88 | 20 |
| 5 | 16 | 20 |
| 6 | 11 | 20 |
| 7 | 134 | 20 |
| 8 | 32 | 2 |

The provider bound is two in the first window and zero thereafter; both analysis
scopes are zero throughout this selection. Existing expected HTTP 400 requests
and helper/reopened-menu actions remain included in the reviewed bounds. Hashes
bind those reviewed bounds to source; hashes do not derive the request counts.

The same production server and existing client-identity rules persist across
windows. The runner waits at least 61 seconds, measured with both wall and
monotonic clocks, after readiness and after the preceding test process closes.
It does not rotate client keys, inject bypass headers, clear counters or limiter
stores, reset the server, raise the 20-per-minute limit, or sleep inside tests.
Separate Playwright processes execute the windows; a single browser process or
login session across all windows is not claimed.

The Playwright configuration's 90-second default is unchanged. The runner
requires two workers and zero retries. The container command still supplies
`--timeout=30000 --trace=retain-on-failure`; its 30-second default, existing
in-test PA 180/240-second overrides and five hosted skips remain unchanged.
Neither browser assertions nor the two existing 60-minute CI job limits were
relaxed.

## Runtime identity and cleanup

Managed mode builds once and starts one owned production Next process. It
rejects an occupied fixed port and implicit environment files, retains the
existing 180-second shared build/readiness allowance, and strips service
credentials from the isolated runtime. Source and immutable compiled-build
hashes are checked at each window boundary. External mode verifies the existing
job-owned container's ID, image, running state and source revision; it performs
no container lifecycle operations. The workflow retains responsibility for that
container's cleanup.

Cleanup sends SIGTERM only to direct processes created by the runner and
observes closure for 30 seconds. It does not force-kill process groups or alter
a daemon. Missing closure fails qualification and requires follow-up; source
review does not establish arbitrary descendant cleanup. A build that does not
close after SIGTERM can remain until the existing outer job cap.

## Preserved failure and corrections

The first actual managed run completed one window: 111 passed, no assertion
failures or skips. It then returned `FAIL: Build drift`, leaving the other 463
cases unrun. Its owned production server closed successfully. All 321 original
build hashes were unchanged; the only additions were 30 scoped Next response
cache files.

The installed Next 16.4.5 implementation explicitly stores response data apart
from compiled route files. The correction admits only response artifacts whose
kind, source-route digest, normalized pathname and extension match this build's
static declarations. The selected closure includes BUILD_ID, root JSON manifests and all server/static
files. Every selected compiled file, manifest and unknown file remains immutable. Runtime response hashes are recorded separately; no cache
is deleted, reset or warmed for this check. Next's
[self-hosting guidance](https://nextjs.org/docs/app/guides/self-hosting) also
describes its filesystem caches.

Independent review then found that the initial classifier followed symlinked
root declaration manifests while omitting them from its immutable hashes.
Three actual-function controls reproduced that gap. The successor selects every
root BUILD_ID/JSON entry by name, requires both declaration manifests, and
checks regular-file identity and hashes before parsing. Symlinked or directory
manifests and unknown JSON nodes now fail. The original failed implementation
and its review remain retained.

The passenger parent integration required a separate source-hash refresh:
1,750 source paths became 1,753, with four existing hashes changed and three
paths added. All seven differences match the reviewed passenger package.
Those synchronous engine/model changes add no request action; every other
budget field, including all 145 file contracts, remains identical. No timing
improvement is inferred from this metadata refresh.

## Evidence and remaining gates

The original portable package passes 33 offline tests and a separate source
review; the independent finite checks include budget translations and saved
collection partitions, not browser executions. Cache successor tests pass
58/58, with 38 additional independent controls. The budget refresh passes 19
offline checks, including actual source-closure validation and the identical
574-case eight-window plan. Saved evidence partitions the original 321 compiled
hashes and 30 response additions correctly. These results do not complete a
full runtime suite.

Private evidence is retained under `.local/upgrade-evidence/`:

- `nov05-portable-browser-rate-window-private` and its independent review.
- `nov05-portable-browser-managed-actual` for the incomplete 111-case run.
- `nov05-portable-browser-cache-sourcefirst`, its independent HOLD, and the
  `-v2` source/review successors.
- `nov05-browser-budget-parent-refresh` for the seven-hash update.

The exact source, logs and manifest references for this draft are captured in
its private provenance packet. The incomplete run is not relabeled.

## Actual complete managed successor

The literal `pnpm test:web --retries=0` command exits 0 in 1,638.250 seconds:
**574 collected cases, 569 passed, five original hosted-only skips, zero failures**.
All eight windows complete once, with two workers and zero retries. Root's
saved-artifact check independently reconciles every case ID, expected status,
reported original timeout and exactly one result. The eight existing PA
in-body 180/240-second overrides are preserved; list-time 90-second metadata does
not replace those original deadlines. Root's first overly strict list-time
comparison fails and is retained as a checker setup error, not a browser failure.

All seven inter-window monotonic and wall gaps exceed 61,000 ms. The first window
also follows the pinned scheduler's unchanged dual-clock wait; the source/build
artifact's original post-readiness mtime and first start are retained as supporting
wall evidence. The exact source closure contains 4,574 paths with zero drift.
All 321 immutable compiled paths remain unchanged in 24 cache observations.
The owned server 82363 closes successfully. No service credentials are passed
by the clean-environment launcher. No rate-limit reset or bypass is used.

The complete actual packet retains 1,226 members / 178,527,591 bytes under
`nov05-portable-browser-managed-actual-v2`, manifest
`5ecb1fe0bedb1e5e203d66e4249723f6d56160559d0940606dfa3779e44bfca7`.
Raw reports, attachments, collection, build/cache/source pins, clocks, exit and
cleanup receipts are preserved. Independent saved-artifact review verifies all
1,226 members, exact union, per-case bounds and source bindings; its six-member
manifest is `90e5537a20b99cacd2d152db9c2a8722e090395ef84d5753c06dc9de9220f5e6`.
A separate direct Python filesystem check after server closure rehashes all 321
compiled files unchanged before any later build; its manifest is
`3df314e68634737af0bc5913fb13a5585e7d26d46f26093763327db90e16cd4c`.
Raw compiled binaries are not archived by these packets. This managed run is separate from an immutable
container run, actual hosted qualification and the earlier failed attempt.

Current immutable-container, remote distribution, hosted recovery, native
artifacts, final 2026 forms, qualified human review and release gates remain open. Filing and model
promotion remain disabled.
