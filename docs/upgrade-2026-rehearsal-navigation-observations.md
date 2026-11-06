# Bounded recovery navigation observations

This engineering change adds observations to the existing synthetic recovery
rehearsal. It does not change its actions, waits, requests, assertions, failure
outcome or cleanup. The failed Linux candidate upgrade remains failed. No cause
or qualification is inferred from these offline helper controls.

The old cumulative observer could not associate an error with its dispatch
phase. A fixed phase label is now captured at request start and at error time.
Independent main-document request and frame-commit counters preserve their
observed order. Unknown starts remain unknown. The counters are not CDP loader
identifiers, and ResourceTiming initiator types are categories, not stack traces.

The same four existing goto responses provide status, service-worker membership
and known cache-policy flags. Missing or overlong headers remain unavailable.
No raw header, URL, query, workspace identifier, error text, DOM text, source
code, storage or request body is added to saved observations. The existing
100-error cap remains; retained request metadata is capped at1000, navigation
responses at20. The failed-page snapshot hashes only same-origin public
/_next/static/ paths, bounded to100 records from at most100 scripts,100 links
and100 resource entries. Paths are at most2048 characters; query/fragment
material is discarded. There is no new HTTP or CDP call or cache override.

The original failure evaluation still races the same2-second timer. The race
limits the caller's wait; it does not cancel an already-running browser
promise. The existing final browser cleanup remains unchanged. Native
getEntriesByType first materializes its list, so scan/output caps are not a
hard browser peak-memory bound. The additional snapshot is optional evidence:
inspection errors report fixed unavailable and preserve the original booleans
and failure. These data do not prove HTML/image source equality, cache hits,
network-interface events or a deployment-skew fix.

The existing100-error record projection and its old tests remain unchanged in
meaning; its pre-existing path digests may refer to any classified route. The
new current-document asset list is restricted to public static paths. A text
inverse of every observational runner addition must reproduce the exact prior
runner, including the original30-second return-heading assertion and2-second
failure race. There is no runtime execution authority in this source packet.

Primary references: https://playwright.dev/docs/navigations and
https://nextjs.org/docs/app/guides/self-hosting (read2026-11-06). The separate
retained source diagnosis documents the exact failed image, source merge and
Chromium primary-source mechanism without claiming it occurred in the run.


MAIN admission, November6: spec/tests were saved before runtime adoption. The
exact old helper reproduced four intended missing-observation assertions (eight
deliberately unselected); the successor passes all15 new/old controls. Types3,
all8650 spec lines, regenerated inventory/check and engine build pass. The first
scoped lint found an unqualified TextEncoder browser global; using
globalThis.TextEncoder preserves serialized behavior. Scoped lint then passes
with zero warnings and all15 unchanged controls pass again. Both failed checks
are retained; every child closes naturally without TERM. Distinct7 pure controls
and the full runner inverse pass. No actual recovery rehearsal was run by this
package; current container failure and source-bound distribution gates stay open.
