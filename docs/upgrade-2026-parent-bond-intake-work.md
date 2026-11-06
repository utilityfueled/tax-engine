# Guided parent bond preference sources

This intake follows `spec/federal/guided-private-activity-sources.yaml` and the
actual source method in `upgrade-2026-parent-bond-work.md`. It enables no filing
year, final-form qualification or release-readiness gate.

Actual INT9/DIV13 boxes, recipient year/identity, allowance worksheet and explicit
zero deductions survive the guided-to-canonical handoff with Decimal precision.
Editing a source invalidates its prior confirmation. A separately confirmed
deduction cannot survive edits to its amount or source. Positive preferences
require the source worksheet; an explicitly zero preference does not fabricate
a tax year to complete an ordinary investment subsection. The overall return
still requires its actual supported year.

Initial red evidence: `guided-parent-pab-red.log` (missing source controls and
blocked actual positive preference). Focused source, canonical and DOM checks
pass. The broader guided cohort exposed and corrected the zero-preference
subsection issue without changing its fixtures or expected completion count.
`guided-parent-pab-adjacent.log` records 677 passing tests across 53 files on the
working integration; immutable package evidence follows separately.

Immutable tree `fd739f066547b24676eff11d16e577c2fc281a2b` passes 672 guided/DOM
tests across 52 files, root and web types, all 4,060 spec references and the
production build. Scoped lint has zero errors and six test non-null warnings.
The tree includes the core source package and excludes concurrent Marketplace
intake and foreign-tax work.

Both production Chromium cases pass with retries disabled: desktop 1280px and
mobile 390px actual source entry, exact cents after reload, confirmation
invalidation after an edit, local-only source handling and horizontal overflow.
Screenshots `private-activity-source-1280.png` and `private-activity-source-390.png`
were inspected; controls and source labels remain contained at both widths.
The browser evidence hash is
`a107280c3cbf4b05de94e2bc94044a4ee5bcb3c203c5925d1ba0474a914a0ea5`;
the unit evidence hash is
`37478d7df0386aa17ed81f999381a9c137def6456a25d341e221ee3f722fe042`.
Full local log hashes are in `parent-bond-evidence-hashes.json` under
`.local/upgrade-evidence/`. Independent facts-agent review rechecked nine source,
canonical and DOM cases with no actionable finding (`facts-review-guided-pab.log`).

React review uses controlled inputs, existing labeled form controls, a hoisted
worksheet component and pure change handlers. There are no new effects or
network requests in the source form. Premium, market-discount and unimplemented
allocation methods retain their existing source gates. Independent human tax
qualification remains pending.
