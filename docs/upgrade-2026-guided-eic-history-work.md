# Actual EIC denial and allowance history intake

This package collects original IRS and filing records separately for each joint
filer. It preserves unknown histories, explicit empty histories, known dates and
confirmed non-occurrence. Copying household identities supplies no history or
affirmative confirmation. Replacing a filer cannot relabel another person's
records. Actual denials and later allowances are reconciled by the shared source
resolver; the intake accepts no credit, ban or eligibility override.

The current Form 8862 questions and review form remain a separate unfinished
method. A current active ban and unresolved required recertification are distinct.
No year, filing, professional-review or production readiness gate changes here.

## Retained development evidence

Private evidence directory:
`/private/tmp/tax-ee0132c-verification-8utd72md`.

- The source import and full personal-panel action first failed in
  `guided-eic-history-source-red.log` and `guided-eic-history-dom-red.log`.
- The five source/DOM cases passed after implementation. An additional assertion
  demonstrated that an unrelated claimant home edit unnecessarily revoked an
  unchanged IRS history (`guided-eic-history-unrelated-red.log`). The source
  context now compares only the actual identities, history, and any consumed
  separated-spouse child facts. Reconfirmation does not cycle.
- `guided-eic-history-context-green.log` records all five cases passing after that
  correction.
- The first consumer run retained 19 failures among 282 cases: positive actual
  claimant fixtures had no original denial history. Their explicitly fictional
  positive controls now supply complete empty histories. Historical omissions,
  known-zero branches, monetary expectations, original rejection assertions and
  source privacy assertions remain. Changing a copied identity or consumed child
  source requires updating/reconfirming that record explicitly.
- The same 282 tests across 34 files pass in
  `guided-eic-history-consumer-sources-green.log`. This is scoped software evidence,
  not whole-tree coverage or independent tax qualification.

The isolated dependency is the independently reviewed canonical history tree
`b87d96720406eb961472f3c28123c928e73929c8`; its 11 source blobs are kept separate
from this intake's owned paths. Official authorities remain Pub. 596 chapter 5,
Treas. Reg. 1.32-3, and the Instructions for Form 8862, as documented in the
canonical and prerequisite specs. Original sources are not transmitted by the
local editing controls; explicit review/export remains a separate user operation.

Immutable exact checks, independent source review, production desktop/mobile
persistence and visual evidence must be recorded before delivery.

## Frozen source verification and visual follow-up

Tree `ae304b91225eb7d96cee56ac497cfc76b1ea85b8` passed 1,609 tests in
145 files, root and web types, strict spec references, scoped lint with no
errors or warnings, and the production build. All 27 owned and 11 canonical
dependency SHA-256 hashes remained unchanged. Twelve production browser cases
passed with zero retries at desktop and mobile widths; actual empty history,
spouse ban, saved/reloaded unknown history, source privacy and the existing
printed EIC checks all remained explicit. The first sandboxed server attempt
was denied at local socket binding; the scoped local-server rerun used the same
synthetic data and no external providers. Evidence is in
`guided-eic-history-exact-checks.json` and `guided-eic-history-browser.json`.

Parent independent review verified the same 38 hashes and passed 17 tests in
four files, including five private controls for actual-null versus unknown
assessment, stale sources at zero credit, replacement spouse identity, separate
confirmation cycles and nonexistent allowance links. Its evidence is
`.local/upgrade-evidence/parent-guided-eic-history-review.json`.

Visual inspection of all four saved history screenshots found new choices and
actions using class names with no stylesheet definition. The follow-up changes
only this new panel to the existing `guided-input` and small `utility-button`
styles, with a zero-minimum-width choice label. Source values, actions,
confirmation rules and assertions do not change. The original screenshots and
freeze are retained; a fresh production build and browser inspection must
verify this small visual delta before delivery. This is software/source review,
not human tax qualification.

The narrow style freeze `a564bdbb53f029806077c1a5d721680cf373ea0f` passed
the same 1,609 tests in 145 files, all previous static checks and production
build, then all 12 production browser cases with zero retries. All four fresh
history screenshots were visually inspected at 1280 and 390 pixels; the
choices/actions use the existing app styling and remain within their panels.
Parent independently normalized the exact styling substitutions and verified
the remaining component was byte-identical to the reviewed source. The source
and dependency hashes remained unchanged during these checks.

## Final combined integration

The exact combined tree `041d30c82af290ddbb85e4352ac92a7daaafc17a`, rebased
onto committed `15549f834c2bf0aeed02d75215801c1d1944d081`, passed 1,619 tests
in 148 files, root/web types, all 5,375 strict spec references, scoped lint with
zero errors and four preexisting federal warnings, and a fresh production build.
All twelve production browser cases passed again with zero retries on the
rebased source. Both checks verified all 39 owned hashes unchanged; the shared
input, federal and flow diffs retain intervening health and education changes.
Evidence: `eic-history-integration-checks.json` and
`eic-history-integration-browser.json` in the private evidence directory.
Versions 2025.134 and 2026.131-law-integration-draft record this bounded
calculation change; public year, filing and professional-review gates remain
closed. The only subsequent change is this evidence paragraph.
