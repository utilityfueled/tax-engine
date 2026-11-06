# EIC history canonical handoff

This private calculation package connects the independently reviewed actual-history resolver to the canonical EIC calculation. It does not complete the current Form 8862 source method or its review form. The dedicated guided history controls are a separate follow-through in progress; no public filing or year gate changes are made here.

The source contract is `eic.disallowanceSources`. Supplied originals must match the actual household, return year and claim chronology, including on a zero-credit return. An actual active statutory ban produces zero. When an otherwise positive source-confirmed claim or 2026 calculation has no actual history, the calculation reports the missing facts. A positive claim with unresolved recertification requires actual current Form 8862 sources; no completed-form checkbox is accepted. Omitted legacy 2025 history remains explicitly unverified. No-credit returns do not acquire invented empty histories.

Spec-first evidence remains in `/private/tmp/tax-ee0132c-verification-8utd72md`: the original canonical red controls exposed ignored bans, unresolved recertification, missing actual history and stale sources. A separate Form 2555 regression exposed discarded supplied history on its independent zero-credit route. The corrected stable checkpoint passed 134 tests across 10 files, root types and scoped lint. Existing positive source fixtures now include expressly fictional complete empty history records; their assertions and historical omission/zero-income controls remain intact.

Official sources refreshed on October 26, 2026: [IRC 32(k)](https://uscode.house.gov/us/usc/119-124/t26/s32/), [Reg. 1.32-3](https://www.ecfr.gov/current/title-26/section-1.32-3), [Pub. 596, chapter 5](https://www.irs.gov/publications/p596), and [Form 8862 instructions](https://www.irs.gov/instructions/i8862). The final 2025 EIC table and isolated 2026 formula are unchanged. The history resolver derives restrictions from actual records; this package is not a human tax qualification.

Remaining finite scope: actual history controls and saved-source confirmation behavior; source-complete current Form 8862 Parts I/II and its actual-child versus SSN-counted-child route; canonical current-form handoff; original-source review context and review-only form output. Appeals and unresolved chronology retain their named source-method boundaries. These unfinished methods are not external approval blockers.

Independent parent review of freeze `79b75417` reproduced a direct-helper source contradiction: the credit calculation could receive an actual child while a nested history answer asserted no child and cleared a child-only denial. The new spec-first regression reproduced that failure. The correction requires repeated actual-child answers to agree and passes the calculation's actual answer to the history resolver. A retained unknown-history regression then caught the canonical caller's historical count-derived boolean; that call now supplies an actual answer only when its child source packet is complete. Legacy amount/count behavior remains separate. The original freeze and both failed runs are retained; corrected source review is pending.

The corrected `b87d96720406eb961472f3c28123c928e73929c8` freeze passed
552 scoped tests in nine files, root types and scoped lint (zero errors; four
preexisting federal warnings). Parent independently reran the same four private
controls plus seven author cases, 11 tests in two files, with all frozen hashes
unchanged and no additional finding. Evidence is
`.local/upgrade-evidence/parent-eic-canonical-v2-review.json`; the initial
contradiction and failed probe remain recorded separately. Combined integration
with the reviewed actual-history guide preserves later health and education
changes. Current Form 8862 remains unfinished and separately implemented.
