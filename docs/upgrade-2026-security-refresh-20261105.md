# November 5 security refresh

This is a source/advisory refresh against the retained 16.4.5 dependency lock,
not an image scan or release qualification. No package, test or readiness gate
changes. The lockfile SHA256 remains
`d199e2344fa6cf61402330f216e3f7ccf6bc9b5e7a568670b29a9fe27dc8c23f`.

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
