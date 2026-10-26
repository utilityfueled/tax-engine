# Actual K-1 charitable source intake

This metadata-free package exposes the source contract committed in `c0dd1eb`.
It adds no tax formula or claimed-deduction override. Source work was developed
privately against that exact commit; unrelated main-tree work was excluded.

Official sources refreshed October 26, 2026:

- [2025 partner K-1 instructions](https://www.irs.gov/instructions/i1065sk1),
  deductions A/E/F, attached charitable information and basis/at-risk ordering.
- [2025 shareholder K-1 instructions](https://www.irs.gov/instructions/i1120ssk),
  separately stated contributions and shareholder basis.
- [Form 6198 instructions](https://www.irs.gov/instructions/i6198), actual
  activity income and simplified at-risk source amounts.

The original K-1, gift identities, actual A/E/F classification, organization
qualification, property FMV/basis/acquisition, every prior basis-use year, and
independent actual Form 6198 sources are retained. Explicit zero, false and
known-empty lists differ from missing answers. Original decimal strings survive
the bridge. `calculateK1CharitableReturnSources` validates only actual sources;
the collector does not invent AGI, charitable contribution base, an allowance,
capacity or an intervening history to call it.

An independent statement is appended once. A statement already in the qualified
loss collector is explicitly linked to its original index and reconciled against
the separate QBI, basis, at-risk, SE and passive histories. The original
all-other-boxes-zero assertion is unchanged. A distinct noncharitable-zero
answer supports a verified charitable attachment. Passive independent statements
must use the linked activity/history route; no absent section 469 history is
treated as known empty. `calculateScheduleE` has only a consumed-taxpayer type
narrowing so this guide can pass the same actual source identity context.

All edits preserve entered records and revoke dependent source confirmations.
Existing unsupported activity boxes, excess distributions, differing AMT,
binding at-risk methods and positive 2026 prior-basis release remain explicit
method boundaries. The core owner is separately implementing excess-distribution
sources. Full-year 2026 and filing qualification remain closed.

Spec-first evidence in the task's private evidence directory:

- `guided-k1-charity-red.log`: two failures reproduced silent omission and a
  missing original Form 6198 amount being accepted before the collector.
- `guided-k1-charity-dom-red.log`: the real deductions component had no source
  controls before the new panel.
- `guided-k1-charity-prior-red.log`: an explicit unknown prior amount could be
  parsed as zero; the actual-source guard now rejects it.
- `guided-k1-charity-source-final.log`: six source/DOM tests pass, including
  the published 150/50/30 source example (130 allowed), the S-corporation
  154 charity/−16 capital control, linked ordinary/charitable basis allocation
  (95,000 AGI, 5,000 charity and separate carries), history/source contradictions,
  exact large cents, unknown/false preservation and edit invalidation.

Frozen `2365f88c` passed 964 tests across 114 files, root and web type checks,
5,179 spec references, lint with zero errors and five existing warnings, and the
production build. Both desktop/mobile browser cases passed with zero retries;
their screenshots were inspected. The sandbox initially blocked Chromium before
test execution; the authorized local run passed without product changes.

The independent federal source review verified all 17 file hashes and passed
nine tests in three files, including three private probes for joint owners,
original Form 6198 unknowns/exact cents and linked source/identity contradictions.
No source finding remained. Evidence is `federal-k1-charity-guide-review.log`;
the private probes are excluded from this package.

A subsequent full-shell check found that a linked charity-bearing K-1 could
block adjustments before the later deductions panel was reachable. The
`guided-k1-charity-reachability-red.log` regression reproduces the missing access
point. The same saved charitable panel is now available beside K-1 adjustments,
with unchanged validation. `guided-k1-charity-reachability-green.log` passes all
seven source/DOM cases, including blocked navigation and dependent confirmation
revocation. New desktop/mobile cases exercise confirmation and advancement of
the one-original linked path. Corrected immutable checks and independent review
are recorded separately before integration.

The corrected source snapshot `0e647e9e` passed 965 tests in 114 files, both
type checks, 5,181 references and its production build. Independent re-review
passed ten cases in three files. Its new browser control exposed a real desktop
overlap: the existing panel's minimum height placed the following charitable
controls under navigation. `guided-k1-charity-linked-diagnostic.log` records the
intercepted pointer events. The two panels now use the existing `panel-stack`
layout; the same normal-click browser assertions and time limits are retained.

Final layout snapshot `46cfd3ab` passed 13 focused and strict-reference tests,
root/web type checks, scoped lint without errors or warnings, and a production
build. All four desktop/mobile persistence and linked-navigation cases passed
with zero retries and normal clicks. All four saved screenshots were inspected;
`guided-k1-charity-layout-verification.json` retains their hashes and check logs.
Independent final review verified all 17 source hashes and passed both actual
DOM cases; the previous ten-case source/reachability review remains applicable.
Evidence: `federal-k1-charity-guide-layout-review.log`. The final package was
rebased privately onto `14f179a` with no intervening change to its owned paths.

Final integration onto `21478d6` preserves all 16 reviewed product/spec/test
hashes. The adjacent source, canonical, guide and DOM cohort plus the newly
separated strict-reference checks passed 475 tests across six files. Root/web
types and all 5,201 spec references passed, with no missing or broken references.
The main-index lease included only the 17 owned paths; central evidence and
protected untracked files were excluded. No rule-pack version changed.

These are software/source checks, not independent human tax or filing
qualification. Public readiness gates are unchanged.
