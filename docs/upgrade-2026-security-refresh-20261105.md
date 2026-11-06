# November 5 security refresh

Current follow-up: on November 6 at 05:42 UTC, both registry audits again exit
zero, across 539 full and 447 production dependency entries. Ten direct official
requests return HTTP 200: the seven exact Next repository advisory APIs and the
Next release, Next advance and Node advance notices. The current lock remains
`268026058217dd84aee4e9b1c691fa1bac7d3049e6cb68d7fd16ef3af7a76dea`.

The retrieved Next release response recommends 16.4.5 and describes seven
issues, but contains only six literal GHSA identifiers: the shared-shell section
omits `GHSA-vvgp-ww4w-46vf`. The separate API record for that identifier returns
successfully. An expected-seven-identifiers consistency check therefore fails;
18 other finite source/audit checks pass. This does not establish withdrawal,
remediation or a newly changed advisory. All seven API records retain Medium
severity, their affected/patched-field conflicts remain, and the producer's
cache disclosure section still says High. The earlier snapshots below retain
their original observations.

The fresh Node index still lists 26.13.0 as latest in 26.x, and the advance notice
still announces HIGH fixes on or shortly after November 11. No newer patch,
current image scan, deadline extension or risk acceptance is established here.
Accountable human security disposition and current image evidence remain open.
Raw public responses, exact audit results, the failed consistency check and
visible producer extracts are retained in
`.local/upgrade-evidence/nov06-root-security-refresh/`; provider and Node index
receipts are in `nov06-root-public-provider-refresh/`.
The 19-member frozen security manifest SHA256 is
`699f7a59475700005599d39a89aeaf7c21c9d097a02873a52c9fa8f37a1e172b`.

The initial source/advisory refresh below used the 16.4.5 dependency lock with
SHA256 `d199e2344fa6cf61402330f216e3f7ccf6bc9b5e7a568670b29a9fe27dc8c23f`.
It was not an image scan or release qualification and changed no gate. The table
records that initial snapshot; the later recheck and separately reviewed lock
successor are recorded at the end.

| Check | Observed result | Remaining requirement |
| --- | --- | --- |
| Fresh `pnpm audit --json` | Exit 0; zero findings at every severity | Does not resolve conflicting vendor metadata or OS findings |
| Seven Next advisories | Official release still recommends 16.4.5 and lists all seven fixes; repository API bodies unchanged since November 4 | Affected/patched-field and severity conflicts remain unresolved; assigned November 4 19:30 UTC recheck deadline has elapsed and is not extended |
| Eighteen registered High Debian IDs | All matching trixie source rows remain vulnerable; no fixed trixie row supplied | All 80 image IDs remain unaccepted; exact final images, exposure evidence and owner/security disposition still required |
| Node security advance notice | HIGH fixes announced for 26.x/24.x/22.x on or shortly after November 11; latest retrieved 26.x remains 26.13.0 | CVEs and prerequisites undisclosed; investigate the supported patch when available and before qualification |

The [Next release](https://github.com/vercel/next.js/releases/tag/v16.4.5),
[release notice](https://nextjs.org/blog/november-2026-security-release) and
[advance notice](https://nextjs.org/blog/upcoming-nextjs-security-release-november-2026)
remain in conflict with some repository advisory fields. Fresh prerequisite
searches are bounded source observations: no configured remotePatterns,
application use-cache/unstable_cache, cacheComponents opt-in or rootParams use
was found. The older malformed High SSRF advisory's documented remote-image
prerequisite was not found. This does not clear untested proxy/runtime behavior.

The [Node announcement](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases)
is a pending upstream release, without an available newer 26.x patch in this
retrieval. Follow-up owner is Codex upgrade execution, with release-maintainer
security review required, on release availability and before any qualification.
This follow-up grants no risk acceptance or permission to pass another gate.

The [existing image register](upgrade-2026-image-advisories-20261104.json) retains
181 historical matches across 80 IDs, including 61 High matches and zero Critical.
Those are historical artifacts. Only the 18 registered High IDs were refreshed
from primary Debian pages here; no fresh all-80 scan is claimed. Existing
November 7 or before-qualification owner confirmation remains pending. Native
linkage makes glibc/libstdc++ material exposure questions, without demonstrating
or excluding each advisory's call path.

The independent source refresh retains 42 successful direct official GETs and
an earlier unavailable sandbox retrieval. ROOT verifies all 90 frozen members
and reads the full report. No independent human security acceptance occurred.
Private evidence SHA256 bindings:

- Primary refresh manifest: `ffb281c4927bcc19fca792edb77f78ada9b94d2365d1d363fd00b3818541f2cf`.
- Source refresh report: `a323d05313b2d84bd117ff81bacfffaa65afe13fd38e40dea10e4e0db002c955`.
- Fresh package audit: `5a53e55cf00fe12cf2baa62be93e62a01b390225c1294be768cb4472b14a3b2a`.

## Later November 5 metadata recheck

A separate primary-page recheck at 21:40 UTC again found the 16.4.5 release listing
all seven fixes while individual advisory affected/patched fields remained
inconsistent. The retained page extracts support that observation. A separate
bounded unauthenticated API attempt stopped with an observed 404 and saved no
successful API records; it does not establish eight successful API responses.

The 407 application/config files in that bounded literal scan remain byte-identical
at public commit `fe1d1462`. No named feature literal matched. This is neither
exhaustive static analysis nor runtime reachability proof; the configured Sentry
tunnel and external proxy/framing questions remain open. No new image scan or
package audit is claimed by this later observation.

The lock hash above belongs to the earlier refresh. The separately reviewed
dependency commit `1fef5041` now has whole-lock SHA256
`268026058217dd84aee4e9b1c691fa1bac7d3049e6cb68d7fd16ef3af7a76dea`.
[The exact successor ledger](upgrade-2026-node26-lock-successor-work.md) records
that change; it does not clear image or upstream metadata findings.

The November 4 19:30 UTC advisory deadline remains elapsed, without extension or
risk acceptance. Codex owns the engineering investigation; an accountable human
security disposition and current runtime/image evidence remain required before
qualification. The later primary packet manifest is
`41ccbd13a443881b35f051674c9a5fcc0b9d6e9b7da52480a03e76abde70b18a`;
the distinct finite engineering review is
`2e3694b9b64a3356b364348f375f4c3edee8607ec36dadb2f6697148bbdf1d21`.
Neither is independent human security approval.

## Evening refresh at November 6, 00:20 UTC

Fresh production and full registry audits both exit zero, with no findings across
447 and 539 dependency entries respectively. They use the current successor lock
`268026058217dd84aee4e9b1c691fa1bac7d3049e6cb68d7fd16ef3af7a76dea`,
Node 26.13.0 and pnpm 10.34.8. These counts describe the audit response, rather
than unique packages or runtime image findings.

Thirty bounded official public requests retain 27 successful responses. Three
initial npm requests returned 406 because of an Accept-header error; corrected
JSON requests returned 200. The seven exact repository advisory API bodies and
their producer pages were successfully retrieved in this packet. All seven
affected/patched metadata conflicts remain, including producer High versus API
Medium for GHSA-mfr8-8qww-v76h. The earlier unsuccessful API attempt remains
historical evidence; it is not rewritten by these later successful requests.

The [Next release](https://github.com/vercel/next.js/releases/tag/v16.4.5) still
recommends the installed 16.4.5. The [Node distribution index](https://nodejs.org/dist/index.json)
still lists 26.13.0 as the latest 26.x release; the
[November security notice](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases)
still announces HIGH fixes on or shortly after November 11. No newer applicable
patch is established by this retrieval.

All 47 finite checks pass. ROOT rehashes the 54-member evidence packet and reads
its report and actual audit receipts. Manifest SHA256:
`2c91ed07d029f28b7ae5769a2c940e4f720ba2f9d64d66e83e81c4e8ae5215b4`.
Its source baseline is `6a5c8696`; no dependency, lock or security control changes
follow from this refresh. The later application commits have separate checks.

The elapsed November 4 deadline remains elapsed. All 80 historical image IDs
remain open and unaccepted; this packet contains no new image scan. Codex owns
engineering follow-up, while accountable human security disposition and exact
current-image evidence remain required before qualification. The subsequent
6a5c container scan was canceled before a final result, as recorded in the
[container evidence ledger](upgrade-2026-container-job-evidence-work.md).
