# Remaining 2026 upgrade execution checklist

This is the durable working checklist for the execution brief. The historical
progress log and checkpoint are evidence for their recorded commits, not current
qualification. Resume here after compaction. Do not remove release gates to
complete a checkbox.

## Current integration — 2026-10-31 UTC

Every internal package queued on October 28 is delivered. What remains needs people, accounts or authorization that this work cannot supply.

Delivered and pushed: Form 8962 field batching `0ad4c804`, signed current-year minimum tax credit `8c38d963`, partial personal cancellation with the zero-pool proof `ba1cbaf8`, review corrections `d06f2e44` and `7e668c86`, dependency fixes `ad8fd777`, and the browser budget change `96a1a47a`. Rule versions are `2025.196` and `2026.194-law-integration-draft`.

- **Tests.** The three unit failures open since October 28 are fixed. Remote `12faedf5` passes 19,880 tests in 1,500 files under coverage: 91.74% statements, 86.97% branches, 90.22% functions and 94.49% lines, and every unchanged threshold passes. Its unit job hit the 30-minute job cap with no failing test, so that cap is now 60 minutes, as the coverage job's already was. Functions clear their gate by only 0.22 points, and a local run without Postgres reports 89.91% and fails it. See the [CI record](upgrade-2026-ci-ad8fd777.json).
- **Coverage timeouts.** These are a test-budget problem under instrumentation. `036eef86` had eighteen timeouts, `a17f8237` had eight, and the runs between them had none. All eight took 5.0–6.1s, in a coverage run that took 2,480 seconds, while the normal job passed the same 19,880 tests at its 5s limit. Coverage runs now get a 15s per-test deadline and the normal job keeps 5s. A six-second probe fails normally and passes under coverage. This replaces the earlier rule of keeping 5s under coverage. No test, assertion or threshold changed. The Form 8962 change removed one measured cost, but no complete cause of the slowdown is proven.
- **Browser.** Self-host passes 530 with five hosted-only skips. The container job failed two 390px tests in two of three runs by exhausting its 30-second budget. Those two tests now use the 90-second repository default, and `a17f8237` passes 530 in both suites. This is a changed test deadline, not a code fix, and no assertion changed.
- **Advisories.** The October 31 audit found two moderate advisories, both fixed; [details](upgrade-2026-dependency-advisories-20261031.md). The production and full audits are clean.
- **Runtime.** The [native arm64](upgrade-2026-runtime-7e668c86-arm64.json) and [native amd64](upgrade-2026-runtime-12faedf5.json) records each pass smoke and all six recovery phases, with a 2,930-component SBOM on arm64. The two records come from the same runtime source. Its scan matches the register exactly: 157 matches, 67 OS advisories, none critical, no npm matches and no fixed versions available. Owners have not accepted these, and the review date is November 7.
- **Review.** An independent agent derived the amounts by hand and found no wrong tax amount. It found one gate gap and four lesser items, all corrected. See the [package ledger](upgrade-2026-partial-personal-cod-work.md). This is agent review, not human qualification.

The same evidence does not show that the 2026 return is complete. Tax year 2026 stays `incomplete`, the final Tax Table and forms are unpublished, and filing and model promotion stay disabled. Rejected special methods and the six questions in [external actions](upgrade-2026-external-actions.md) remain unsupported by design.

## Integration — 2026-10-28 UTC

Foreign-carry integration is delivered in `92870a8a`. Separate regular and
AMT originals now support the admitted foreign-carry cases with complete empty
NOL histories. Export verification binds the complete federal result before any
file writes, while retaining the independently checked state attachment behavior.
The [work ledger](upgrade-2026-cod-empty-nol-foreign-work.md) preserves the two
earlier rejected candidates and their unchanged independent regression controls.

Main passes **250 tests in 48 files**, all three type checks, **6,241 spec
references**, inventory freshness (**589 entries and 166 associations**), scoped
lint (**zero errors, 30 warnings**), engine build and production webpack build.
Rule versions are `2025.194` / `2026.192-law-integration-draft`. Main production
browser checks pass **2/2**, with one worker and zero retries. Both actual saved
guide originals and all 46 downloaded pages match the independently reviewed
originals and PDFs in text and pixels. Four new desktop/mobile captures were
inspected; these seeded partial interviews do not establish a complete journey.

Parent frozen-source review passes **28 tests in six files**, including nine
unchanged private controls, and **11,099 original/output/hash checks** across
seven originals and 91 PDFs / 308 pages / 337 populated fields. Six rendered
canonical pages match the actual inspected prior-version pages. The independent
reviewer's five unchanged cases pass, including rejection before writes and the
existing Pennsylvania attachment control. This is agent review, not human tax
qualification, final-form qualification or staging evidence.

Remaining internal work is active:

- Review and integrate current-year signed minimum-tax-credit sources. The
  candidate is composed onto `92870a8a`; current credit use stays separate from
  the beginning-next-year signed aggregate. Independent originals are retained.
- Complete ordinary partial-insolvency cancellation using actual personal debt
  and nondeductible-interest records. Preserve the three incomplete legacy inputs
  as rejection controls and retain their original monetary assertions in separate
  complete-source cases. Use the full discharge for post-event liabilities.
- Resolve the actual CI failures and finish bounded timeout diagnosis, then run
  all unchanged unit, coverage, static, build and browser gates on the final code.
- Rehearse final native arm64/amd64 images, SBOM/scans and full recovery after
  those source packages. Historical artifacts cannot qualify later changes.

The completed [036eef86 CI record](upgrade-2026-ci-036eef86.json) is historical:
unit tests report **19,808 passes and three failures**; coverage reports **19,790
passes and 21 failures**, comprising the same three source failures and eighteen
explicit five-second timeouts. No coverage report was produced, so no percentage
or threshold pass is claimed. Both browser suites pass **526 cases with five
hosted-only skips each**. The [amd64 runtime record](upgrade-2026-runtime-036eef86.json)
passes six recovery phases and retains **157 scan matches / 67 OS advisories**,
all still awaiting owner acceptance with the November 7 review date. Neither the
skips nor the successful critical-severity scan gate satisfy those open gates.

Earlier basis admission `69b86517`, ordinary-gift activity separation `bf1e2f1b`,
test-only independent PDF-reader batching `fa7a4497`, and ordinary COD attributes
`23187df3` remain delivered. Original assertions, deadlines, coverage thresholds,
privacy controls and readiness gates remain unchanged.

The October 28 official-source/provider/package refresh remains recorded.
Provider account access, approved live spend and model evaluation are unverified.
Human tax/AI/security reviews, launch-state demand and final-form qualification,
staging access/evidence and advisory-owner acceptance remain external gates.
No production deployment, filing or model promotion is authorized by these checks.

### Earlier delivery evidence

The following entries describe their recorded commits; they do not supersede
the active queue or qualify the current source for release.

The earlier completed [remote CI record](upgrade-2026-ci-76d93bb6.json) passes
19,658 tests in 1,435 files normally and under coverage on `76d93bb6`.
Coverage is 91.88% statements, 86.97% branches, 90.72% functions and 94.61%
lines; all unchanged thresholds pass. Independent recounting of 952 source
files agrees. Static checks, both builds and both 510-case browser suites pass;
each browser suite retains five hosted-only skips. The [native amd64 runtime
record](upgrade-2026-runtime-76d93bb6.json) verifies all six recovery phases,
the 2,930-component SBOM and 157 scan matches across the same 67 OS advisories,
using the October 28 database. This includes the joint-loss package and excludes
the subsequent health, EBL and remaining internal work.

The [October 28 public refresh](upgrade-2026-source-refresh-20261028.md) rechecks
79 official endpoints: 75 successful bodies, four retained HTTP failures and
55 unchanged PDFs. Relevant tax guidance and candidate provider prices remain
unchanged. The fresh production package audit reports zero vulnerabilities;
image-advisory ownership, account access and human qualification remain open.

Joint-loss delivery passes final private 57 tests/23 files including eight
unchanged independent controls, all static/build checks and production browser
2/2 with zero retries. Main passes 49/22 and all relevant static/engine-build
checks. Parent independently verifies nine originals and 57 PDFs/165 pages/308
fields with 14,186 checks, then confirms both final originals and all 34 final
download pages match in text and pixels. See [the joint-loss ledger](upgrade-2026-nol-joint-pools-work.md).

Positive-other-return health is delivered in `77e8f663`. The V5 correction
passes 1,177 affected tests and a separate 39-case source review preserving all
twelve private controls. Parent review independently derives 14 saved originals
and checks 38 PDFs/321 pages with 26,739 assertions and no failures, then inspects
all page contacts, readable corrected forms and actual browser screenshots. The
three physical Form 7206 amounts now report $5,000 for the below-half source;
the exact-half control remains $5,001. Earlier failures and reader corrections
remain retained. Final private checks pass 62/19; main passes 90/18 with all
three types, spec, inventory, scoped lint and root build. See [the health ledger](upgrade-2025-marketplace-other-return-cash-work.md).

The [joint EBL/ordinary package](upgrade-2026-nol-joint-ebl-work.md) is delivered
in `33ab57d1`. Its separate source review passes 32/10 and still rejects the saved
V1 originals missing prior ordinary carry. Parent original-only review passes
20,906 checks across 11 originals and 93 PDFs/230 pages; visual review covers all
pages. Final private checks pass 62/18 and production browser 2/2; main passes
72/13, spec and inventory checks. The ordinary prior-QBI record is separate from
still-suspended EBL character.

The [separate-owner health package](upgrade-2026-health-separate-owners-work.md)
is delivered in `b385f4a0`. Independent source review passes 19/7; parent checks
five canonical originals, one source-complete seeded guide and two actual saved
browser states across 58 PDFs/341 pages/310 fields with 23,219 checks and no
failures. All page contacts, readable affected forms and actual UI captures were
inspected. Main passes 82/17, all three types, spec/inventory, scoped lint and
engine build. Browser evidence is focused seeded interaction, and Form 8962
remains an explicitly unofficial reference in this review packet.

The [prior-property package](upgrade-2026-k1-prior-property-nonitemized-work.md)
was delivered in `6fc4312d` under the now-superseded no-floor premise.
The following checks are historical: source review passed 37/7, including
eight private controls; final private checks pass 45/11. Parent independently
derives the nine canonical and two actual saved browser originals and passes
8,765 arithmetic, source, handoff and gate checks. No 2026 PDF is generated.
Main passes 75/13, all three types, spec/inventory, scoped lint and engine build.
The integrated webpack build and four desktop/mobile browser cases pass with
one worker and zero retries. The [advisory wording correction](upgrade-2026-workspace-readiness-copy.md)
is separately delivered in `e80a3aba`; its new capture no longer claims the
unsupported-year bundle is ready. Existing gates remain closed.

The [ordinary prior-QBI package](upgrade-2026-prior-qbi-ordinary-work.md)
is delivered and pushed in `f4dc51a7`. Independent source review passes 25 tests
in eight files, including eight private controls. Parent review derives nine
saved originals and checks 69 PDFs, 174 pages and 334 populated fields with
12,204 checks and no failures; separate visual review covers all page contacts.
Final private integration passes 75/23, all three types, spec/inventory, lint
with no errors, both builds and desktop/mobile browser 2/2 with zero retries.
Parent verifies all 3,822 tracked regular files and six symlinks before adoption;
the two final saved originals and all 40 downloaded pages match the reviewed
source in bytes or extracted text and pixels as applicable. No invented prior
zero, filing-unit allocation or interview completion is introduced.

Section 108 research establishes collectable ordinary later-attribute sources.
Independent reproduction confirms incorrect capital-carry sign handling, a
missing section 1017 liability cap, stale outgoing passive-activity balances,
and omitted property inventory becoming zero. The spec-first source/reduction
package is in progress; its first five canonical controls fail as expected
before implementation. The precise modified-absorption/charitable-exhaustion
interaction remains a separate guarded interpretation. Final integrated release
checks follow the charity and section 108 corrections. The
[community-bond interpretation](upgrade-2026-community-bond-method-decision.md)
remains recorded for a qualified reviewer. Earlier findings and reader-only
corrections remain retained; agent review does not replace human qualification.

Remote CI on `25f71f06` passes 19,523 tests in 1,384 files both normally and
under coverage. Coverage is 91.85% statements, 86.88% branches, 90.72% functions
and 94.59% lines; every unchanged threshold passes. Its self-host browser suite
passes 492 cases with five hosted-only skips, and all static/build jobs pass.
The container job was cancelled during its browser phase after six recovery
steps passed; its SBOM, scan and artifact upload were skipped. See the
[exact CI record](upgrade-2026-ci-25f71f06.json). This is an intermediate commit,
not final evidence for later monthly, charity, educator or outside-child changes.

Newer `31812714` passes all 19,587 tests in 1,406 files both normally and
under coverage, all static/build checks and both 500-case browser runs. Each
browser run retains five hosted-only skips. The unchanged coverage rerun reaches
91.90% statements, 86.98% branches, 90.79% functions and 94.63% lines; independent
recounting of the downloaded artifact agrees with the report. Every unchanged
threshold passes. The first attempt's seven five-second timeouts are retained;
no deadline, assertion or coverage threshold changed.

The [verified native amd64 runtime](upgrade-2026-runtime-31812714.json) passes
all six recovery phases, preserving nine database tables, exact billing values,
two synthetic tenants, browser facts and original document bytes. Its 157 scan
matches comprise the same exact 67 OS advisories as the earlier scan, with no
critical, npm or fixed-version matches. Owner acceptance remains pending.
The [October 27 public refresh](upgrade-2026-source-refresh-20261027.md) retains
75 successful responses and four HTTP failures; final-form and provider-account
qualification remain separate. Final integrated checks, native images/scans,
staging, human review, filing and model-promotion requirements remain open.

Charitable COD main integration passes 55 tests/16 files and all relevant static
and build checks. Changed-filing-status NOL main integration passes 65 tests/22
files, including the separate audit-year regression, and static/build checks.
Its final private desktop/mobile runs pass 2/2 with zero retries; all 34 downloaded
pages match the earlier reviewed originals in extracted text and rendered pixels.

Actual-paid health is delivered in `661977aa`. The final private source passes
152 tests/23 files including seven unchanged independent controls; main passes
145/22 with all three types, spec, inventory and engine-build checks. Both
production builds and desktop/mobile checks pass on the adopted runtime. Parent
reopens both saved originals and all 64 final download pages: 63 are identical
in text and pixels, and the remaining page changes only the corrected 2025
audit label. The prior independent V2 review covers 13,169 checks/128 pages.

Educator/reissue delivery `2ab4d9ac` passes final 51/13 including eight unchanged
independent controls, all static/build checks and desktop/mobile 2/2; main passes
43/12 and static/engine-build checks. Parent derives nine saved originals and
checks 53 PDFs/217 pages/224 populated fields with 11,287 assertions and no
failures, then inspects all page contacts, eleven details and four UI views.
Both final saved source states are byte-identical to the reviewed originals.
All 30 final download pages have identical extracted text and rendered pixels.
Browser evidence is focused seeded edit/reconfirmation/reload/download, not a
fully traversed release interview. Human, final-form and filing qualification remain separate.

| Delivered package | Commit | Bounded verification |
| --- | --- | --- |
| Actual outside health cash and annual rational reporting | `77e8f663` | Main 90/18, final private 62/19 and relevant static/build checks pass. V5 affected 1,177/164 and source 39/13; parent 26,739 original/PDF checks over 38 PDFs/321 pages and separate visual review. Earlier failures retained. See [ledger](upgrade-2025-marketplace-other-return-cash-work.md). |
| Same-couple joint loss pools with original owner histories | `80af6d97` | Final 57/23 including eight private controls; main 49/22; all relevant static/build checks and production browser 2/2 pass. Parent 14,186 original/PDF checks across 57 PDFs/165 pages/308 fields; final 34 pages match in text and pixels. See [ledger](upgrade-2026-nol-joint-pools-work.md). |
| Actual educator deductions from reissued bond ownership | `2ab4d9ac` | Final 51/13, main 43/12, all static/build gates and production browser 2/2 pass. Separate source 35/9 includes eight private controls; parent 11,287 original/PDF checks over 53 PDFs/217 pages/224 fields. Final 30 pages match in text and pixels. See [ledger](upgrade-2026-educator-bond-reissue-work.md). |
| Actual payer cash and fully repaid own-return health advances | `661977aa` | Final 152/23 includes seven private controls; main 145/22 and relevant static/build gates pass. Production browser 2/2; final 64-page comparison verifies only the separately corrected audit-year label changed. Complete payment-source originals and historical review remain partial. See [ledger](upgrade-2025-marketplace-actual-paid-work.md). |
| Bounded debt reduction after actual and charitable-comparison NOL absorption | `ced90a20` | Main 55/16 and static/build checks pass; source and saved-original reviews are separate. Parent checks 9 originals and 83 PDFs/338 pages/454 fields with 10,430 assertions. Full affected cohort 1,205/167 and desktop/mobile 2/2 pass. See [ledger](upgrade-2026-charitable-cod-work.md). |
| Actual year in uncapped premium repayment explanation | `4752ae46` | Spec-first red 8/1, green 16/3 and source-only independent review clear. Numerical expressions, historical cap and gates unchanged. See [ledger](upgrade-2025-marriage-health-work.md). |
| Original loss ownership through joint and separate filed histories | `a1f63cf2` | Main 65/22 and static/build gates pass. Separate source 23/7 includes 8 private controls; parent 13,676 checks over 7 originals and 55 PDFs/128 pages/294 fields. Final source 64/22 and production browser 2/2 pass. See [ledger](upgrade-2026-nol-filing-unit-work.md). |
| Actual zero credit and complete advance repayment for eligible health payments | `496f6444` | Final source passes 962 tests/108 files; main 49/9. Parent source and final-delta reviews pass, including six private controls. Parent independently derives five original inputs, reopens 12 PDFs/76 pages/345 populated fields and checks 61 physical, 25 reference and four workspace values. |
| Annual ordinary cash education earnings, with exact aggregation before reporting | `b0746956` | Final source passes 1,724 tests/203 files, types/contracts/spec/inventory/lint and both builds; main 55/9. Parent final checks pass 62/9, preserving nine private controls. Ten merged PDFs/183 pages and 64 component PDFs are independently reopened. The retained first candidate's two half-dollar amounts incorrectly produced 2; the corrected exact sum produces 1. |
| Old NOL histories composed with a separate current charitable loss | `d83ffe01` | Final source passes 772 tests/93 files and 568 strict-spec checks/5 files, types/spec/inventory/lint and both builds; main 23/8 plus 24 readiness checks/2 files. Separate source review passes 22/7 with six private controls. Independent original-source review reopens 38 PDFs/99 pages/279 populated fields and checks 193 physical and 162 reference values. |
| Coverage-job execution budget and verified intermediate native runtime record | `03990b87`, `cc4b80d0` | Only the coverage job's total budget changes from 30 to 60 minutes; workers, test deadlines, assertions and coverage thresholds stay unchanged. The runtime record verifies downloaded native amd64 evidence for `fdfeedf57`, not later source. |
| Reported health repayment with exact original premium cents | `2511060a` | Final source passes 973 tests/113 files; main passes 14/6 plus 25/3. Parent source review passes 14/6 including six private controls. Independent original/PDF review reopens 11 PDFs/72 pages/403 populated fields and checks 56 physical, 43 reference and four workspace values. |
| Actual 2025 prior K-1 charitable basis release with NOL | `7c11d1ca` | Final author package/readiness checks pass 36/7 with four workers, plus 570 strict-spec checks/5 files; parent main passes 37/7 with one worker and a different readiness selection. Separate source review passes 19/6 with six private controls. Original/PDF review reopens 48 PDFs/105 pages/278 fields and checks 203 physical and 119 reference values. |
| Signed marketplace remaining capacity and actual partnership gross sources | `5489eb6b` | Final package passes 168 tests/29 files and static/build checks; main passes 12/7. Parent source review passes 22/9 with eight private controls. Independent original/PDF review reopens ten PDFs/69 pages/84 fields and checks 90 physical, 179 reference and ten workspace values. |
| Actual operating K-1 sources for current Form 172 loss | `a1fb36b8` | Final executable source passes 609 tests/14 files; main passes 10/6. Independent source review passes 16/7 including six private controls. Original/PDF review reopens 33 PDFs/92 pages/191 fields and checks 183 physical, 474 reference and 191 appearance values. |
| Consistent mobile layout measurement | `d5d69b8d` | Both existing cases pass three runs each, one worker, zero retries. Independent source review and controlled scroll, real-offset and hidden-element probes preserve the original assertions. Production build, web types and focused lint pass. |
| Reuse validated cases and scores within one evaluation report | `6d015f1d` | Main passes 32 tests/2 files. Independent review passes 35/3 with two workers; changed inputs, review/provenance, costs, privacy and rejection results match the baseline. No provider evaluation or promotion is claimed. |
| Bounded PDF parse/save batches | `c4c199fb` | Independent review passes 53/3 with one worker; seven representative PDFs spanning 686 fields are byte-identical. The private remaining-PDF cohort passes 1,269/196, with root types and scoped lint. Main utility/new-health consumers pass 5/3. |
| Ordinary education receipt qualification, actual refunds and supplied allocations | `771c638a` | Final source passes 1,751 tests/217 files, static checks and both builds; main 20/9. Independent source review and original/PDF review cover 77 PDFs/328 pages/422 fields. Final desktop/mobile browser passes 2/2 with zero retries. |
| Reuse the unchanged synthetic corpus digest in evaluation fixtures | `5b1b57cc` | Main 23/1 and private cohort 35/3 pass. Independent review freezes the entire corpus and confirms all 23 cases pass without mutation. All twelve profiled comparison outcomes match; no production provider or qualification code changes. |
| Temporary workspace PDF components avoid repeated compression | `d00b554e` | Frozen source passes 1,344 tests/215 files, static checks and both builds; main 4/3. Independent review passes 55/5, including three private controls. Eight saved 22-page outputs retain identical text, appearances, amounts and notices; final downloads remain compressed. Production desktop/mobile download and reopen passes 2/2 with zero retries. |
| Actual charitable activity allocation after basis | `944f91a4` | Final source passes 648 tests/24 files and static/spec/inventory checks; main 13/5. Independent source/reader review passes 22/8, retaining seven private controls. Independently derived originals and all 97 PDFs/193 pages pass 3,162 comparisons, including 136 physical and 13 flattened placements. |
| Actual eligible health cash independent of policy allocations | `a2d4898` | Final source passes 92 tests/15 files, static checks and both builds; main 19/6. Independent source review passes 19/7 with eight private controls. Six original inputs and all 15 PDFs/113 pages/229 fields pass 4,044 independent comparisons. Production desktop/mobile workflows pass 2/2 with zero retries. |
| Actual annual cash education category and borrower limits | `dff617c8` | Final source passes 1,959 tests/249 files and static/spec/inventory/build checks; main 20/6. Independent review retains twelve private controls in 32/8. Original/PDF review checks the retained annual corpus and 27 corrected PDFs/108 pages/132 fields with 2,855 comparisons. Four production browser workflows pass with zero retries. A positive own-return interest claim now requires actual lender/eligibility sources. |
| Actual outside-person health cash and separate return evidence | `fbe731a3` | Final source passes 340 tests/98 files and static/build/spec/inventory checks; main 13/6. Independent source review passes 19/7 with six private controls. All 14 PDFs/146 pages/428 populated fields pass 1,774 checks plus 666 actual-guide/source comparisons. Two production browser cases pass with zero retries. |
| Copy completed pages for temporary workspace merges | `5ea12622` | Corrected frozen source passes 1,482 tests/250 files and static/build checks; main 40/6 plus types/lint. Independent review passes 13/3, retaining the original orphan-widget failure. All 106 paired pages in eight actual production packets match in text and rendered pixels; four production desktop/mobile download checks pass with zero retries. |
| Original prior at-risk gift/loss histories and successive QBI character | `2384428b` | Final author cohort 205/30; independent final 240/11 includes seven private controls; main 210/7. All 71 PDFs/157 pages/403 fields were independently reopened. Original gift years, prior use and new passive disallowance years remain distinct; no second basis deduction. |
| Annual cash interest-only education sources and exact lender reduction | `78a5219` | Final author cohort 1,979/256 and all static/build gates pass; final browser 2/2, zero retries. Parent final 25/10 preserves seven private controls; main 18/8 passes. Independent original/PDF review covers 48 PDFs/237 pages/225 fields and 6,614 checks. Original income and lender records bind the final review output. |
| Actual marriage-year health deduction and premium credit | `9c077851` | Independent source31/8 includes six private controls; parent final192/31 and main31/7 pass. Six original records and15 PDFs/143 pages/449 fields pass8,767 independent checks, including physical8962/7206 and flattened transfer locations. Final source186/30, static/build checks and original production desktop/mobile 2/2 pass. |
| Resolve mapped PDF fields once per form | `99592823` | Main 128 tests in 19 files and static/build checks pass. Independent review includes six private controls; 24 paired PDFs/50 paired pages pass 1,855 exact field, text, geometry, notice and pixel assertions. Existing deadlines and thresholds are unchanged. |
| Original passive ordinary, short-term and long-term character through loss limits | `a29662b8` | Independent source review 33/11 with seven private controls; parent final 123/29 and main 26/9 pass. Eight canonical originals and actual guided state produce 122 PDFs/262 pages/836 fields; independent original/PDF review passes 10,742 checks. Original basis, at-risk, passive, QBI, Schedule D/E and NIIT treatment stay distinct. |
| Form 8815 reference-only packet completeness | `499dc198` | Main 24/3 and independent 29/4 including five private controls pass; actual saved cover is partial. No calculation or filing gate changes. See [ledger](upgrade-2026-form8815-readiness-work.md). |
| Actual shared full-family policies with marriage-year health calculation | `7dd7fab5` | Parent final source 24/8 including eight private controls; main 40/9 plus all static/build checks. Independent original review checks 15 PDFs/153 pages/480 fields with 9,030 assertions. Final author 597/140; original production browser 2/2 with zero retries. See [ledger](upgrade-2025-shared-marriage-health-work.md). |
| Form 8815 reference text pagination | `bc35f5d2` | Main 56/5 and independent 13/5 including four private controls pass. Twelve candidate PDF pages preserve all text and notices above the body margin; the original overflow remains reproduced. See [ledger](upgrade-2026-form8815-pagination-work.md). |
| Actual savings-bond reissue and prior income histories | `c6abb245` | Final source passes 1,633 tests/171 files plus final regression/static/build/browser checks; parent source 33/10 includes seven private controls; main 92/10 passes. Independent original/PDF review reopens 76 PDFs/301 pages/293 populated fields with 7,867 checks and separate reference-body geometry verification. Original half-dollar, cover and footer findings remain retained. See [ledger](upgrade-2026-savings-bond-reissue-work.md). |
| Native clearing of compression buffers | `25f71f06` | Complete private PDF cohort passes 1,350 tests/225 files; main 30/5 passes. Independent review compares 70 exact byte cases, 12 streams and four PDF pairs/eight paired pages. Production builds and four desktop/mobile workflows pass with zero retries; a local dependency-stage container verifies the exact patch. No final runtime or remote coverage pass is inferred. See [ledger](upgrade-2026-pdf-compression-work.md). |
| Actual monthly coverage in marriage-year health worksheets | `05c5819` | Final private source passes 64 tests/14 files including six independent controls; main 58/13 passes. Independent saved-output review reopens 14 PDFs/148 pages/443 fields, with 4,084 comparisons plus flattened/privacy/footer checks. Final static/build checks and production desktop/mobile 2/2 pass with zero retries; original PDF producer and final browser evidence remain distinct. See [ledger](upgrade-2025-marriage-coverage-family-work.md). |
| Actual charitable ownership and filed-use histories | `2a8f6c17` | Independent source 54/11 includes eight private controls; original/PDF review passes 9,452 checks over 73 PDFs/123 pages/311 fields. Final 72/17 and main 50/9 pass with static/build gates; production desktop/mobile 2/2 and separate settled-ticker 2/2 pass without retries. Later downloaded PDFs receive 102 additional checks. See [ledger](upgrade-2026-charitable-filing-unit-work.md). |

| Actual educator costs and exact bond MAGI reconciliation | `00089be4` | Final source 32/12 includes nine unchanged independent controls; main 21/10 and all static/build gates pass. Independent original/PDF review covers 52 PDFs/215 pages/206 fields and 10,471 checks. Production desktop/mobile 2/2 passes with zero retries; final actual downloads receive 34 additional source/text/privacy checks. See [ledger](upgrade-2026-educator-bond-rational-magi-work.md). |
| Actual outside-child sources in marriage-year health | `977212bf` | Independent source16/6 includes seven private controls; final21/9 and main15/8 pass with all static/build gates. Six originals and14 PDFs/156 pages/480 nonempty controls pass11,029 independent checks. Final desktop/mobile2/2 passes with zero retries; original PDF producer attribution remains distinct. See [ledger](upgrade-2025-marriage-outside-person-work.md). |

Original-source browser and PDF evidence remains attributed to its recorded
producer. Later source checks do not turn those artifacts into a new integrated
browser run. These software/source reviews are agent reviews, not qualified
human tax or security approval.

The [87e37df0 native runtime record](upgrade-2026-runtime-87e37df0.json) binds the
verified 47,603,406-byte artifact archive to image
`sha256:094195428a78d27967f2b63ea9fa6eb40a7f2c2cc5ada2777b17e506d67eb087`.
Database restart, dump/restore, rollback and re-upgrade preserve nine tables,
two synthetic tenants, exact provider cost, browser facts and document bytes.
Five hosted-only browser skips remain in each suite. The 2,930-component SBOM
and scan retain 157 matches across 67 OS advisories, with no Critical, npm or
available-fixed-version matches. Every advisory tuple matches the preceding
995 scan; owner acceptance by November 7 remains pending. These are synthetic
remote checks, not staging or production evidence.

The following queue and candidate observations are retained October 27–28
history. The current integration section above and checkpoint workInProgress
list supersede their pending/delivered labels.

The finite internal queue was refreshed against the actual source on October27.
The bounded audit and its24 source/document hashes are retained in
`.local/upgrade-evidence/ai-finite-scope-refresh-20261027.json`, SHA256
`8cdc4b93891c1eae751573252ae6ccaa468f3fd3fe9d837285535334e16625d6`.
It does not reopen delivered ordinary methods or expand every IRS election.

- **Education:** educator handoff from actual savings-bond reissue records is
  delivered in `2ab4d9ac` for full exclusion or one actual income owner. Reduced
  two-positive-owner exclusion, mixed-purpose loan earnings, mixed July4 annual
  allocation and binding multiple-prepaid-source allocation need their exact
  controlling method; supplied timing or conservation alone is insufficient.
  Changed community-property ownership needs actual jurisdiction/history and
  applicable local law, not an invented nationwide rule. Specialized Coverdell
  partial pledges and post-termination regimes remain separate excluded methods.
- **Charity/NOL:** the reviewed debt-reduction and current one-owner filing
  histories and same-couple current joint pooling (`80af6d97`) are delivered.
  Source-determined mixed EBL/ordinary character and explicitly nonitemized2026
  property-only prior entity basis/at-risk release remain internal work. Prior
  floor-vintage, multiple positive NOL-origin attribution, partial
  mixed cash/property and prior treated-paid versus final-deduction questions
  remain distinct. Debt reduction beyond either modified residual, or expiry
  changing the charitable benefit, still lacks the controlling composition;
  neither a simple zero-clamp nor a minimum of different residuals is approved.
  Later section108 attributes require a separate original-source worksheet.
- **Health:** actual-paid/advance sources are delivered in `661977aa`. Actual owner
  cash for an eligible outside child with a positive other-return credit is
  implemented privately. V4 source review passes, but independent physical
  Form 7206 review retains three wrong rounded fields. The V5 correction passes
  a separate 39-test/13-file source review; its final saved-output checks remain
  due before adoption. It must bind actual insurer cash and
  reimbursements separately from the other taxpayer's credit, advances and
  return tax payment. The October 28 audit adds one bounded internal composition:
  two specified-plan owners plus a separate-business nonspecified deduction,
  restricted to explicit zero advances and independently nonbinding actual
  business limits. Binding joint repayment attribution remains a separate
  unestablished method.
- **Verification:** intermediate `76d93bb6` passes full tests/coverage and all
  unchanged thresholds, both510-case browser suites and native-amd64 recovery.
  Final integrated local/remote checks, native arm64+amd64 images, SBOM/scans
  and recovery remain due after the source queue. Five hosted-only skips do not
  establish staging readiness; external inputs below remain required.

The new joint EBL candidate `dc2eb914` remains unadopted. Independent source
review passes 19 cases but retains two failures: absent ordinary prior QBI carry
silently becomes zero. An actual prior $7,000 produces $32,000 outgoing QBI loss;
known zero produces $25,000. Parent original/PDF review agrees with seven complete
canonical cases and 417 physical amounts across 82 PDFs/209 pages, while three
saved guided cases lack that source. The actual prior-return record and collector
are being corrected before a new freeze. Existing non-EBL qualified-loss intake
needs the same source follow-through; suspended EBL history cannot establish it.
The retained findings and reader-only corrections are in
`.local/upgrade-evidence/parent-joint-ebl-artifact-findings.json`, SHA256
`f1fb530dfa1226bc1c06dd5483c294884a2bc4060791ff51a575678fbd20efb3`.

The October 28 bounded queue audit,
`.local/upgrade-evidence/complete-finite-queue-76d93bb6-audit.md`,
checks 27 source/document hashes and ten delivered ancestor commits against
`76d93bb6`. Its JSON SHA256 is
`04b3801c937df6aa79e219f1596612c1a937cc2e6ec9cc8832f888822179cb58`.
The proposed health composition is assigned to the facts agent after EBL review
with provisional work on the corrected health source; final adoption and tests
remain due.
Later section 108 attributes and changed community-property history still need
bounded original-source contracts and the applicable rule. Neither is completed
by adding a reviewer checkbox. Existing precise source questions and separately
excluded regimes retain their documented boundaries.

The annual-category missing-loan-source finding is resolved in `dff617c8`; its
original failing input and PDF remain retained. The corrected actual lender
packet produces a 1,000 deduction and 58,000 AGI; explicit-zero and outside-owner
claims retain 59,000 AGI. See [the package ledger](upgrade-2026-education-annual-category-work.md).
The outside-person health package is delivered in `fbe731a3`; actual relationship,
age, monthly cash and separate completed-return evidence are retained. See [its
ledger](upgrade-2025-marketplace-outside-person-work.md).

The prior-year at-risk package is committed in `2384428b` with metadata 170/167.
The parent independently reran 240 tests/11 files on the final rebase, retaining
seven private controls; main passes 210/7, types, spec and inventory. Original
review evidence covers 71 PDFs/157 pages/403 fields. The type-only builder
annotation emits identical executable JavaScript; all PDF performance changes
are preserved. See [its ledger](upgrade-2026-k1-prior-charitable-at-risk-work.md).

The bounded annual loan-interest candidate's original stale-income finding is
resolved in `3020d271`: the two unchanged private finding probes and remaining
controls pass 16 tests/7 files. The independent original/PDF review reopens
48 PDFs/237 pages/225 populated fields, with 6,614 checks including all 3,512
producing hashes. The exact half-dollar deduction reports 1; all other checked
amounts, appearances, original-guide facts and privacy notices agree. Six
contacts cover 86 pixel-unique pages, eight readable pages and four browser
screenshots were personally inspected. The retained reader-only correction
replaces an incorrect prior-K1 partial-status assumption with this packet's
unchanged supported classification; filing remains false and e-file validation
not-validated. Final rebase `63ba5f02` on `2384428b` passed 1,979 tests/256 files,
all static/build gates and two zero-retry production browser checks. Delivery
`78a5219` records metadata 171/168, parent 25/10 and main 18/8 checks, preserving
the prior-loss bridge and PDF merge changes. See [its ledger](upgrade-2026-annual-loan-interest-work.md).
No human tax or final-year qualification is claimed.

The unshared marriage-year health package is delivered in `9c077851`, with
independent source/original/PDF evidence in its ledger. The separate shared-policy
composition is delivered in `7dd7fab5`; neither package establishes human qualification.

The page-copy package [ledger](upgrade-2026-pdf-page-merge-work.md) records the
orphan-widget rejection fix and exact saved-output comparisons. Temporary byte
counts decreased; local timing varied, including one slower candidate. This does
not claim that the remote coverage failures have been resolved.

The new temporary-component source passes all 31 tests in four previously
relevant PDF suites under instrumentation. This deliberately partial run exits
below the unchanged full-project coverage thresholds; it is a diagnostic, not a
coverage pass. A later complete immutable run on `944f91a4` passes 19,333 tests
in 1,322 files with one worker: 86.85% branches (51,789/59,624), 90.73%
functions, 91.87% statements and 94.59% lines. Every unchanged threshold passes
and all 3,474 tracked source hashes are unchanged. This intermediate run
includes the PDF serialization and current at-risk changes, excludes health
`a2d4898` and later work, and does not replace final integrated or remote checks.
The evidence is retained in `944f91a-coverage/`. Remote
`11039247` and `d00b554e` static jobs passed, while their unit/coverage runs were
cancelled by subsequent authorized pushes; neither is complete CI evidence.

The `fdfeedf57` CI coverage job was cancelled after its confirmed 30-minute
execution limit. Its partial log also reports 16 failed cases in twelve suites;
there is no completed coverage report. A focused instrumented local run passes
all 88 tests in those suites, but deliberately retains full-project coverage
scope and therefore exits below global thresholds. That diagnostic is not a
coverage pass and does not resolve the remote failures. The immutable `c4c199fb` full-project run completed with 19,264 passing and
three failing tests in 1,290 files. Each failure is a five-second PDF timeout;
there is no completed coverage report. Its 3,400 source hashes are unchanged.
The log and verification are retained in `c4c199f-coverage/`. The three unchanged
cases pass in isolated instrumented profiles, whose partial selection remains
below the unchanged global thresholds. Timing varies across runs; a private
larger-batch experiment gave no consistent benefit and was not integrated.
These diagnostics do not resolve the full-run failures. That snapshot excludes
the later K-1 release and health package. Earlier complete local
verification at `3669b00` recorded: 19,086 tests/1,216 files, 86.78% branches,
90.49% functions and every unchanged threshold passing; all eight static checks
and 434 production browser cases pass with zero retries, with five hosted-only
skips. Later packages are excluded.

Remote `456bd432` unit tests pass 19,276 cases in 1,294 files and its static
jobs pass. The self-host browser job reports 463 passes, one flaky mobile case
and five hosted skips. The later `d5d69b8d` fix samples positions in one browser
turn; six focused zero-retry cases pass, and a real 30px offset still fails the
preserved assertion. The exact remote event's cause is not proven. Its coverage
job records fifteen failures in eleven suites before cancellation, without final
error details or a coverage report. Those retained failures remain internal work.

The inspected [native amd64 record](upgrade-2026-runtime-456bd43.json) for
`456bd432` records image `sha256:bc4145e97283b5ffae033bd45e45976cc7e27de1ec3b3504a9c0ef6dd3fa8c04`,
44 templates, non-root read-only execution and actual health. All six recovery
phases pass with nine database tables, two tenants, exact provider cost, browser
facts and original document bytes. Container browser checks pass 464 cases with
zero retries; five hosted-only cases are skipped. The encrypted recovery checks
reject a wrong password and tampered ciphertext and preserve deletion/reload.
Raw-marker observations cover 407 requests with the retained encoding/binary
limitation. The archive hash is verified. This evidence excludes the subsequent
signed-health, operating-K1 and mobile packages and does not qualify staging.

The runtime scan has 157 matches across 67 advisories: 54 High, 47 Medium,
10 Low and 46 Negligible; no Critical, npm or available-fixed-version matches.
The exact advisory/package/version/fix tuples equal the prior inspected image.
Owner acceptance and its November 7 expiry remain pending. The October 26
production dependency audit records zero advisories across 425 dependencies.

The newer [native amd64 record](upgrade-2026-runtime-16609f2.json) verifies
`16609f2`: remote unit checks pass 19,345 tests in 1,328 files, and both browser
runs pass 474 cases with five hosted-only skips each. The runtime browser run
has zero configured retries; the self-host run reports no flaky cases. All
static jobs and web build/types pass. Remote coverage completed with 19,314
passes and 31 five-second PDF/workspace timeouts across 28 files; no coverage
report was produced. The exact failed log and cases remain recorded while the
runtime path is investigated. The built image is
`sha256:6a09e9cb577feb4d48b6e76934832bf3d787408d9ddc2fa5846f84cbefba77a2`;
all six synthetic recovery phases preserve the same database, browser facts and
original document hashes. Its 2,930-component SBOM carries the exact source
revision, and the downloaded archive digest matches GitHub's artifact digest.
The 157 scan matches have the same 67 advisory/package/version/fix tuples as the
previous image, with no Critical, npm or available-fixed-version findings.
Owner acceptance remains pending. These checks exclude the later private tax
packages and do not qualify hosted staging, historical schema downgrade or
independent human review.

The latest [native amd64 record](upgrade-2026-runtime-8f8de91.json) verifies
`8f8de91a`: all 19,386 unit tests/1,341 files pass, as do the static jobs and
both 480-case browser runs, each with five hosted-only skips and no observed
flaky cases. Coverage completed with 19,373 passes and 13 five-second timeouts
in 12 files; it failed and produced no complete coverage report. The previous
31-case failure remains retained. Exact failure logs and cases identify the
remaining PDF/workspace performance work; no deadline or threshold changed.

The image `sha256:a4177acaf4fd6fa96808b918f4c2727a7c882f2cb4a4f8c66e6c58fbbf6ad4a7`
passes all six synthetic recovery phases with exact database, browser-fact and
original-document hashes. The 2,930-component SBOM matches the source revision;
the 43,857,010-byte archive matches GitHub's digest. All 157 scan matches retain
the same 67 advisory/package/version/fix tuples; no Critical, npm or fixed-version
match was found. Advisory ownership and independent security review remain
pending. This intermediate evidence excludes the later prior-loss and annual
interest packages and does not qualify hosted staging or historical schema
downgrades.

The goal remains **active, incomplete and not release-ready**. The
[external-action handoff](upgrade-2026-external-actions.md) retains missing
qualified reviewers, launch-state demand, authorized staging, provider account
access and approved evaluation funds, final official forms and advisory
acceptance. Precise controlling tax interpretations remain separate from the
internal methods above. No production deployment, filing enablement or model
promotion has occurred.

## Previous checkpoint through 568c853

The branch is pushed through `568c853`. Rule provenance is `2025.157` /
`2026.154-law-integration-draft`; the inventory has 534 entries, 5,651
specification test references and 128 explicit shared-method associations.
Each delivered package matches its reviewed tree and owned file hashes.
Readiness gates remain unchanged.

| Delivered package | Commit | Bounded verification |
| --- | --- | --- |
| Actual room-and-board allowance use across return years | `f6f9d06` | Final candidate passes 1,703 tests in 197 files; main passes 66 in ten. Separate source review passes 30 in eight, including five private controls. Parent reopens 49 PDFs/246 pages/215 fields, checks 25 physical and twelve browser values, and inspects the rendered output. |
| Published health Worksheet P/Form 7206 stop after actual nonspecified premiums | `27f95f9` | Final candidate passes 937 tests in 95 files; main passes 547 in twelve. Separate source review passes thirteen in seven; final integration controls pass 25 in nine. Parent reopens ten PDFs/54 pages/78 fields and checks eighteen physical, 21 reference and four workspace amounts. |
| Current Form 172 loss with separate regular/AMT charitable histories | `31c3794` | Final candidate passes 870 tests in 119 files plus 48 readiness/inventory cases; main passes 59 in nine. Separate source review passes seventeen in seven, including six private controls. Parent reopens 22 PDFs/67 pages/121 fields, checks 35 physical, 55 reference and three workspace values, and inspects all rendered review selections. |

The original-source browser and PDF evidence retains its exact producer boundary.
The package ledgers distinguish those freezes from final integration checks.
These agent software/source reviews do not supply qualified human tax approval.

The remaining internal source queue is annual ordinary cash education treatment,
positive old-NOL/current-origin charitable composition, and the finite health
payment, payer/person and marriage combinations. Independent review of the first
annual cash candidate found premature rounding: two exact taxable amounts of
$0.50 became $2 instead of the combined $1. That failed candidate and its artifacts
remain private; the author is correcting exact aggregation before another review.
The charitable composition and full actual-advance repayment candidates remain
private pending source/artifact review. Source-cents differences are still internal
health work, not an invented external interpretation blocker.

The native amd64 Web run for `1e04964` failed its first-upgrade return-heading
assertion while the page was loading. The unchanged exact-source rehearsal then
passed all six phases locally on native arm64, preserving nine database tables,
two tenant records, exact provider cost, browser facts and original document bytes.
That local pass does not resolve the remote failure. Its reproduction images used
OCI format without Dockerfile HEALTHCHECK; the rehearsal separately polled API
health. Final release images still require Docker-format health verification.
The separate diagnostics commit `568c853` preserves failed-phase and bounded
browser error/asset evidence without changing assertions, timeouts, retries or
cleanup. Its historical-image six-phase run and deliberate failing-image control
passed their respective checks. Independent review passes 21 tests in four files,
including five private controls for privacy, failure propagation and probe bounds;
main passes sixteen in three. No current-image qualification is inferred.

The most recent complete local run remains immutable `3669b00`: 19,086 tests in
1,216 files pass in unit and coverage runs, branches are 86.78% and functions 90.49%,
and all unchanged thresholds pass. All eight static checks and 434 production
browser cases pass with zero retries; five hosted-only cases remain skipped.
Later packages are excluded. Final integrated, remote, native-image, scan and
recovery checks remain due after the finite source queue. The last fully inspected
native amd64 runtime evidence remains scoped to `8f1d1ba`.

The October 26 production dependency audit records zero advisories across 425
dependencies; the image advisory register still needs owner acceptance. The
active goal remains **not complete or release-ready**. The
[external-action handoff](upgrade-2026-external-actions.md) lists missing qualified
reviewers, launch-state demand, authorized staging, provider account access and
approved evaluation funds, final official forms and advisory acceptance. Work
continues on the independent packages. No production deployment, filing enablement
or model promotion has occurred.

## Previous checkpoint through a71c561

The branch is pushed through `a71c561`. Rule provenance is `2025.154` /
`2026.151-law-integration-draft`; the inventory has 531 entries, 5,616
specification test references and 125 explicit shared-method associations.
The remote branch was independently verified at the exact delivery commit.
Readiness gates are unchanged.

| Delivered package | Commit | Bounded verification |
| --- | --- | --- |
| One institutional room-and-board allowance with original distribution membership | `02dccca` | Final candidate passes 1,689 tests in 191 files; main passes 551 in ten. Separate source review passes 23 in five, including seven private controls and the three previously failing regressions. Parent reopened 58 PDFs/286 pages/258 populated fields, checked 30 literal fields and twelve browser values, and inspected rendered output. Four production browser cases pass with zero retries. |
| Determined charitable NOL attribution with separate regular/AMT source histories | `a71c561` | Final candidate passes 856 tests in 113 files; main passes 539 in nine plus 24 readiness checks in two. Separate source review passes 28 in nine, including six private controls. Parent reopened 35 PDFs/76 pages/150 populated fields, checked 74 literal fields and three workspace values, and inspected 24 readable pages. Two production browser cases pass with zero retries. |

The charitable comparison preserves the actual current deduction and separate
regular/AMT histories. A positive adjustment requires one affected excess
origin; zero adjustment can preserve multiple originals. Current and prior
categories, actual deduction choice, expiry, QBI, crypto and pass-through sources
remain bound to the original records. Ambiguous allocations remain guarded.
The room-and-board correction prevents an original without expenses in a period
from taking that period's allowance; the original failure is retained. Exact
delivery hashes and source/review limits are in the respective package ledgers.
These agent reviews do not supply qualified human tax or security approval.

The remaining internal source work is finite. Cross-year room-and-board history
is privately implemented: its frozen source passes 30 independently run tests
in eight files, including five private controls; retained original and actual
browser PDFs are under review. The applicable health Worksheet P/Form 7206
stop package awaits independent source/artifact review. Actual health payer,
person, determined positive-advance and marriage combinations remain in the
health queue. Current-year Form 172 charitable-origin composition is private
work in progress. Precise competing-source interpretation questions remain
separate and are not replaced by invented elections or taxpayer amounts.

The most recent complete local run remains immutable `3669b00`: 19,086 tests
in 1,216 files pass in both unit and coverage runs, branches are 86.78% and
functions 90.49%, and all unchanged thresholds pass. All eight static checks
and 434 production browser cases pass with zero retries; five hosted-only
cases remain skipped. Later packages are excluded from that evidence. Final
integrated checks, exact native images, scans and recovery verification remain
due after the finite source queue. The Web workflow for `d5b5c43` completed,
but its runtime artifacts have not been inspected; the last fully inspected
native amd64 evidence remains scoped to `8f1d1ba`. No latest-source remote or
staging pass is claimed.

The October 26 production dependency audit records zero advisories across
425 dependencies; the image advisory register separately awaits owner acceptance.
The active goal remains **not complete or release-ready**. The
[external-action handoff](upgrade-2026-external-actions.md) identifies missing
qualified reviewers, launch-state demand, authorized staging, provider account
access and approved evaluation funds, final official forms and advisory
acceptance. Implementation continues while these inputs remain unavailable.
No production deployment, filing enablement or model promotion has occurred.

## Previous checkpoint through4932a83

The branch is pushed through `4932a83`. Rule provenance is `2025.152` /
`2026.149-law-integration-draft`; the inventory has 529 entries, 5,574
specification test references and 123 explicit shared-method associations.
Readiness gates are unchanged.

| Delivered package | Commit | Bounded verification |
| --- | --- | --- |
| Signed Marketplace health deductions across actual businesses | `24f2f921` | Exact final and main cohorts pass 616 tests in 28 files. Separate source review passes 19 tests in six files, including four private controls. Parent reopened 17 PDFs/109 pages/344 populated fields, checked twelve literal Form 8962 fields and inspected rendered output. Two production browser cases pass with zero retries. |
| Determined current-year charitable floor with original prior sources | `c08a005b` | Final candidate passes 1,129 tests in 108 files; main passes 563 in ten. Separate source review passes 24 in six, including six private controls. All 15 reviewed executable/spec/test blobs remain unchanged; all 527 prior inventory rows and 122 links are preserved. Actual 2026 calculation and PDF gates remain closed. |
| Accurate public storage, deletion and review-download descriptions | `4932a83` | The same 20 existing tests in three files pass on the private and integrated sources, with web types and lint. Separate technical-copy review traces the actual storage, recovery, deletion, PDF and authentication paths. No runtime privacy control or legal approval changes. |

The health method records an explicit reasonable allocation using actual
eligible-plan premiums; it is a source-backed interpretation, not a published
numerical example. Signed amounts and separate owner income limits survive the
original-source replay. The charitable method only admits source combinations
whose positive floor has a determined current-year origin. Missing source
allocation rules are not replaced with inferred taxpayer choices. Package
ledgers retain the original failures, exact source hashes and review limits.
These agent reviews do not supply qualified human tax or security approval.

The new room-and-board package remains private. Independent review reproduced
an allowance assigned to an original distribution with no expenses in that
period. The author retained the failed source and added cash/prepaid and
separate-period regressions before correcting it. The corrected source passes
23 independently run tests in five files, including all seven unchanged private
controls; the original three failures now pass. Original-input PDFs and browser
downloads still require rechecking before integration.
Cross-year academic-period usage remains internal implementation work, not an
external interpretation blocker.

The most recent complete local run remains immutable `3669b00`: 19,086 tests
in 1,216 files pass in both unit and coverage runs, branches are 86.78% and
functions 90.49%, and all unchanged thresholds pass. All eight static checks
and 434 production browser cases pass with zero retries; five hosted-only
cases remain skipped. Later packages are excluded from that evidence. Final
integrated checks, exact native images, scans and recovery verification remain
due after the finite source queue. The last completed native amd64 evidence
remains scoped to `8f1d1ba`; no latest-source remote or staging pass is claimed.

The internal queue is bounded: remaining health worksheet, actual payer and
person, determined positive-advance and marriage combinations; zero/unique-
origin charitable NOL attribution; corrected academic-period room-and-board
routing and original cross-year usage; and final integrated/runtime checks.
Precise competing-source interpretation questions remain separate. The
October 26 production dependency audit still records zero advisories across
425 dependencies; the image advisory register separately awaits owner acceptance.

The active goal remains **not complete or release-ready**. The
[external-action handoff](upgrade-2026-external-actions.md) identifies the
missing qualified reviewers, launch-state demand, authorized staging,
provider account access and approved evaluation funds, final official forms
and advisory acceptance. Implementation continues while those inputs remain
unavailable. No production deployment, filing enablement or model promotion
has occurred.

## Previous checkpoint through e26a7aa

The branch is pushed through `e26a7aa`. Rule provenance is `2025.150` /
`2026.147-law-integration-draft`. The regenerated inventory has 525 entries and
5,545 specification test references. Readiness gates are unchanged.

| Delivered package | Commit | Bounded verification |
| --- | --- | --- |
| Actual charitable source kinds and deduction choice in loss origins | `2bd4fdd` | Final candidate: 565 tests in 13 files; main: 558 in 10. Separate source review: 14 in 7, including five private controls. Parent reopened 49 PDFs/110 pages/259 populated fields, checked twelve literal Schedule A values and inspected rendered output. Two production browser cases pass with zero retries. |
| Actual prepaid/cash tuition assistance without an ESA | `dbe9bb0` | Final candidate: 787 tests in 64 files; main: 541 in 12. All types/spec/inventory/builds and scoped lint pass. Separate source review: 12 in 7, including four private controls. Parent reopened six PDFs/114 pages, checked sixteen retained fields and eight physical browser placements. Both production browser widths pass with zero retries. |
| Remaining shared-method inventory associations | `e26a7aa` | Adds 76 links while preserving all 45 prior links. Exactly 76 of 525 rows change; no year, authority, test-presence or e-file/business-rule flag changes and no new fully-supported status. Manifest/inventory/reference/rule checks pass 529 tests in four files. Separate review traced all 76 additions, reproduced and corrected one guard-only PDF association, then passed 532 tests in six files on the corrected tree. |

The delivered tax trees match their separately reviewed candidates. Original
failing cases, source restrictions, saved artifacts and exact hashes remain in
the package ledgers. These are agent software/source reviews; qualified human
tax approval remains outstanding.

All required local checks pass on immutable `3669b00`: 19,086 tests in 1,216
files pass in both unit and coverage runs. Branch coverage is 86.78%
(49,739/57,316), functions 90.49% (10,928/12,076), statements 91.86% and lines
94.61%; every unchanged threshold passes. All eight static checks and 434
production browser cases pass with zero retries. Five hosted-only tests remain
skipped. All 3,235 tracked source hashes remained unchanged, and port 3255 is
closed. This run predates the packages above; final integrated verification
remains required. Its evidence is
`.local/upgrade-evidence/3669b00-complete/{verification,summary}.json`.

The refreshed branch and remote exactly matched `dbe9bb0` before the inventory
commit. Its CI and Web workflows were observed running; no completion is
inferred. Earlier runs were cancelled by later pushes. The previously completed
native amd64 evidence remains scoped to `8f1d1ba`, recorded in
[the runtime report](upgrade-2026-runtime-8f1d1ba.json): six recovery phases and
both 428-case browser runs passed, each with five hosted skips. The SBOM's
157 matches across 67 OS advisories match the existing register; owner
confirmation remains pending. Final native images, scans and recovery evidence
for both platforms are still required. Nothing was published or deployed.

The October 26 afternoon production dependency audit reports zero advisories
across 425 dependencies with the unchanged lockfile. Package advisories, image
advisories and deployed exposure remain distinct evidence.

The finite internal queue is the remaining ordinary health business/payment/
marriage methods; determined charitable floor/history and zero/unique-origin
NOL attribution; actual academic-period room-and-board groups; and final
integrated, remote, native-image and recovery checks. Missing controlling
interpretations remain explicit. No allocation or taxpayer fact is invented to
remove a guard.

The goal remains active and **not release-ready**. The
[external-action handoff](upgrade-2026-external-actions.md) identifies missing
qualified reviewers, launch-state demand, authorized staging, provider account
access and approved evaluation funds, final official forms and advisory owner
acceptance. Work continues on the remaining independent software packages.

The inventory V2 closeout is clear at tree `674dd693`; all three delivered
file hashes match that reviewed tree. The separate report is
`facts-inventory-reconciliation-v2-review.json`, SHA256
`8c03578f2c3cebbb3da3b4ac4babba084b2afb58019965d2b9b4e9b79bb47bd8`.
The original finding and failed private control remain retained. The package
ledger accurately discloses the overwritten parent V1 output filenames; final
V2 logs and independent V1 reviewer evidence remain separately preserved.

## Previous checkpoint through3669b00

The branch is pushed through `3669b00`. Rule provenance is `2025.148` /
`2026.145-law-integration-draft`. The regenerated inventory has 523
entries and 5,526 spec test references. Readiness gates are unchanged.

| Delivered package | Commit | Bounded verification |
| --- | --- | --- |
| Actual covered-family premiums, original persons/payments and health deduction | `f25a2b7` | Final integration: 611 tests in 15 files. Separate source review: 23 tests in 7 files, including four private controls. Eight saved PDFs, 83 pages and 252 active fields were reopened; rendered pages and nine literal Form 8962 values were reviewed. Two production browser cases pass with zero retries. |
| Current charitable sources in regular and AMT loss origins | `3f2e80a` | Final candidate: 595 tests in 28 files; integrated checks: 551 in 6. Separate source review: 16 in 7, including five private controls. Forty saved PDFs, 95 pages and 235 populated fields were checked, including six literal Schedule A values; two production browser cases pass with zero retries. |
| Actual prepaid and cash QTP sources sharing tuition with ordinary ESAs | `3669b00` | Final candidate: 777 tests in 58 files, all types/spec/inventory checks, both builds and scoped lint. Separate source review: 12 tests in 7 files, including four private controls. Parent reopened six PDFs covering 124 pages and checked sixteen literal retained fields; physical browser outputs were also inspected. Both production browser widths pass with zero retries. |

Each package has its own specification, original failing cases, Decimal source
calculations, actual guided facts, saved review output and exact delivery
hashes. Final integration preserves the reviewed executable blobs and records
any upstream merges separately. Agent reviews do not supply qualified human
tax approval. The package ledgers retain all original failures and boundaries.

The most recent completed full local run remains immutable `e91d7d7`: 19,025
tests in 1,197 files pass in both unit and coverage runs; branches are 86.84%
and functions 90.59%, above the unchanged gates. All eight static checks and
428 production browser cases pass; five hosted-only cases remain skipped.
That source excludes these later packages. A new immutable integrated run is
running on `3669b00`; no later full pass is claimed before it finishes. The earlier
failed `603fc1b` run and its separate template-count repair remain recorded.

Native amd64 Web workflow
[40347754615](https://github.com/utilityfueled/tax-engine/actions/runs/40347754615)
passed on `8f1d1ba`; its [versioned evidence](upgrade-2026-runtime-8f1d1ba.json)
was committed in `cd5e4c7`. Smoke, six recovery phases and both 428-case browser
runs passed; each browser run skipped five hosted-only cases. The separate CI
workflow passed 19,044 unit tests, but coverage was cancelled by the next push.
Its SBOM has 2,930 components. The refreshed scan's 157 matches across 67 OS
advisories exactly match the existing register; owner confirmation remains
pending. This evidence predates the later tax packages and is not final-source
or hosted-staging qualification. No image was published or deployed.

The October 26 afternoon production dependency audit reports zero advisories
across 425 dependencies, with the unchanged lockfile. Audit and image findings
remain separate evidence. Exact response, log and artifact hashes are recorded
in the checkpoint and package ledgers.

The finite internal queue is: the remaining ordinary health payment, business
and marriage combinations; determined charitable floor/history attribution;
actual tuition-assistance and academic-period room-and-board groups; traceability
reconciliation; and final integrated, native image and recovery checks. Missing
controlling interpretations remain explicit. No arbitrary source allocation or
inferred fact is used to remove a gate.

The goal remains active and **not release-ready**. The
[external-action handoff](upgrade-2026-external-actions.md) records the missing
qualified reviewers, launch-state demand, authorized staging, provider account
access and approved evaluation funds, final official forms and advisory owner
acceptance. Work continues on the independent software packages.

## Previous checkpoint through5b3d6de

The branch is pushed through `5b3d6de`. Rule provenance is `2025.145` /
`2026.142-law-integration-draft`; the regenerated inventory has 517 entries and
5,486 spec test references. All readiness gates remain unchanged.

| Delivered package | Commit | Exact bounded verification |
| --- | --- | --- |
| Known annual same-asset donation appraisal group | `c078ce0` | Wider753tests/53files; separate13/7 recheck retains the original failing probe, exact5000 and5000.01 controls, original basis values and recipient grouping. |
| Deceased claimant residence and separate spouse periods | `5702c78` | Original1581/154; final569/14, all types/spec/inventory/builds/lint0; separate12/4 including4private controls; final browser2/2. Two independently reopened PDFs,32pages/eight literal fields, rendered review and source controls inspected. |
| Original K1 and crypto sources in charitable NOL replay | `8d97c0f` | Original867/92; final872/93 plus43readiness controls; separate14/7 including4private controls; browser2/2.54PDFs/118pages/253fields including15literal ScheduleA fields, with separate visual review. |
| Actual digital-asset gift interview, saved return and NOL history connection | `e91d7d7` | Wider733/53; final795/63, all types/spec/inventory/builds; separate20/9 including9private controls; final browser2/2. Seven independently reviewed PDFs/91pages/21literal fields plus two final browser downloads. Missing basis remains unknown and explicit zero survives. |

The shared-method inventory correction is `e3dcc3f`: 544 tests in five files,
types/spec/inventory and lint pass; separate review passes 328 tests in 44 files
and checks all 40 associations and 79 spec-owned references. Invalid manifests
fail without overwriting output. Exactly 40 of 517 inventory rows change, with
no new fully-supported status or qualification flag. The
[package ledger](upgrade-2026-inventory-links-work.md) retains the exact evidence.

All browser cases above use zero retries. Package ledgers retain original
failures, exact source hashes, artifact evidence and review limits. The guide's
initial browser import failure and sandbox listen denial remain recorded. Its
new NOL presence regression reproduced the missing independent-history check
before the one-line correction. Separate agent review does not establish human
tax qualification, final forms, staging or release readiness.

The immutable `603fc1b` full run completed: all eight static checks passed,
18,992 unit tests passed and one failed; coverage repeated that same single
failure. The PDF registry assertion still expected43templates after Form8862
added the44th. `eca2e6a` corrects the count and explicitly requiresForm8862 while
retaining every exact-byte check; eight focused tests pass. The603fc1b archive
remains unchanged and its failed full results are preserved. No successful
coverage percentage is claimed for that failed run. All422local browser cases
passed, with five hosted-only skips, zero retries and two workers. All3155
tracked source hashes stayed unchanged and the task server port is closed.
Evidence: `.local/upgrade-evidence/603fc1b-complete/{verification,summary}.json`.

The immutable `e91d7d7` full run passes all eight static checks and all
19,025 tests in 1,197 files in both unit and coverage runs. Branch coverage is
86.84% (49,222/56,676); function coverage is90.59% (10,765/11,883). All unchanged
thresholds pass. The production browser passes428cases with zero retries and
five hosted-only skips. All3,187tracked source hashes remain unchanged and
port3254 is closed. Evidence is
`.local/upgrade-evidence/e91d7d7-complete/{verification,summary}.json`; coverage
log SHA256 is `014944ef23b1409e6e909f8aaa377d649396ca2f0dd2e7ee6b01a40713ce7db6`.
The later inventory tooling has separate bounded checks. Later tax packages,
final-source integrated checks and completed remote workflows remain due.
Hosted skips do not establish staging readiness.
The October26 production dependency audit on603fc1b reports zero advisories
across425production dependencies. It is separate from the final image/OS scan,
owner acceptance and recovery requirements.

Active internal work: actual partial-coverage-family health and remaining
ordinary payment/marriage methods; current-loss-origin charity and determined
floor/current-prior methods; remaining bounded cash/category education methods;
remaining traceability reconciliation; and final integrated, remote, image,
security and recovery verification. Known controlling-interpretation questions
remain explicit and are not replaced with guessed allocations.

The [external-action handoff](upgrade-2026-external-actions.md) identifies the
required people, access, decisions and evidence without asking the owner to
choose tax formulas. Internal work continues while those inputs are pending.

The active goal is **not complete or release-ready**. Qualified human reviews,
provider account access and approved funds, authorized staging, launch-state
demand, final forms and advisory acceptance remain unresolved. Approved public
branch pushes continue. Production deployment, filing and model promotion remain
unavailable without their required authorization and evidence.

## Previous checkpoint through603fc1b

The branch is pushed through `603fc1b`. Rule provenance is `2025.141` /
`2026.138-law-integration-draft`; the regenerated inventory has 513 entries and
5,455 test references. All readiness gates remain unchanged.

Five further packages complete the ordinary source methods below. Their ledgers
retain the original failing cases, immutable snapshots, separate reviews and
saved artifact checks. These follow the eight packages recorded under b0de955.

| Delivered package | Commit | Exact bounded verification |
| --- | --- | --- |
| Distinct original prepaid QTP sources with one ordinary ESA | `c6df682` | Wider 889/69; final 504/9 including readiness; separate review 10/6 with four private controls; two browser passes; 19 PDFs, 64 pages and eight literal fields. |
| One original prior charitable category/vintage with regular and AMT NOL | `405d914` | Wider 1,086/97; final 497/11; separate review 17/7 with five private controls; 39 PDFs, 83 pages and 227 literal fields. Actual regular QBI stays unchanged in the AMT replay. |
| Separate actual health plans and taxpayer owners | `9eafb45` | Wider 767/62; final 533/10; separate review 13/7 with four private controls; nine PDFs, 35 pages and twelve literal fields. |
| Multiple original QTP and ESA accounts sharing actual tuition | `74bf948` | Wider 898/74; final 510/10; separate review 12/6 with five private controls; two browser passes; 19 PDFs, 67 pages and eight literal fields. Each original ratio and actual allocation remains separate. |
| Current Form 8862 sources, eligibility, interview and physical review | `603fc1b` | Integration 1,646/154 plus 24 readiness cases; final main 521/7; root/contracts/web types, spec, inventory, both builds and lint pass. Separate core review 19/3 and follow-through review 39/5; four PDFs, fourteen pages and 36 literal fields. Fourteen EIC browser cases and two rebased downloads pass with zero retries. |

All listed saved pages were rendered and inspected. The Form8862 browser found
and corrected the born/deceased-child review-checkbox mismatch before delivery.
Its later PDF assertion normalizes spacing only within the official three-cell
comb field, retaining the exact row count and value. No deadline, coverage,
privacy or readiness threshold was relaxed. Separate agent reviews do not count
as qualified human tax review.

A fresh full run is active on immutable `603fc1b` (tree `22f2f6b6`), using 3,155
tracked source hashes, synthetic local PostgreSQL and an owned loopback browser
server. Types, specs, inventory, both builds and lint have passed; full unit,
coverage and browser results are pending. Evidence is under
`.local/upgrade-evidence/603fc1b-complete`. The last completed full run remains
`d898091`: 18,843 tests/1,125 files, branches 86.84%, functions 90.77%, and
402 browser passes with five hosted-only skips. It excludes the thirteen later
source packages and cannot establish their integrated coverage.

The October26 production package audit reports zero advisories across 425
production dependencies on603fc1b. Current603fc1b remote CI/Web were observed
in progress; the preceding74bf948,9eafb45 and405d914 runs were cancelled by
later pushes. Neither a completed current remote result nor a new image scan is
claimed. Final-source images, recovery and advisory acceptance remain due.

Active internal work is partial-coverage-family health sources and the remaining
ordinary payment/marriage methods; actual deceased-claimant short-year residence;
original K1/crypto charitable NOL sources, crypto donation intake, current-loss
origin and remaining determined charitable floor methods; and the remaining
bounded education methods. Support/inventory mapping, final checks, images and
recovery follow. Missing controlling interpretations remain explicit questions,
not guessed allocations or completed features.

The goal is active and the upgrade is **not release-ready**. Qualified human
reviews, provider account access and approved budget, authorized staging,
launch-state demand, final forms and advisory acceptance remain unresolved.
Public upgrade-branch pushes are approved. Production deployment, filing and
model promotion remain disabled/unauthorized.

## Previous checkpoint throughb0de955

The branch is pushed through `b0de955`. Rule provenance is `2025.136` /
`2026.133-law-integration-draft`; the regenerated inventory has 503 entries and
5,389 test references. All readiness gates remain unchanged.

All required local checks pass on immutable `d898091` (tree `23f7a5fe`):
18,843 tests in 1,125 files, root/contracts/web types, spec and inventory checks,
engine/web builds and lint. Coverage passes the unchanged thresholds: branches
86.84% (47,523/54,722), functions 90.77% (10,423/11,482), statements 92.03% and
lines 94.63%. Production browser checks pass 402 cases with zero retries; five
hosted-only cases remain skipped. The task server was stopped, and all 3,009
tracked source hashes remained unchanged. Exact commands, timestamps and hashes
are in `.local/upgrade-evidence/d898091-complete/verification.json`. This source
excludes the eight subsequent source packages below.

| Delivered package | Commit | Exact bounded verification |
| --- | --- | --- |
| Actual EIC denial/allowance chronology prerequisite | `60611f3` | Corrected source 576/7; integration 601/10; separate unchanged review controls 15/2. Canonical and guide follow-through is `b41f628`; current Form8862 remains unfinished. |
| Shared Marketplace health payment/person sources, actual guide and review | `0b65e34` | Wider 948/53; final 516/11; separate review 55/11; desktop/mobile 2/2; six PDFs and 34 pages. Review exposed and corrected source-reconfirmation reachability. |
| Current single-category regular/AMT charitable NOL carry | `360f340` | Wider 379/81; final 34/14; separate review 25/9; 27 PDFs and 48 pages. Original categories and distinct regular/AMT sources remain bound. |
| Distinct actual prepaid tuition benefits, assistance and credits | `374e117` | Final 1,081/156 plus 25 readiness cases; separate source review 11/6 and corrected-delta review 11/3; 18 PDFs, 38 pages and 21 literal fields. |
| Default/no-advance shared-health allocation and payment sources | `15549f8` | Final 473/5; separate review 11/5 including five private controls; desktop/mobile 2/2; six PDFs, 33 pages and 18 fields. Exact thirds remain separate from printed .67. |
| Actual EIC history, canonical restrictions and complete guided records | `b41f628` | Final 1,619/148; separate canonical review 11/2 and guided review 17/4; twelve production browser cases with zero retries; types, spec, lint and build pass. |
| Shared and household-only originals in one health plan | `827b399` | Wider 724/55; final 499/16; separate review 11/5 including five private controls; desktop/mobile 2/2; six PDFs, 36 pages and 32 fields. |
| Multiple tuition expenses with actual QTP/ESA allocations | `b0de955` | Final 882/64 plus 24 readiness cases; separate product review 10/6 and final spec/test controls; desktop/mobile 2/2; 19 PDFs, 61 pages and eight fields. |

Package ledgers retain original failures, exact snapshots and scoped review
limits. All listed saved pages were rendered and inspected; all browser cases
used zero retries. The final education assertions distinguish the browser's
actual Medicare withholding from the separate inherited source fixture and wait
for the settled refund. Its lint has zero errors and 98 warnings, primarily new
synthetic-fixture non-null assertions. No threshold, deadline or privacy gate
was relaxed, and agent review is not qualified human tax review.

Current `b0de955` CI and Web were observed in progress; the preceding three
heads were cancelled by later pushes. No completed current remote result is
claimed. Earlier package audits and `76e3538` local runtime/recovery/scan evidence
remain separate; final-source artifacts and advisory acceptance are due.

The active internal queue is ordinary independent health plans/multiple owners;
actual current Form8862 sources, calculation, guide and review; single-prior-
vintage charitable NOL and remaining mixed/floor source methods; and distinct
actual prepaid QTP statements sharing one ordinary ESA. Other bounded education
methods and controlling interpretation questions remain in their source ledgers.
Guards and prerequisites do not complete those end-user methods. Final integrated,
remote, runtime and recovery checks follow these deliveries.

The goal is active and the upgrade is **not release-ready**. Human reviews and
controlling interpretations, provider account access and approved budget,
authorized staging, launch-state demand, final forms and advisory acceptance
remain unresolved. Public upgrade-branch pushes are expressly approved.
Production deployment, filing and model promotion remain disabled/unauthorized.

## Earlier package evidence

These records retain the scope known at each package. Later delivery references
and the current method queue supersede older work-in-progress labels.

- `b56402c`: actual assistance passes 426 cases/34 files, 26 readiness cases,
  root/web types, 4,898 references and both builds; separate source review passes.
- `3e9164`: ordinary K1 classification passes 375 cases/22 files, root/web types,
  4,907 references and corrected independent review. The NFT creator source
  omission found in review was fixed before commit.
- `6a90c81`: recipient classification passes 661 cases/64 files, root/web types,
  4,913 references and six browser cases with zero retries; four independent
  probes verify percentages, basis, unknown legacy answers and private context.
- `b2f3796`: marriage source prerequisite passes 138 cases/7 files, root/web
  types, 4,905 references and four independent probes. The final rebase passes
  112 cases/5 files and root types. Canonical election integration is separate.

- `266aee3`: actual K1/QBI source integration passes 846 cases in 62 files,
  root types and 4,878 spec references. Independent source and SE reconciliation
  reviews pass; the actual guided collector is still in progress. See the
  [QBI ledger](upgrade-2026-qbi-loss-work.md).
- `c89c81c`: prior cash/current property passes 388 cases in 48 files and nine
  independent cases; the final rebased cohort passes 55 cases in 13 files,
  root/web types and 4,883 references. See the
  [carryover ledger](upgrade-2026-prior-cash-current-property-work.md).
- `dd1ef96`: the pure marriage worksheet prerequisite passes 159 cases in
  14 files, root/web types, 4,891 references and lint with zero warnings.
  Independent review passes existing/package checks and three new probes.
  Actual source intake and canonical election activation remain separate. See
  the [marriage ledger](upgrade-2026-marriage-worksheets-work.md).
- `36cd922`: current public-cash candidates pass 371 tests/39 files, root/web
  types, 4,838 references and eight independent agent cases. See the
  [candidate ledger](upgrade-2026-current-charitable-candidates-work.md).
- `675f5ba`: actual shared-policy collector passes 832 tests/94 files, all types,
  two production viewport flows and nine independent cases; 23 final rebase cases
  and 4,845 references pass. See the [intake ledger](upgrade-2026-guided-shared-policy-work.md).
- `b18e8e9`: current public cash/ordinary property passes 375 tests/42 files,
  root/web types, 4,849 references and eight independent cases. See the
  [property ledger](upgrade-2026-current-charitable-public-property-work.md).
- `f2d0faa`: actual public-cash carryovers under nonitemization pass 1,009
  cases/69 files, root types, 4,833 spec references and scoped lint. Two separate
  reviewers each pass 11 cases, including exact cents, FIFO/expiry and original
  identity/history binding. See the [carry ledger](upgrade-2026-nonitemizer-carry-work.md).
- `ec05989`: actual tuition credit allocation and recipient identity pass178final
  cases/23files, root types and4,825spec references. Independent review passes39
  cases plus nine controls; both saved reference pages are inspected. See the
  [education ledger](upgrade-2026-in-kind-credit-work.md).
- `d9cccd5`: shared-policy core/PDF passes220cases/25files, all three type checks,
  4,817references and separate10-case/six-control review. Both physical pages and
  nine reference pages are inspected. Guided actual-source intake continues.
- `6029f70`: explicit2026 nonitemization passes1,845cases/130files, types/spec/build,
  independent review and two browser cases. Pure-G prior-carry integration follows.
- `2d1b9bb`: QBI-loss helpers pass262cases/9files and separate14-case review.
  Canonical source integration remains unfinished; helper tests do not complete it.
- `51b7182`: actual allocated QTP expense capacity passes49final cases/7files,
  types/spec/lint and five independent controls. Unallocated spending no longer
  reduces the exclusion on actual distributions.
- Actual refund intake passes 903 tests in 90 files, root/web types, 4,732 spec
  references, build and both desktop/mobile flows. Independent 11-case review
  includes the corrected prior-recovery and prior-NOL omissions. See
  [the refund ledger](upgrade-2026-refund-intake-work.md).
- `9ce1686` passes 228 charitable tests in 27 files and 21 metadata cases;
  `6cf0463` passes 460 tests in 44 files and 32 final integration cases. Eight
  independent mixed-media cases and saved-PDF reopening/rendering pass. Partial
  mixed-media, 2026 prior/nonitemizer/floor and prior/mixed-NOL methods remain.
- Vehicle core `2baa03c` passes 72 final cases with exact Decimal source
  conservation and separate source review. Guided `da7fc1c` passes 795 adjacent
  cases, 52 final cases, root/web types, build and two browser flows without
  retries; separate five-case review passes. See the
  [core](upgrade-2026-vehicle-refinancing-work.md) and
  [intake](upgrade-2026-vehicle-refinancing-intake.md) ledgers.
- Adoption core `998d55a` passes 151 final focused/strict/metadata cases and
  separate 15-case canonical review. Guided `d153020` passes 389 final cases,
  root/web types, 4,769 spec references and separate 11-case review; its earlier
  broader snapshot passes 889 cases, build and two browser flows without retries.
  Benefits-only PDF/context integration is committed in`6f2b577` with89final cases and27independent review cases. See the
  [history](upgrade-2026-adoption-history-work.md) and
  [intake](upgrade-2026-adoption-intake-work.md) ledgers.
- `f006285`: actual debt-cancellation intake passes795tests/84files, both
  type checks,4,678spec references, production build, two desktop/mobile flows
  and11independent review cases. All source/year/readiness gates are retained.
- Full unit integration of committed `fab31fe` with the regenerated396-entry
  inventory passes17,787tests/927files, zero failures/skips, in473.55seconds.
  The inventory is committed in `59eae66`. Its refreshed package audit has
  zero advisories across 521 locked entries; later charity/COD guided work is
  excluded from this run.
- `b31b5df`: browser and CI commands use the shared pinned PDF-reader
  prerequisite. Both unchanged download cases and 28 unit-path cases pass;
  separate argument/environment/failure-path review passes. The original
  failed run is retained historically; the later907b6db full run passes348cases.
- `9d71c5f`: capital-origin guided collection passes 795 adjacent tests,
  32 post-COD integration checks, types/build and both desktop/mobile cases.
  Separate source/DOM review passes; screenshots are inspected.
- `bb5cbe6`: actual insolvency sources reduce independent regular/AMT loss
  vintages after current tax. The package passes 713 tests in 34 files,
  root/web types, 4,665 references and separate 16-case review. Four saved
  pages were rendered and inspected. Actual guided collection is committed in `f006285`.
- `4aef633`: actual PA digital-asset basis and separate OH withholding sources.
  Exact4,264 tests/154files, roottypes,4,634 references and lint pass; parent12
  independent source cases and three rendered reference pages pass. Guided
  collection remains active, with no launch-state selection inferred.
- `b5a0675`: indexed reopened PDF fields remove repeated tree traversal while
  retaining every original assertion, field-type check and deadline. Four
  exact cases and four independent cases pass with types/lint.
- Full immutable coverage on`4aef633` passes17,754tests/918files with zero
  failures/skips and86.98%branches against the unchanged85%gate. All three type
  checks,4,634spec references,392-entry inventory, both builds and lint pass.
  Full production browser checks finish340passes/5hosted skips/2missing-reader
  failures; both affected cases pass with the pinned Python reader. Arm64 image`535c87589d0d`built
  after one proven task-owned obsolete cache chain was removed to resolve
  disk exhaustion. A second selected cache was in use and was preserved.
  Smoke and six-phase recovery pass. Refreshed scan retains the identical157
  OS matches/67advisories,0critical/0npm/0available fixes. Acceptance is pending.
  See `upgrade-2026-runtime-4aef633.json` for exact image binding and hashes.
- The [entry-path audit](upgrade-2026-enabled-scenario-audit.md) passes64gate
  cases and corrects stale self-host persistence instructions. Review caught
  omittedDA records in the ScheduleD copy action and generic-state withholding;
  both are fixed in `a66b5de` (781tests,2browser cases,11independent cases).
  Corrected charity reporting is committed in `9015b41`:27parent review cases,
  1,476broad cases and476final rebase cases pass. Actual charitable history
  work includes three newly reproduced2025 gift qualification/year defects.
  The source correction then exposed five more parent-review failures on
  `7dac725`: legacy current-only private limits/property basis, empty-history
  arithmetic invariance, and original-identity review binding. All are fixed in
  ea2f422 and the unchanged five parent probes pass; original failed evidence is retained.
- `678fe38`: source-bound positive1202 current origins where the printed and
  statutory traces reconcile. Final12 affected cases,571 adjacent cases, root/web
  types and4,614 references pass after the separate reader repair; parent13-case
  review and four rendered pages pass. The negative-net interpretation stays
  disabled pending a qualified tax reviewer.
- `f5b096f`: actual positiveATNOL and current public-cash charity coordination.
  Final812 tests/89files, root/web types,4,624 references, build, two production
  browser cases with zero retries and rendered review output pass. Separate
  parent11-case and federal12-case reviews pass. Prior/mixed sources remain next.
- `905d219`: originalDA long-term sources bind exactly once beside original
  B/QSBS indexes. Reviewed1,239 tests/24files and final20 source/metadata tests
  pass, with18 independent cases plus a combinedQSBS/DA probe.
- `81668db`: readiness now flags missing8949 detail for originalDA-only returns,
  including zero gain. Exact27 tests plus22 independent cases pass; qualification
  gates are unchanged.
- `e7bd6e8` and `5006088`: actual original1099-DA source records, once-only
  Box4 withholding and all twelve Form8949 reporting categories. The source
  core passes646 adjacent tests and eight independent review cases after a
  reproduced legacy fallback defect was fixed. Exact reporting tree`91a28cb1`
  passes1,756 tests in145 files, root/web types,4,603 spec references, both
  builds and lint with zero errors. Independent review passes six new cases
  plus a mixed QSBS/DA probe. Fourteen-page reopening, all category widgets,
  redacted identifiers, printed ScheduleD totals and rendered pages pass.
  Original document adaptation is committed in `119ff16`, with 785 tests in
  79 files and independent 14-case/12-case source reviews. The state handoff is committed in`4aef633`; guided intake remains active.
- `3ff896c`: actual ordinary investment sources in current Form172 origins.
  Reviewed tree`7c2a2185` passes649 tests in21 files, root/web types and4,583
  references; four review pages reopen/render. Independent review passes12
  cases and four literal/adversarial probes. Guided capital-origin collection remains active; positive1202 origins are
  separately committed in`678fe38` within their reconciled-net boundary.
- `8cf0e8e`: actual current-year loss-origin collection. Final integrated tree
  `1dd40361` passes773 tests in79 files, root/web types,4,568 references, build,
  and desktop/mobile Chromium with zero retries. Six independent source/UI
  review cases pass; actual saved zero/false/unknown values remain distinct.
- `f4da2a6`: evaluation uses actual application schemas, complete corpus/request
  provenance and the actual reported model identity. Both reproduced review
  defects are fixed. Exact tree`449010cb` passes105 tests; parent passes49
  checks plus four adversarial controls. All240cases remain human-unreviewed
  with zero live measurements.
- `b828ee4`: refreshed official provider prices, capabilities and lifecycle
  evidence. GPT-5Mini dispatch stops on2026-12-11; post-shutdown imports cannot
  qualify, while known cost is retained. Five public profiles still have
  unverified account availability.106 isolated tests and separate18-case/probe
  review pass. No provider call, budget approval or promotion is inferred.
- `0834e46`: actual separate-owner IRA history/account/source binding. Exact
  `c5298060` passes319 tests in27 files; separate16-case/probe review and four
  reopened/rendered Form8606 pages pass. Guided intake is committed in `9e80414`:
  `b870ac65` passes890 tests in86 files, production build, both desktop/mobile
  cases with zero retries and eight independent review cases/probes. Screenshots
  were inspected. Final integrated tree `e55725a3` passes13 focused source/intake
  tests and web types with identical reviewed product blobs.
- `029d5d9` and `a38c41e`: actual mortgage points and prior tax-benefit recovery
  collectors. Exact packages pass931/1228 tests, seven/eight desktop/mobile
  browser cases with zero retries, and separate15/six-case source reviews.
- `febaf9c` and `e74436b`: actual current regular/AMT loss origins and ordinary
  itemized sources. Exact packages pass320/372 tests and separate11/16-case
  reviews; three-page review statements are reopened/rendered. Review caught
  second-home prior points bypassing the AMT dwelling boundary; the corrected
  package includes the original regression. Remaining named origin methods stay
  internal work, distinct from missing taxpayer facts and human qualification.
- `7b7b761`: Form172 computational amounts retain exact cents separately from
  reported whole dollars. Exact `656c8eb3` passes47 tests in10 files, root types
  and4,561 references; independent source review passes ten cases/probes. The
  published historical1,775 example is unchanged. This prerequisite does not
  enable a new capital-origin source method or qualify filing.
- `f08eb0c` and `556cfe4`: approval-bound provider executor and actual application
  contracts. Exact packages pass123/272 tests and parent44/24-case reviews.
  Journal aliases, approved-policy mutation, fabricated source text and
  unrestricted unsupported-route readiness prose were reproduced and fixed.
  Actual evaluator binding and the reproduced stale-corpus/model-identity defects
  are now corrected in`f4da2a6`. No live provider calls or
  independently reviewed corpus results exist; all240 cases remain draft.
- `d078cf4`: direct pinned browser-safe SHA256 dependency, matching the existing
  transitive2.4.0 version. Strict frozen peers, three reference hash comparisons
  and the refreshed package audit pass with zero findings across 521 entries.
- CI at `9da0bab` passes17,725 cases but fails one fourteen-page PDF timeout
  and stale inventory. The test lookup repair is committed in`b5a0675`; the regenerated inventory
  has397entries from`f006285`. The observed`59eae66` unit/type/lint/spec/build
  jobs pass; coverage/browser were still running before later pushes. The fresh
  package audit has zero findings across 521entries. Final-head full verification,
  runtime-image advisories/rehearsal and external qualification remain required.
  Full synthetic unit integration on isolated committed `5006088` passed
  17,723 tests in 907 files, zero failures/skips, in 382.79 seconds, with pinned
  Python/pypdf, sample downloads and disposable PostgreSQL. Later packages
  require final integrated coverage/browser/runtime checks.
- `9da0bab`: independent Form8949 reader now reopens saved bytes rather than
  waiting for stdin EOF. All four focused cases and independent diff review
  pass; no assertions, timeout or production code changed. See
  [the repair evidence](upgrade-2026-pdf-reader-repair.md).

The remaining internal queue includes ordinary Marketplace re-entry and shared
policy/marriage/owner methods, adoption review output, partial mixed-media and
2026 prior/nonitemizer/floor charity, prior/mixed NOL coordination, partial
in-kind education, mixed tips and non-rental/post-EBL QBI character. Then close
the enabled-scenario facts/calculation/review/readiness audit and run final
integration, native images and recovery checks.
The negative-net1202/Form172 overlap is a specifically unresolved interpretation,
not an invented zero or completed method. The user has no interpretation to
supply; the required next action is a qualified tax reviewer resolving the
specific $99,800 versus $100,000 NOL trace with controlling authority. The case
stays disabled while independent work continues. Deliberately unsupported special
methods remain identified in the federal and education method ledgers. Their
guards do not imply implemented support or external qualification.

- `cc10a79`: complete QSBS Form 8949 categories and continuation pages, fund-only
  Schedule D line 10 and verified 6251 preference, original-or-redacted identity
  context. Final tree `b7b564b7` passes 1,174 tests in 133 files, root/web types,
  4,437 references, production build and two desktop/mobile downloads with zero
  retries. Separate agent review and rendered-page checks pass. Human/final 2026
  form qualification remains closed. See `upgrade-2026-qsbs-pdf-work.md`.
- `d5d148b`: standalone Form 172 origin arithmetic. Exact `9fb209af` passes 71
  tests, root types and 4,454 references. Separate source/agent review passes
  four cases, including the published $1,775 NOL example. Canonical current-origin
  source integration remains active.
- `1791979`: 240 distinct synthetic draft AI cases replace the template
  cross-product, 30 per task and 80 fixed published held-out. Exact `40b251b0`
  passes 34 tests in four files, web types and 4,464 references; parent independently
  passes 28 cases. All 240 remain human-unreviewed, with zero live measurements.
  Guarded executor and actual application-schema bindings remain active.
- `ce607a2`: ordinary foreign-credit intake and separate regular/AMT review
  ledgers. Final tree `4ffff1fd` passes 30 tests, root/web types, spec/lint/build
  and two desktop/mobile cases with zero retries; prior production source tree
  passes 802 tests. Separate review passes six cases. Broader foreign methods remain.
- `c58a59d`: current charitable carry coordination with actual NOL absorption.
  Final calculation tree `b4d5945b` passes 877 tests in 21 files, root types and
  4,417 references. Parent independently verifies eight cases against section 170,
  regulations and literal counterfactuals. Positive ATNOL, prior/mixed charity
  and 2026 nonitemizer methods remain separate.
- `f7745f3`: actual continuing-rental passive carry intake. Final tree `23f1a441`
  passes 762 tests in 78 files; identical product source passes root/web types,
  4,423 references, production build/lint and two desktop/mobile cases with zero
  retries. Independent five-case review passes. Unknown AMT facts and source
  privacy remain intact.
- `91d2d56`, `0825893` and `3629ce0`: test-only repairs for literal browser spec
  names, four stale Schedule D audit strings and Python PDF reopening. Respectively
  six strict-reference checks, 56 workspace cases and two flatten variants pass;
  the PDF repair also passes in the 1,174-case final QSBS suite. No assertions,
  thresholds or readiness controls were weakened.
- Immutable `1791979` passes all 17,577 tests in 868 files (zero failures or
  skips) and full coverage at 86.91% branches against the unchanged 85% gate.
  Statements/functions/lines are 92.46%/91.23%/94.79%. All three type checks,
  spec/inventory, engine and production web builds, and lint pass (zero errors;
  4,315 warnings). The full production browser run passes 328 cases with zero
  retries; five hosted billing cases are skipped and supply no staging evidence.
  The checkpoint records exact logs and SHA256 hashes. Its 365-entry inventory,
  committed separately in `51d8c2e`, changes no existing support status. Package
  audit reports zero advisories across 521 locked entries. Later packages require
  their own integrated verification. Remote CI/Web at `d912b8f` were still running.
- `ba451d3` and `d912b8f`: actual mortgage balance methods and debt-category
  worksheets. Their isolated packages pass 762 and 769 tests respectively,
  root/web types, spec/build checks, separate five-case agent reviews and both
  desktop/mobile cases with zero retries. Points and recovery sources continue.
- `c7e8ff7`: completed Form 8606 monetary lines now round once after source
  aggregation. Exact tree `3a04cfed` passes 692 cases, root types, 4,470 references
  and separate 68-case/source review. Original source cents remain intact.
- `fc46b8d`: Roth homebuyer withdrawals reduce later contribution/conversion
  basis; line 25c uses actual qualifying repayments without an invented
  proportional tax cap. Exact `dc0edd0d` passes 696 cases, root types and 4,486
  references. Separate 220-case/source review plus a canonical repayment probe
  passes. These are software checks, not human retirement qualification.
- `5a3aab5`: canonical original-source QSBS exclusions on Form 8949, Schedule D,
  AMT and modified NOL income. Exact calculation tree `e4991d78` passes 2,195
  tests in 54 files, root types, 4,384 spec references and clean scoped lint.
  Separate agent review passes 21 cases plus two multi-lot probes. Review-PDF
  pagination/source privacy is now in `cc10a79`; filing stays closed.
- `3aed6e8`: actual QSBS issuer and lot intake. Production source tree `48022d71`
  passes 773 tests in 73 files, root/web types, 4,390 references, build/lint and
  both desktop/mobile persistence cases with retries zero. Final tree `47070a59`
  passes 12 source/canonical cases, root types and 4,410 references. Separate
  five-case agent review passes. Original unknown values remain unknown.
- `8638b5e`: actual ordinary passive foreign credits with independent regular/AMT
  allocations and carry histories. Reviewed tree `56b3659a` passes 1,886 tests;
  final `1feaef7b` passes 49 focused/metadata cases, root types and 4,404 references.
  Parent independently verifies 12 source cases and four allocation probes.
  Saved 6251 credit fields and rendered pages pass; intake/reference is in `ce607a2`.
- `1f771ba`: recompute actual NOL through ordered Marketplace health contexts.
  Exact tree `d8640c13` passes 1,165 tests in 75 files, root types, 4,371 references
  and lint with zero errors. Parent independently passes 11 cases, including
  retained IRA deductions, source preservation and the closed 2026 gate.
- `4925ce1`: actual regular/AMT NOL intake. Production source tree `684fce1f`
  passes 745 guided tests plus 20 consumers, root/web types, build/spec and both
  desktop/mobile cases with retries zero. Final tree `22358e53` passes 12 focused
  cases; separate five-case review passes. No loss origin or history is inferred.
- Remote CI at `8638b5e` reports four stale Schedule D audit-formula expectations,
  two browser test labels that do not resolve as literal spec references, and a
  stale inventory. Exact failure log: `.local/upgrade-evidence/remote-ci-8638b5-failed.log`.
  Audit/spec-label repairs are committed above; inventory is refreshed from
  `1791979`. No final remote pass is claimed.
- `65a9e9f` and `9889cba`: actual original QSBS sources and per-issuer,
  acquisition-date arithmetic. Source tree42d168bd passes121 tests in15 files,
  root types/4,356 refs/lint0; separate source review passes14 cases. Arithmetic
  tree0e28340c passes14 tests/root types/4,325 refs/lint0. Canonical 8949,
  Schedule D and AMT are now in `5a3aab5`; review exports remain active. Original
  transfer/changing-ownership methods remain explicit implementation work.
- `d89cbe5`: actual NOL income replays, separate regular/AMT vintages and NIIT
  origin fractions. Treee0798760 passes1,079 tests/59 files, root types,
  4,340 refs and lint0errors. Parent review reproduced and corrected overlapping
  capital-loss/1202 modifications;18 final review cases pass. Pub974 coupling,
  current-origin/charity/COD and other listed methods remain active work.
- `ec6505d`: direct foreign-credit source intake and retained-vintage reference.
  Treebc271d134 passes733 tests/72 files, root/web types and4,316 refs;
  separate7-case review and reopened/rendered2-page reference pass.
- `f6da5b2`: actual capital-source intake. Treea30d45d4 passes732 guided and13
  canonical/PDF checks, root/web types,4,317 refs, production build and both
  desktop/mobile cases with retries0. Parent review passes8 cases.
- `dec193d`: separate regular/AMT investment-interest intake. Production tree
  12ab089b passes740 checks/build/types and both desktop/mobile cases with
  retries0. Final ownedfd037cf9 passes types/4,356 refs/scoped lint0 and6 smoke
  cases. Agent review passes14 cases. Browser verification found and drove a
  red-first fix for child confirmation inserting untouched blank source cards.
  Actual NOL intake is now in `4925ce1`.
- `8da947a`: actual child income in regular/AMT investment interest. Final tree
  40f8bebbf passes69 tests, root types,4,311 spec refs and lint0errors/four
  existing warnings; prior source tree passes104 tests and independent agent
  review passes8 new cases. All four redacted PDF pages reopened/rendered and
  inspected. See`upgrade-2026-child-investment-work.md`.
- `a996dbc`: explicit source-bound section904(j) credit and separate unused
  regular/AMT prior vintages. Reviewed tree dbaee904 passes829 tests; final
  6b1fc0fd passes100 tests/root types/lint0errors, independent parent7cases.
  Printed6251 credit/TMT reopened and inspected. Actual source intake and a
  retained-vintage review record remain active; broader FTC methods remain.
- `35b8604`: original brokerage Box4 withholding once per source, including
  actual current-year open-short-sale facts.1,238 tests/root+web types/build
  pass,4,290 spec refs, independent3cases and2desktop/mobile browser cases
  with retries0. Actual source changes and original zero/unknown are retained.
- `2dbce45`: actual ScheduleD18/19 source binding, netting, regular/AMT tax
  worksheets and saved review fields.162 tests/root types/4,284 refs/lint0
  errors pass; independent K1/estate probe and two rendered pages verified.
  Actual section1202 issuer/acquisition history remains internal work.
- `ec6d25f`: actual QOF Yes/No/unknown source answer.723 tests/root+web types/
  build and4,274 refs pass; independent4cases and2desktop/mobile browser
  cases pass with retries0. Positive-event8997 method remains internal work.
- `b741741`: actual foreign-income/qualification source intake.765tests,
  root+web types/build and4,248 refs pass;2desktop/mobile source-persistence
  cases pass with retries0. No private source reference enters request bodies.
- Full coverage at `7695387` passes all 17,381 tests in 811 files, with zero
  failures/skips: branches 86.84%, statements 92.61%, functions 91.82%, lines
  94.81%. Thresholds are unchanged. Exact log/hash are in the checkpoint;
  later source packages still require fresh integrated checks.
- `ae7512d`: standalone Schedule D special-gain arithmetic. Exact source tree
  3fb202d5 passes 69 tests, root types, 4,259 spec refs and lint with no errors
  or warnings. Independent agent source/code review and seven cases pass.
  Source binding and canonical integration are now committed in2dbce45.
- `1ca69d0`: actual NOL vintage helper. Exact tree d8184932 passes 55 tests,
  root types, 4,252 spec refs and clean lint. Parent review passes 14 cases.
  Actual ordinary modified-income, AMT and NIIT integration is now d89cbe5.
- `f2d018d`: simplified foreign credit threshold uses $600 only for MFJ and
  $300 for surviving-spouse returns. Exact tree df5f53e4 passes 80 cases,
  types/spec/lint; parent verified five cent-boundary scenarios. An explicit
  annual election and original source integration are now committed in a996dbc.

- `13cb428`: saved guided progress and final-review exit. Tree cf15c75b passes
  246 unit cases in 4 files, web types/build, 4,229 spec refs, lint 0 errors,
  and all 38 cases in both affected browser suites. Independent agent review
  passes 210 adjacent cases. All five remote Web regressions reproduced first;
  actual readiness and source-year gates remain intact. See
  `upgrade-2026-browser-progress-work.md`.
- `65241a1`: ordinary aggregate state-source foreign deduction allocation.
  Tree 194447c9 passes 752 tests in 73 files, root/web types, 4,235 spec refs
  and lint 0 errors. Independent 6-case review and reopened/rendered 3-page
  reference pass. Actual no-tax/exempt jurisdictions and history are required.
- `2cfe47c`: preserve general and estate NOL carry sources and omitted-versus-zero
  selection. Tree aa48d9bf passes 541 tests in 5 files, root types, 4,227 spec refs
  and lint 0 errors. Independent 3-case review passes. Actual vintage limits
  and modified-income absorption remain a separate uncommitted implementation.
- `731c6f7`: reconcile raw foreign-income cents before display rounding. Prior
  source tree passes 577 tests in 10 files; final tree 23912aa3 passes 6 focused
  calculation/metadata cases, root types and 4,224 spec refs. Versions now advance
  through 2025.54 / 2026.50 with the NOL prerequisite; filing gates stay closed.
- `bd83a40`: Form8814 rounded ratios and signed line12/NIIT/4952 transfers.
  Exact tree7a333580 passes584tests in10files plus3rule-pack checks, root types,
  4217spec refs and lint0errors/1existingwarning. Independent agent4case review
  and reopened/rendered negative-remainder reference PDF pass. See
  `upgrade-2026-child-rounding-work.md`.
- `d6ef0e0`: actual8949A/B/D/E columns and ScheduleD4/5/6/11/12/14subtotals,
  printed decision flow and unknownQOF answer. Tree52b0b201 passes1320tests in
  124files, root types/4217refs/lint0errors. Four rendered pages, reopened fields
  and widget appearances pass. See`upgrade-2026-schedule-d-mapping-work.md`.
- `8bbeef2`: bounded saved-file PDF inspection replaces an observed stdin-EOF
  stall. All8existing Marketplace PDF cases pass with assertions preserved.
- `4c7152c`: ordinary rental allowance precedes the remaining Pub974 ordered
  deductions, with ordinary recomputation after final ineligibility. Exact
  treea33c5b9e passes779tests in24files plus3metadata cases, root types/4213refs.
  Parent independently passes8literal source cases; lint0errors/4existingwarnings.
- `085a0bf`: compare actual state taxable income with taxable US residual before
  state deduction. Tree291c016f passes576tests/15files, root/web types/4205refs,
  lint0errors; independent8case review and saved2page PDF pass. The earlier
  charity fixture in3598c47 is superseded: coherent state70000/foreign15000
  source now yields country1029/257, limit3590, absorption2990, remaining1010.
  Unsupported state/federal differences reject; aggregate-state work continues.
- `0e68dc0`: actual2555owner/year/original source binding. Treea7583ad8 passes
  574tests/9files, root types/4202refs/lint0errors; independent8case review passes.
  The rounding correction is now731c6f7; guided intake remains active.
- `7441a20`: ordinary passive losses are limited before Social Security, IRA
  and savings-bond worksheets. Tree779fc74a passes788tests in11files, root types
  and4,194spec references. Parent independently verifies four income/allowance
  examples and three regressions. Pub974 passive coordination stays separate.
- `0f408af`: actual child Alaska/investment character and child capital
  distributions netted before parent loss limits/carryovers. Immutable tree
  `67523f93` on base65336f7 passes17,326tests in797files, root/web/contracts types
  and4,184spec references. Independent agent review passes70cases. A saved
  two-page review PDF was reopened and visually inspected. Positive child
  special gains remain gated until actual ScheduleD18/19 netting is complete.
- `3598c47`: actual single-state/country foreign carryover deduction allocation.
  Tree71334841 passes737tests in69files, root/web types and4,184spec references;
  independent review passes24source cases plus the canonical saved-PDF case.
  Its original charity comparator and3632/3032/968artifact are superseded by
  085a0bfabove; those historical values must not be used as current evidence.
  Multi-state/nonoverlap methods remain internal work.
- `65336f7`: original suspended QBI vintage and SSTB/loss ordering corrections.
  Treeb5e2bd30 passes1,050tests in19files, root types and4,177spec references;
  focused coverage93.97%branches/100%functions. Parent independently passes94
  cases. Qualified prior losses are not multiplied by the current SSTB fraction.
- `4d85eb0`: actual8801source intake. Tree09e0d210 passes848tests in66files,
  root/web types and4,164spec references; independent review passes6cases.
- `c20a6c2`: foreign deduction-year carryover intake and review record. Tree
  50e350a passes720tests in63files, root/web types and4,158spec references;
  independent review passes10cases. Saved PDF confirms127remaining/73absorbed.
- `f4ce992`: foreign deduction-year carryover calculation.900focused cases and
  61independent review cases pass; source/evidence is in the foreign-tax ledger.
- `1c83819`: actual2210source intake.890focused cases pass; actual dated payment
  and worksheet evidence stays separate from inferred annual payment amounts.
- `60d61d3`: PA fixtures and explicit missing-activity-name diagnostics correct
  the14PA integration failures from remote b3f0362;186focused cases pass.
- Earlier child packages b3f0362/55c07e7/a79959a cover actual election eligibility,
  intake and child-only PDF source labels. Intake includes two desktop/mobile
  production Chromium checks. Source and limitations remain in their ledgers.
- Earlier NIIT, Marketplace, passive/PTP and education packages remain recorded
  in the federal/facts/AI ledgers and historical sections below. Agent review
  never substitutes for independent human qualification.

Current8da947a CI40217507356 is running and Web40217507374 is queued as
observed after push. Earlier35b8604/2dbce45 CI failed; their Web runs were
cancelled by newer pushes. The earlier6728ed2 run passed17,411 tests and failed
two stale QSS600 threshold expectations, corrected red-first in a996dbc.
No current remote success is claimed. Generated inventory still needs
regeneration. Parent owns final integrated checks/native release rehearsal.

The latest completed full coverage is the fixed `7695387` run above. Package
checks after that commit are scoped evidence until a fresh full run. Package
audit refreshed 2026-10-25 reports zero advisories across 521 entries. Older
runtime images have 157 matches and 67 advisory records, owner roles and a
2026-11-07 expiry; maintainer disposition and final-image scans remain pending.

Immediate internal work: actual section1202 history, positive special-gain and
child4952 intake; canonical NOL/AMT/NIIT, remaining Marketplace/PTP/QBI and named
education methods; actual direct-FTC intake/review record and remaining foreign
methods; QOF/property source methods; qualified form/export gaps. Final full
coverage, inventory, builds, browsers, recovery, native images and current scans
remain required. External staging/provider/human-review/state-demand/final-form
gates stay closed. Internal method gaps are implementation work, not external
qualification blockers.

## Refreshed baseline — 2026-10-24

- [x] Read AGENTS, execution brief, progress and machine checkpoint.
- [x] Fetch origin: `48e872f` equals `origin/upgrade/2026-baseline` (0 ahead/behind).
- [x] Preserve unrelated untracked `docs/reviews/`.
- [x] Use Node `.local/toolchain/node-v24.22.1-darwin-arm64/bin` and pnpm 10.34.8;
  the interactive shell defaults to Node 22 and must not supply release evidence.
- [x] Refresh npm audit: zero advisories across 488 dependency entries, evidence
  `.local/upgrade-evidence/audit-resume-live.json`. No OS-image conclusion implied.
- [x] Refresh IRS Rev. Proc. 2025-32, Schedule A and 8812 instructions, AFTR
  Publication 6079 (May 2026), SSA wage bases and Publication 4557 (May 2024).
  The generic Schedule A/8812 instruction pages still identify 2025.
- [ ] Inspect current remote CI and run required workflows on this branch.
- [x] Frozen offline lockfile/strict-peer check in an isolated manifest copy;
  no checkout dependency or lockfile change. Sentry 11 reviewed separately in
  `upgrade-2026-telemetry-review.md`; version 10.76.2 retained.
- [ ] Scan final runtime images with current vulnerability data; document any
  unresolved exposure with owner and expiry.
- [x] Raise branch coverage to at least 85% using meaningful tests: immutable `5d32549` passes all 16,770 tests with 86.50% branches. Every newer
  integrated commit and the final release still require fresh verification.

## Packages and file ownership

| Package | Owner | Evidence and remaining work |
| --- | --- | --- |
| Federal law | `federal_law` agent | `upgrade-2026-federal-work.md`: immutable rules, year-aware refunds/carryovers, all remaining federal provisions; spec first and independent human review pending. |
| Taxpayer facts | `complete_facts` agent | `upgrade-2026-facts-work.md`: explicit source facts, zero/unknown handling, eligibility/residency/year validation, Decimal adapters/UI. |
| AI/billing/eval | `ai_billing` agent | `upgrade-2026-ai-work.md`: task routing, provider availability/prices, atomic exact ledger, corpus/evaluation and reversible rollout; live spend and human review pending. |
| Recovery/hosting | Parent | Full-fidelity encrypted browser backup/import and deletion; staging auth, isolation, outages, billing/migrations and restore; Docker/Compose upgrade/rollback and runtime scans. |
| States/forms | Parent | Demand-informed state gap analysis; physically version templates/maps, qualification gates and complete-data export distinct from review exports. |
| Coverage/release | Parent | Meaningful boundary/integration tests, all commands from brief, remote CI, artifact identity, review and push coherent packages. |

Each package evidence file must record official source URL/section/revision/date,
failing-to-passing regression evidence, checks, limitations and commit references.
Parent owns this checklist, progress and machine checkpoint. Agents commit only
owned files; parent reviews/integrates and pushes. No agent review substitutes for
required independent human review.

## External inputs requested early

Requested in this task while independent implementation proceeds:

- Authorized staging environment, secure location of test-mode credentials and
  permitted staging rehearsal operations. The README mentions
  `staging.vivalatax.com`; that alone is not deployment authorization.
- Approved budget and configured provider credentials for synthetic live runs.
  No OpenAI key was found in process or usual root/web environment files; no
  live provider request has been made in this resumed work.
- Independent human tax/spec/expected-output, security/privacy and AI-case
  reviewers, plus recorded review evidence. Agent-produced cases are unreviewed.
- Actual launch-state demand; PA-only, PA/OH and CA/NY were suggested choices.
- Final official 2026 forms and revisions for each scenario enabled for filing.
- Secure configuration location for approved staging SMTP credentials and sender;
  requested separately while local recovery tests proceed. Do not paste secrets
  into the conversation.

## Completion gates (all required)

- [ ] Complete facts and reviewed specs with independent expected outputs.
- [ ] Complete federal pack and demand-selected state scenarios qualified.
- [ ] Final physical year/revision maps and complete-data exports qualified.
- [ ] `pnpm test` and `pnpm test:coverage` (85% branches unchanged).
- [ ] `pnpm typecheck`, `pnpm typecheck:contracts`, `pnpm typecheck:web`.
- [ ] `pnpm spec:validate`, `pnpm spec:inventory:check`.
- [ ] `pnpm build`, `pnpm build:web`, `pnpm lint`, `pnpm test:web`.
- [ ] Remote CI on exact committed code; advisory disposition complete.
- [ ] AI representative corpus independently reviewed; repeated held-out live
  evaluation and baselines, exact costs/January prices, privacy/quality/latency
  budgets pass; route promotion separately authorized.
- [ ] Hosted staging security/auth/billing/outage/migration/backup rehearsal pass.
- [ ] Self-host full-fidelity recovery, target-platform upgrade/rollback and
  upload → confirm → calculate → export → reopen → delete pass.
- [ ] Final runtime image SBOM/scans and authorized versioned release artifacts
  match support claims and documentation.

No production deployment, filing enablement, model promotion or release
publication is authorized by a passing local test alone. The goal stays active
until the brief's criteria pass or only external actions remain.

## Current execution evidence (2026-10-24, still active)

- Federal commits: `49d3085`, `60b24f2` historical refund facts; `fe64b7a`
  independent 2026 constant data; `d657eee` Schedule 1-A; `55d5d7c` gambling and
  nonitemizer charity; `b9fda4b` historical QCD correction; `953aead` charitable
  category/floor worksheet. Full rule pack and carryover coordination remain open.
- Facts commits: `5d09daf`, `f312c2f`, `1d166e7`, `70f8d17`. Latest package has
  516 passing focused tests and web/contracts types. Remaining facts and federal
  eligibility integration are actively being implemented.
- Recovery `6bebb6d`, review corrections `937f4bf`: 84 focused tests and two
  Chromium tests pass, including original-byte equality after delete/reload/
  restore, reset retention, hosted local-return visibility and preserving local
  data on failed cloud deletion. Independent human security review is pending.
- Telemetry `3408c76`: 53 security tests, including real installed-SDK transport
  sanitization; no network telemetry in tests. Independent privacy review pending.
- Runtime `31d1b1a`: trixie base and runtime package-tool removal; local arm64
  health/non-root/template smoke passes. 67 distinct OS advisories remain in the
  explicit register, acceptance pending, review deadline 2026-11-07. This image is
  intermediate and must be rebuilt/scanned from final code on target platforms.
- Billing `0d90200`, overrun reconciliation `a649c61`: exact atomic ledger,
  19 disposable-Postgres tests pass. Task routing `d3778d8` removes legacy live
  responder defaults and binds explanations to validated server audits; draft
  corpus/account/P50 gates `c3909cf` retain no-promotion status.
- PDFs `a9745e8`, `c6db09e`, `3f71d42`: 41 templates and 90 mappings physically
  versioned under 2025; exact template hashes and strict field writes enforced.
  Existing 1040 semantic mislocations corrected using official form positions.
  908 full PDF tests plus four focused source-location/error tests pass; saved
  canonical values/widget appearances and both synthetic rendered pages checked.
  These remain historical review outputs, not qualified filing forms.
- Additional federal `c5d01c4`, `1e9ad95`, `9abdf5d`, `f4c8a25`, `2998547`,
  `c74f622` cover education identity, qualified PMI, section 68/QBI/AMT ordering,
  AMT addbacks, SALT facts and historical precision/QCD corrections. Dependent
  care `e2d93f0` has 67 focused passes; shared federal integration is in progress.
- Facts `a70b823`, `2c1dfd9`, `45f96c0` add explicit charity/education eligibility,
  extension/prior-year payments, IRA/alimony/household employee facts. Latest
  coherent package: 470 guided/preview tests, types, lint and spec checks pass.
- Diagnostic full coverage while tax packages were actively changing reports
  82.22% branches and 89.38% functions. It has concurrent test failures and is
  not a passing gate. All thresholds are unchanged; meaningful coverage work
  and a clean full rerun remain required. Evidence: `current-coverage-gaps.log`.
- Remote CI runs are being triggered by pushes. Superseded runs may be cancelled;
  no exact-final-commit CI success is claimed yet.

## Latest integrated evidence and immediate work

### Continuing integration after the prior diagnostic

- `1cb8711` publishes a year/jurisdiction/residency/output support matrix and
  refreshed PA/OH gap analysis. Actual launch-state demand is still pending.
- `a49300d` adds an explicit legacy metadata cleanup command and passes an
  actual disposable PostgreSQL dump/restore rehearsal across nine application
  tables, two owners with the same workspace ID and exact sub-cent provider cost.
  Fourteen migration/store tests, types and scoped lint pass. Reapplying cleanup
  after restoring a legacy backup is verified. This is local synthetic evidence;
  hosted auth tables, staging credentials and release rollback remain open.
- `9207583` copies Schedule 3 and Schedule 8812 printed amounts from audit lines;
  39 PDF checks pass. `2e852bc` adds the separate complete-data filing library
  pipeline, whose compiled qualification registry is empty. Twenty-seven gate
  tests pass; no live route, form, filing capability or approval is enabled.
- `c571b58` and `9c2fa0c` add abortable document analysis and real UI consent,
  cancellation, return-change and late-result protection. Fifty-five focused
  checks pass, with types/lint. Exact zero is preserved and invalid negative or
  sub-cent source amounts are not silently rounded into expenses.
- `6d71c4c` adds the compatible jsdom test dependency with strict peer checks;
  the refreshed package audit reports zero advisories across 519 entries.
- Federal `bc26ffe`, `2885753`, `ed5ac99` add actual possession exclusions,
  education eligibility and coherent credit limits/source metadata. PTC core
  `ca8c1e5` has 151 focused passes; federal integration `5e0822a` has 73 passes.
  Sources, special worksheet gaps and review limitations are in the package logs.
- Facts `49e607c`, `4dd6ebf`, `a0a4e21` collect credit identification, individual
  vehicle facts and individual adoption expense/benefit/history/child facts.
  Education interview expansion and remaining standard-deduction facts continue.
- Latest diagnostic: `.local/upgrade-evidence/coverage-after-credit-integration.log`
  has 15,745 passes / 30 failures / 19 skips while agents edited source. It did
  not produce a fresh coverage report. The prior 82.55% branch result is still a
  failed historical diagnostic, not a current measurement. Credit fixture owners
  have since reconciled assertions; PDF timeout checks need a stable bounded run.
- Immediate parent work is audited multi-student Form 8863 output, review-copy
  redaction after complete-input calculation, then a stable whole-suite/coverage
  run and meaningful remaining coverage. Hosted staging, independent reviews,
  live provider budget/account access and final official forms remain unprovided.

- Privacy commits `2d16a94`, `9e9462b`, `e910507`: complete name/header
  redaction, metadata allowlist at both browser/network and PostgreSQL boundaries,
  opaque upload names and response binding. Four real disposable-Postgres cases
  verify JSONB content, owner isolation, legacy reads and failure atomicity.
  Sanitized reads do not erase private content already present in legacy rows or
  backups; a separately rehearsed retention migration remains required.
- Billing boundaries `2b4b012`: 126 focused tests pass, web types and scoped lint
  pass. Auth/DB/provider errors cannot return private upstream messages; malformed
  workspace IDs reject before billing. These use mocks, not staging evidence.
- 1040 source forwarding `f07de24`: 31 focused PDF tests pass for separately
  audited wages/withholding and gross/net refund plus penalty. Existing mapping
  coordinates were unchanged; no new visual qualification is claimed.
- Federal source/care/QBI/payroll packages and vehicle transition work continue
  in `upgrade-2026-federal-work.md` and `upgrade-2026-ai-work.md`; complete-facts
  energy/identity UI and sparse parser hardening continue in facts evidence.
- Latest diagnostic full coverage: 15,581 pass / 50 fail across 525 files;
  branches 82.55%, functions 87.94%, statements 90.91%, lines 91.88%. It ran
  during active source edits and concurrent tests. Required gates remain red.
  Owners are reconciling source-based assertions; rerun with bounded workers to
  avoid shared-machine PDF timeouts, without changing test timeouts or thresholds.
- Remote CI at `e910507` failed unit assertions and generated inventory freshness;
  frozen install, build, engine/contracts types, lint and spec references passed.
  Coverage was not reached. Run: https://github.com/utilityfueled/tax-engine/actions/runs/40156586696.
- Next parent work: real UI privacy/cancellation interactions, support/gap matrix,
  separately gated complete-data export, legacy metadata cleanup rehearsal and
  final image/Compose recovery. User demand, secure staging access, approved live
  provider budget, final official forms and independent human reviews remain
  external inputs; no promotion, filing, production deployment or publication.

## Stable snapshot and new packages — 2026-10-25

- Fixed commit `2cb61b3`, isolated tracked-file archive, Node24, two workers and
  disposable PostgreSQL16: **15,929 passed / six failed**, 545 passing files and
  five failing files. Coverage: branches **84.06%**, functions **89.81%**,
  statements 91.85%, lines 92.93%. Both branch/function gates still fail.
  Evidence: `.local/upgrade-evidence/stable-coverage-2cb61b3.log` and snapshot
  metadata; this supersedes concurrent-source diagnostics for that commit only.
- `edd564b` reconciles five official-source fixture assertions. The remaining
  workspace PTC marker is in the facts package. Newer remote CI also exposed
  legacy state W-2 inputs without EINs; federal owner is correcting 2025 handling.
- `ea95c66` renders all Form8863 students/institutions from exact audit amounts;
  `2cb61b3` redacts review identifiers only after full-fact calculation. Seventy-six
  focused checks pass, with four rendered synthetic pages inspected and notices
  on every page. Historical 2025 review output remains unqualified for filing.
- `7a2a95b`, `cddec72`, `632452b` add standard-deduction law, federal integration
  and actual eligibility/election facts. `ec59e76` separates excess Social
  Security by employer and owner. `5a5c6b3`/`8c459ce` use actual state payment year.
- `a44adbb`, `93f336c`, `45bb211` add actual-source prior minimum tax credit,
  audited Form8801 reference pages and federal integration. Focused module/PDF
  run: 92 passes; federal integration: 549 passes. Independent review pending.
- `935e0cc` hardens document/review-PDF requests (89 focused passes, web types,
  lint); `0eab56e` fixes stale recovery UI success after cancellation/unmount/
  return changes (33 focused passes, web types, lint). No staging evidence implied.
- `0c935f7` excludes isolated pnpm caches from container context; 48 checks pass.
- Remote `edd564b` CI failed unit regressions and inventory freshness. Current
  pushed `0eab56e` CI queued: https://github.com/utilityfueled/tax-engine/actions/runs/40160576899.
- Immediate parent work: request-stream cleanup, meaningful recovery/saved-return/
  billing UI checks, paid AI availability claims/purchase gating, then a stable
  rerun and final image/Compose rehearsal. Tax agents continue FEIE, credits and
  remaining actual income/source facts. All external inputs above remain pending.

## Stable coverage threshold reached; integration remains active — 2026-10-25

- Exact tracked snapshot `05ec24e`, Node 24, two workers and disposable PostgreSQL:
  **16,112 passed / 11 failed / zero skipped**, 562 passing and five failing files.
  Branches **85.15%**, functions **91.25%**, statements **92.49%**, lines **93.65%**
  meet the unchanged thresholds. The command still failed: seven PA/OH review
  packet fixtures and three CTC/source-ledger fixtures need explicit source facts;
  one partner-basis PDF test exceeded its existing five-second timeout under
  coverage. Do not claim a passing suite or weaken the timeout/assertions.
  Evidence: `.local/upgrade-evidence/stable-coverage-05ec24e.log`;
  snapshot metadata: `stable-snapshot-current.json`. Newer code needs a new run.
- `6e795b5` bounds request-stream lifetime (150 focused checks); `4f20049`
  prevents stale saved-return lists and overlapping deletions (61 focused checks).
- `1858703` gates extra-credit sales on the actual qualified production executor
  and provider configuration, fixes exact Decimal display, and corrects public
  availability/storage claims. Combined billing/UI/security run: 316 passes;
  contract/web types and scoped lint pass. No promotion or live spend occurred.
- `6ed4466` contains provider HTTP outages, cancellation and caching boundaries:
  104 focused checks, web types and lint pass. Nineteen initial regressions failed.
- `1d3fd90` requires actual W-2 owner and state facts. Its source/DOM/storage/PDF
  package has 616 passes and seven fresh production Chromium scenarios passing.
- `28ba63d`/`2e3fa87` add actual Form 2555 sources, net exclusion/housing routing,
  stacking and MAGI effects; `05ec24e` renders all audited foreign-income lines
  with per-page review warnings. Four synthetic pages inspected; no final 2026
  form qualification. `26661ba` corrects disjoint 1099-INT Boxes 1 and 3 federally.
- Current parent work: PA interest source/education-exclusion reconciliation,
  complete state-packet fixtures, clean full checks and final runtime/Compose
  recovery. Agents continue remaining income facts, Form 8815, Social Security
  exclusion worksheets and tax-table/capital-gain calculations. Independent
  review and every external prerequisite above remain pending.
- Remote CI at `1858703` was in progress when inspected:
  https://github.com/utilityfueled/tax-engine/actions/runs/40161538848.
  Superseded pushes were cancelled; exact final-code CI success is still required.


## Source integration and actual Compose recovery — 2026-10-25

- `0c1c2b9` reconciles PA interest with actual disjoint source boxes and bond
  exclusions; 399 focused checks pass. `9000ce3` carries actual Ohio investment
  withholding through calculation, adapter and review PDF; 133 checks pass.
- `ea34d6b` collects actual business/NEC facts; `94cc6bc` parses labelled NEC
  sources and removes document-only assumed-zero-expense previews. Investment
  sources are `4679852`; rental source contracts are `6bddb79` and guided work
  continues. See the facts package's explicit remaining software checklist.
- `1a815e0` corrects Schedule C other income/official fields; `c0871d3` separates
  Schedule SE by actual owner, corrects interactive per-owner PDFs and resolves
  the two old bond-interest source assertions. `e5696a2` corrects OID source
  boxes; return/state integration is still active. Bond/SSA packages are
  `acab62e`, `5604a87` and `da3e0fc`.
- `a2f62e2` adds a local-only pinned-endpoint Compose rehearsal. Exact candidate
  `da3e0fc` on arm64 passed upgrade, database restart, nine-table dump/restore,
  rollback, re-upgrade, encrypted browser backup/restore and deletion. Actual
  wrong-password/tamper checks pass after independent agent review corrections;
  all 12 endpoint tests and scoped lint/syntax checks pass. Digests and bounded
  raw-marker network evidence are in `upgrade-2026-self-host-rehearsal.json`.
  This is not historical hosted-schema downgrade, staging or human approval.
- The refreshed exact-image SBOM has 157 matches/67 distinct advisories, zero
  critical/npm matches and no reported fixed matches. Every advisory remains
  unresolved with owner confirmation pending and 2026-11-07 review deadline.
  Current package audit has zero advisories across 519 entries.
- Local amd64 QEMU compilation failed with signal 11. Native amd64 CI now builds
  a pinned previous commit, runs actual-image browser/Compose recovery and saves
  SBOM/scan evidence. No native result or artifact publication is yet claimed.
- Remote CI at `9000ce3` failed only the two source assertions corrected by
  `c0871d3` plus inventory freshness. New pushes include all commits through
  `a2f62e2`. The stable one-worker run at `c0871d3` completed with 16,241 passes
  and 14 failures; no fresh coverage percentages were emitted after failure.
- Parent next: finish that fixture, regenerate inventory at a stable boundary,
  correct Form2441 source/audit/PDF facts, adapt verified OID and actual rental
  ownership to PA/OH, then complete final image/browser checks. Federal owner
  continues OID/QBI/tax-table/IRA; the other agent owns bounded Form2210 work.
  All external inputs listed above remain pending. The goal remains active.

## Current integration corrections — 2026-10-25

- `6ef58a2` integrates actual OID sources federally; `fce3094` collects actual
  rental ownership/expenses; `b072884` preserves actual W-2 Box 7 and spouse
  payroll. `44793ac` calculates penalties from dated payment sources.
- `8262f40` preserves actual care incomes, prior-year worksheet credit and
  tentative/limited audit amounts (76 focused checks). `8ca3655` attributes QBI
  deductions by source/owner (215 focused checks) and fixes all eleven assigned
  tax regressions without weakening the expected tax outcomes.
- The PA business-packet fixture now states complete actual synthetic business
  facts and all five original packet assertions pass. The spec test-name checker
  now reads TypeScript literal names, including single quotes, while rejecting
  commented examples and unrelated strings; six checker tests pass. Logs:
  `pa-business-packet-facts-final.log`, `spec-literal-names.log` and
  `integration-fixtures-lint.log` under `.local/upgrade-evidence/`.
- Remote CI at `a2f62e2` has the same fourteen stable-run regressions and stale
  inventory. Native amd64 image build, health smoke, previous-image build and
  actual Compose upgrade/recovery/rollback passed; browser/SBOM/scan remained
  running when inspected. Final exact-code checks are still required.

## Current source/PDF integration and stable rerun — 2026-10-25

- `5d0ef3e` collects actual dependent-care providers/persons; `8f7f172` and
  `131a8f2` preserve audited amounts and source continuations. `f23a13a` fixes
  the required provider notice in the official constrained field. All 81 focused
  PDF/credit checks, types and lint pass; saved canonical values and rendered
  pages were checked. The care work document corrects an earlier premature
  success claim. Benefits Part III remains active separately.
- `91b4cd7` collects actual mortgage qualification/allocation facts; `5bfcfcf`
  preserves the actual IRA checkbox. Remaining retirement facts continue.
- `a269a9f`, `a656859`, `fe2ea81` integrate dated Form 2210 payments, audited
  physical fields and reconciled legacy fixtures. `d84d890` uses official AMT
  line identities; `a6ebd97` aggregates estate deductions once on Schedule A.
- The inventory was regenerated and its freshness check passed in an isolated
  archive of `f23a13a`, with 229 entries. This is traceability, not qualification.
- A full one-worker coverage run from that exact commit is active, using the
  disposable local PostgreSQL16 instance. The log is
  `.local/upgrade-evidence/stable-coverage-f23a13a.log`; no result is claimed yet.
- Remaining internal work includes tax-table/IRA rules, retirement and care
  benefits, PA/OH verified OID and rental ownership, full checks/browser runs,
  and final image/recovery evidence. All external inputs above remain pending.

## Immutable coverage result at f23a13a — 2026-10-25

The fixed committed archive completed in 426.69 seconds with 16,356 passing and
five failing tests,599 passing and four failing files, and zero skips. Unchanged
coverage thresholds pass: 85.96% branches, 91.61% functions, 92.72% statements and
94.00% lines. The full command remains failed. Three tests need actual synthetic
Form2210 payment facts; two AMT tests refer to superseded audit labels. These
corrections are assigned to the federal owner. Newer changes require another
full run. Evidence/hashes are in the machine checkpoint and
`.local/upgrade-evidence/stable-coverage-f23a13a.log`.

New packages: `f468453` actual Ohio OID interest/withholding (132 checks);
`d13fbee` actual retirement source/taxability facts (585 checks); `0b3d78e`
published 2022–25 Tax Table helper (69 checks); `812fc61` dependent-care benefits
core (207 checks). Each has source/evidence details in its package work document.
No external qualification or production readiness is implied.

## Integrated source packages and immutable coverage — 2026-10-25

- Pushed through `df1562b`: Pennsylvania actual rental classification, care
  Part III return integration `5fb2f7e`, care source UI `a615453`, actual Social
  Security UI `e66fa3d` plus placement correction `003609d`, and published Tax
  Table fixture corrections `dc1e900`, `ca3b62c`, `914a692`. The SSA correction
  was validated together before push; the intermediate malformed staging is
  not a qualified artifact. Shared patches now use full context.
- Immutable `99fc4c2` coverage: **16,384 pass, 25 fail, zero skip**, 603 passing
  and 10 failing files. Branches **86.06%**, functions **91.70%**, statements
  **92.75%**, lines **94.05%**; all thresholds met unchanged, command still red.
  The evidence log/hash is in the machine checkpoint. Twenty-three table-row
  expectation failures are corrected in the commits above. The Ohio fixture now
  derives a real Form2441 audit: $2,000 x 27% = $540 line9c, limited by its actual
  $400 tax liability on line11; Ohio's25% is still $100. The existing unrelated
  PDF timeout passes unchanged with that focused rerun:7/7 in4.26seconds.
  A fresh full run is required; no passing global gate is claimed.
- The final 2026 IRS Form4952 is now available at
  https://www.irs.gov/pub/irs-pdf/f4952.pdf (created May28,2026). Its source and
  exact hash are being recorded in the Form4952 package. This updates prior
  availability evidence for this specific form, not the qualification registry.
  Filing,2026 PDF exports,AI promotion and release claims remain gated.

## Actual-source integration through ff761dd — 2026-10-25

Pushed the Form4952 printed-line/source/PDF correction `d1b26ef`, regular-return
and election integration `9e6d794`, IRA core `c3fa9b4`, return `fa37e8d` and actual
source UI `6eb3747`, sparse actual W2 boxes `3c057f6`, care PartIII PDF `fd8658c`,
and independent PA expense worksheet `ff761dd`. The PA staged tree passes1,450
state/PDF/guided/DOM tests, types and3,504 spec references; see its work document.
The Form4952 package passed76 focused tests after an independent agent review
identified and verified repair of a missing-calculation export path; this does
not substitute for human qualification.

A fresh immutable full coverage run is underway at exact
`ff761dde6b7a2305cbf1adaafa0ad2609c0f3eef`, with the disposable local PostgreSQL
ledger service and unchanged thresholds. Its evidence path is
`.local/upgrade-evidence/stable-coverage-ff761dd.log`. No outcome is claimed yet.
Further AMT source, HSA, energy,529, export and final release checks continue.

## Immutable coverage outcome and next source packages — 2026-10-25

The `ff761dd` archive completed with16,494 pass,11 fail,zero skip across635 files
(632 pass,3 fail). Thresholds remain unchanged and pass:86.31% branches,
91.88% functions,92.76% statements,94.12% lines. The command is failed.
Seven IRA expectations were independently checked against Publication590-A and
corrected in `dd1b0a7`: deduction rounding, nonparticipant QSS and excess
contribution treatment. Four PDF timeouts passed unchanged on the exact same
archive (5 tests/2 files,8.03seconds); no timeout or assertion was relaxed.
This focused result does not establish a passing global run.

Integrated follow-ups include actual HSA ownership `b9071db`, energy installation
sources `30fc3dd`, separate AMT investment sources/PartIII `58d2a3e`, energy filing
status `cac5a87` and actual HSA limit/recapture sources `b1488d4`. Their package
documents retain source and focused check evidence. Guided HSA/energy,529,
canonical Schedule1,OID intake and final export/release work remain active.

## Review PDF, source intake and return integration — 2026-10-25

Pushed through`e49e1d0`: visible review notices survive template loads, appended
pages and merges (`28b0cd7`,1,028PDF/workspace checks); actual energy UI
`b84205d`, corrected printed insulation cap`190af2c`, canonical Schedule1/1040
source totals`1f4a614`,2026educator cap`472a190`, and actual physical5695sources
`24cbcf7` (1,021PDF tests/99files,114focused source/core/workspace checks).
Actual OID interview`e49e1d0` passed592isolated guided/DOM checks, root/web types
and3,593spec references; independent agent review ran57checks with no actionable
findings. That is not independent human tax qualification.

Individual HSA excess/core and review forms are committed locally as`104bca4`
with921focused checks and3,614spec references; the next push will include it.
State selection/payment consistency and dedicated PA/OH preview verification is
active. Whole-suite/coverage, final release artifacts, nativeamd64CI and the
external inputs above remain outstanding. All filing/promotion gates stay closed.

State package`ec225fe` passed1,496isolated tests/88files, root/web types and3,608
spec references. It separates selected jurisdiction from mailing address, keeps
explicit federal-only output federal-only, uses dedicatedPA/OH previews, shares
actual payment inputs with downloads and requires actual state for nonzeroPA
withholding. PA/OH part-year selections no longer print a resident calculation
without actual allocation inputs. Package evidence is in the guided-state work
document. Actual Ohio exempt-interest allocation intake is the next state slice.

## Current full run and actual HSA/Ohio sources — 2026-10-25

Pushed through `7a337a0`: actual HSA contribution/history sources `ed5cae9`,
actual distribution events and net exception allocation `b8e995a`, crypto gifts
through charitable limits/floor `ca323c5`, and actual Ohio issuer allocation
`7a337a0`. HSA distribution checks passed 1,257 isolated tests/49 files; crypto
passed 759 focused/adjacent checks. Ohio passed 1,326 isolated tests/60 files,
then 18 final guard/DOM/PDF checks, root/web types and 3,628 spec references.
See the package work documents for sources and exact boundaries.

The immutable `10be1de2e11362eb57fbfa26d871c64f30764fde` coverage command failed:
16,590 pass, 10 fail, zero skip, 654 files (648 passing), 432.56 seconds.
It produced no coverage report; the prior 86.31% branch result remains historical.
Six HSA source/oracle failures are addressed in `ed5cae9` and `4b5cacb` (118
focused checks); three audit-label and one Form461 source expectation failure
are assigned to the federal package. The Form461 investigation found a real
employee-wage exclusion issue requiring a separate source-first correction.
No new passing global gate is claimed.

Independent agent review of `ec225fe` found no actionable issues and passed
8 focused tests. Review of the new Ohio allocation package is pending. Neither
is human tax qualification. The fresh package audit reports zero advisories for
519 dependencies; runtime images still need a final-code scan.

A new production Chromium suite is running against immutable `4b5cacb` with
synthetic sample documents and self-host mode, no retries. Evidence:
`.local/upgrade-evidence/stable-browser-4b5cacb.log`. Remaining federal/facts/state
work continues in parallel. This run does not establish hosted staging evidence.


## Browser source-fixture audit and Form461 review — 2026-10-25

Ohio state attribution `054cd59` is pushed: nonzero withholding requires its
actual state across ten source categories; every supplied amount is validated
before exclusions. Unknown state is not silently treated as non-Ohio. The exact
staged tree passed741 tests/24files, root types and3629 spec references. See
`upgrade-2026-state-source-work.md`. Independent agent review of Ohio interest
`7a337a0` found no actionable findings and passed6 tests/twofiles; this is
software review, not human tax qualification.

The immutable production Chromium run at`4b5cacb` finished245pass,51fail and
five hosted skips in13.2minutes. Log:`.local/upgrade-evidence/stable-browser-4b5cacb.log`.
No passing browser gate is claimed. Failures include incomplete synthetic W2
Boxes7/10/12W, old aggregate donation/education/energy/payment controls, and
strict selectors matching new source explanations. Parent is repairing the
browser tests against the actual source-record UI with the same numeric and
privacy/readiness expectations. An isolated loopback runtime at the same commit
supports repair checks; a final committed full run is still required.

Form461 `9d814f9` corrects employee exclusion, official printed line identities,
capital gain/loss treatment and zero-addback attachment requirements. Parent
review caught invalid bounds on nonbusiness components of net amounts; actual
signed business-net conservation now accepts both offsetting directions and
rejects contradictory sources.608 staged checks pass; parent independently ran
13 source/PDF checks. Official IRS instructions and RevProc2025-32section4.31
were refreshed. Final2026 form and human review gates remain closed.

Education distribution core `eaaeb04` has102 isolated focused checks and493
adjacent working-tree checks. Its actual-source intake, federal reconciliation,
owner-specific5329 and reference PDF remain active work, documented in
`upgrade-2026-education-distribution-work.md`. Educator and remaining federal
packages continue independently. The last full unit/coverage command remains
red until a fresh immutable run verifies the integrated fixes.

## Current source packages and PDF timing correction — 2026-10-25

Immutable `2f8abd7` finished16,677pass,2fail,zero skip across669files in476.95s.
Coverage meets every unchanged threshold:86.41%branches,92.03%functions,
92.76%statements,94.33%lines. The two failures were PDF aggregate-test timeouts;
no numeric tax regression failed. The full command remains red.

`76bb3a6` separates the identical41template checks and PA/OH state cases into
individually named tests. No assertion, case, default timeout or coverage setting
changed. Exact staged tree`8054e7d` passes62tests and3,682spec references; see
`upgrade-2026-validation-work.md`. A fresh full run remains required.

Pushed through`76bb3a6`: actual educator`b4be8d6`, unknown qualified-stock
`758b024`, education source return`6b07529` and borrower links`2f8abd7`, actual
1098-E Box2`224b2ed`, PA withholding`a3f0bec`, browser source fixtures`6cda2c0`,
education distribution UI`9f2ce31`, ticker frame clamp`0be1714` and PDF cases.
The PA staged package passes939checks, types and384PArefs. The browser repair
cohort passes154of155; its final independently derived$8,288balance case then
passes separately against retained earlier runtime`4b5cacb`. It does not count
as a fresh full browser gate. The ticker has3red regressions then103combined
passes, with types/lint; current production browser verification is next.

Student-loan source core`d162f6c` passes127isolated checks, types and3,688refs.
Parent review found and verified a malformed legacy-interest guard correction.
Mortgage review found an independent interest/rate numerator reconciliation gap;
its source-first correction is in progress. Education reference PDF and separate
owner5329 work continue. Agent review is not independent human qualification.

Remote CI/Web at`76bb3a6` are running; previous`a3f0bec`runs were superseded.
Latest full local coverage/browser, inventory, remaining source integration and
final release artifacts remain open. Staging access, human reviews, live provider
account/budget, actual state demand and final2026forms remain external inputs.

Remote`6b07529`plain unit suite passed16,678tests/669files; coverage then failed
nine multi-document PDFtimeouts. Commits`76bb3a6`and`ddd8976`isolate every affected
case without removing any check or changing timeouts. The latter's staged tree
`9923ca59`passes55tests, types and3,688refs. Remote lint/types/build passed;
inventory remained stale. `05fd72a`adds audited education reference PDFs, with
14isolated tests, types and3,692refs. Parent review identified source Box2/3 and
recipient-link consistency gaps; both were reproduced red and corrected before
commit. Fresh immutable full validation follows these integrated packages.


### Passing full coverage and Ohio historical correction — 2026-10-25

The immutable `5d32549` archive passes the complete coverage command: **16,770
of 16,770 tests in 676 files**, zero skips/failures, 441.80 seconds, 86.50%
branches, 92.02% functions, 92.81% statements and 94.41% lines. Thresholds and
five-second test timeouts remain unchanged. The archive used locked modules,
pinned Python/pypdf and disposable local PostgreSQL 16. Evidence:
`.local/upgrade-evidence/stable-coverage-5d32549.log`; its hash is in the machine
checkpoint. This resolves the prior PDF aggregate-case timeouts for that exact
commit. Newer source packages and the final artifacts still require full checks.

- `0433c87` derives mortgage interest from actual debt averages, ownership and
  eligible payment sources. Parent review caught and the agent fixed a mismatch
  between the interest/rate numerator and claimed interest. The parent ran 21
  cross-source checks successfully; the package records 693 adjacent checks.
- `4a8e8e2` emits separate Form 5329 review forms for actual education/HSA
  owners. The parent reviewed owner routing, source/audit reconciliation and
  ambiguous joint-return legacy rejection, then independently passed five new
  PDF checks. Its immutable package passes 28 checks and 3,708 spec references.
- `aea0779` preserves Ohio's actual 2024 exemption/joint-credit rules and uses
  the exact 2025 MAGI cutoff before exemptions. The spec preceded eight failed
  boundary cases. All 728 isolated Ohio checks, root types and 3,708 full spec
  references pass; scoped lint has zero errors and one existing warning.
  Independent agent source review and 12 boundary cases found no issues. This
  does not constitute human tax review or state/form qualification.

The branch push through `aea0779` is verified. Its CI/Web runs are in progress;
previous runs at `5d32549` and `76bb3a6` were cancelled by later pushes. The latest
package advisory refresh is recorded in `advisories-2026-10-25-current.json`.
Current production-browser verification is next after the canonical student-loan
core and dependent UI are integrated. Human review, live provider evaluation,
hosted staging and final form/release qualification remain unproven.


### Current browser pass and source packages — 2026-10-25

Immutable `ed915c1` passes the production webpack build and complete local
Chromium suite: **296 passed, zero failures, five hosted cases skipped**, 5.6
minutes, retries disabled. It uses pinned tooling and synthetic sample documents
without provider/billing credentials. The machine checkpoint records the log
hash. Later mortgage controls require a fresh run; this is no staging claim.

- `3fbaf48` and `ed915c1` connect canonical student-loan sources and guided
  taxpayer entry. The UI's exact archive passes 624 tests and 3,722 references.
- `00bcea1` prepares the isolated final 2026 Form 4952 physical candidate.
  Its exact tree passes 63 tests, root types and 3,725 references; all four
  pages were reopened/rendered. Independent agent review found no issues.
  Human qualification is pending and every public 2026 export gate stays closed.
- `affeef4` treats timely returned Coverdell contributions in their actual
  income year, preserving custodian loss/earnings and prior reported amounts.
  Its isolated archive passes 136 tests and 3,735 references. Parent source/code
  review independently passed eight checks; no human qualification is implied.

Remote CI at `00bcea1` passes 16,813 tests and fails three integration assertions
(two mortgage-source/rounding fixtures and one ambiguous OID audit selector).
The inventory is also stale; its 270-entry refresh now passes in the isolated
`affeef4` archive. Fixture repairs and a new remote run remain necessary. The
Web run was still in progress when observed. Parent owns OID selector correction;
facts agent owns mortgage fixture reconciliation. All external prerequisites
listed above remain pending while useful internal work continues.

### Current source reconciliation and keyboard verification — 2026-10-25

Pushed through `603604b`. The prior remote mortgage/OID assertion failures are
corrected in `f309369` and `2ca86cf`; a fresh remote result is still required.
Additional packages are educator eligibility/itemized costs `8c476b4`, actual
government-payment source core `027a383`, Coverdell basis/rounding `932d8a3`,
and the published 2025 long-term-care caps `8f7c622`. Each owner document retains
the official source, spec-first tests and scoped evidence. Government core's
exact staged archive passes 226 tests in 16 files, root types, 3,760 spec
references and scoped lint. Canonical return/refund-year and guided integration
remain separate active work.

The actual mortgage browser workflow exposed a real keyboard navigation bug.
Three regressions failed: Enter on the breakdown, Enter on the native expand
button, and Escape on the breakdown also advanced or backed up the interview.
`603604b` respects handled keyboard events and native button/link activation.
Its isolated production build, web types and scoped lint pass with zero warnings.
The browser cohort passes 54 adjacent cases; the new mortgage case failed only
its final comma-format assumption, then passes after asserting the actual saved
raw value. All mortgage numeric, confirmation reset and reopen checks remain:
taxable income $77,500 using the highest balance and $70,000 using the actual
lender average. Independent agent review found no actionable issues. This is
local synthetic evidence, not a new complete-browser or hosted staging pass.
Logs: `ticker-keyboard-red.log`, `ticker-mortgage-staged-browser.log` and
`mortgage-final-staged-browser.log` in `.local/upgrade-evidence/`.

Current internal queue: TIPS/NIIT, canonical government/refund-year integration,
educator and Form 7206 actual sources, education coordination, Ohio joint-credit
source conservation, then all current-code gates and final runtime/recovery
evidence. Independent human reviews, authorized staging, approved provider
budget/account access, actual state demand and final form qualification remain
external prerequisites. No readiness, filing, model or release gate is opened.

### Government source convergence and Ohio credit — 2026-10-25

The separately reviewed packages now include TIPS ordinary loss/NIIT `3e766a7`,
expanded educator intake `cb41245`, Coverdell actual transaction medium
`6965daa`, and outside-recipient credit conservation `475e96d`. Their owner
documents retain spec-first source and test evidence. No agent review is counted
as independent human qualification.

- Canonical government/refund integration `0124905`: exact tree `9e46609e`
  passes 674 tests in 11 files, root types and 3,789 spec references. Lint has
  zero errors and four existing warnings. The physical Schedule 1 repayment
  checkbox was inspected. Parent review passes 175 adjacent checks, with no
  remaining actionable finding.
- Guided worksheets `e638184`: exact tree `ffc130a5` passes 219 tests in six
  files, root/web types and 3,794 references. Lint has zero errors and 22
  warnings, including test non-null assertions. Actual repayment/contribution
  records and grant/family classifications are collected and confirmed. The
  reviewed payer-identity collision was fixed with a red regression. Refunds
  requiring historical worksheets remain explicitly gated in this UI.
- Ohio qualifying income `c98cc70`: exact tree `fdd6ed47` passes 739 tests in
  24 files, root types and 3,797 references. Lint has zero errors and two
  existing warnings. Independently reviewed $499/$500, gross/net repayment,
  pooled contribution and actual-owner cases pass. No state qualification is
  inferred from these checks.

Evidence is retained in `guided-government-staged-*`, `oh-government-staged-*`
and `parent-government-final-review.log` under `.local/upgrade-evidence/`;
hashes and exact trees are in the machine checkpoint. The last observed remote
CI at `6965daa` passed lint/types/spec validation, failed stale inventory, then
was cancelled by a subsequent push. There is no current remote pass claim.

Active implementation is Form 7206 actual sources/UI/canonical context,
educator source-exclusion reconciliation and Form 8960 signed capital/MAGI/
audit/PDF corrections. All documented remaining source boundaries must be
checked against the execution brief before deciding that only external work
remains. Then regenerate inventory and rerun full local, remote and final-image
recovery evidence. The active goal remains incomplete.

### Source cores, account recovery and current CI — 2026-10-25

Pushed through `abcb979`; the goal remains active. New separately reviewed work:

- Actual Form 7206 source core `724f95c`: 225 tests, root types and 3,814 spec
  references pass. Canonical owner/business and guided/PDF handoffs remain active.
- Educator exclusion helper `7fcf2ab` and canonical handoff `1dac908`: the latter
  passes 507 isolated tests, types and 3,851 references; parent review passes
  eight cases. Mixed/joint and noncash source methods remain explicit work.
- Form 8960 corrections `8bd8f00`: 1,037 isolated cases and 12 parent checks
  pass, with signed gain/loss, actual MAGI/business sources and official lines.
  The newer remote CI exposed five adjacent stale audit/source fixtures; those
  are being corrected without changing monetary oracles or completeness gates.
- Bond identity core `fe4afa8`: 90 cases pass; parent checks four actual household
  identity cases. Canonical/guided handoffs are separate commits in progress.
- Form 4137 core `2e85ad2`: 508 isolated cases, types and 3,858 references pass;
  parent independently passes seven cases. Actual per-owner return/payroll,
  Schedule 1-A, intake and output integration remain open.
- SMTP dependency `f08692f` pins Nodemailer 10.2.1 and types 8.0.2 without changing
  other versions. Strict peers/frozen lock pass; current package audit has zero
  advisories across 521 entries. Image advisories remain a separate release gate.
- Hosted recovery `abcb979`: 21 isolated tests include five real local PostgreSQL
  and loopback SMTP cases. Actual fault injection drove hashed token storage,
  transactional password/token/session changes and generic exception handling.
  Adjacent checks pass 116 cases. Production webpack, web types and scoped lint
  pass. Desktop/mobile production browser checks pass twice in each deployment
  mode, with no retries and visual inspection. Hosted browser auth responses
  are synthetic; no real mail, staging or independent human review is claimed.
  See `hosted-account-recovery.md` for exact trees, initial failures and logs.

Immutable full coverage at `e8e169a` passed all unchanged thresholds (86.59%
branches) but failed one audit whitelist test: 16,888 passes, one failure and no
skips across 699 files. `c721f07` explicitly checks the new zero-valued OID and
educator worksheet entries; all 63 isolated Schedule A cases pass. A fresh full
current-code run is still required. The older full green `5d32549` remains scoped
to that commit, not the newer code.

Remote `c721f07` Web succeeds. CI passes types, lint, spec references and build,
but fails five unit cases and stale inventory; coverage does not run after the
unit failure. Exact results: 16,913 passing tests and five failures. Latest
`abcb979` CI/Web are in progress as recorded, with no result inferred. Logs and
run IDs are in the machine checkpoint.

Remaining internal work also includes positive Marketplace health/PTC coupling,
actual Schedule 1-A intake/business-tip QBI, ordinary NIIT source methods,
ESA code 6, educator attribution, and a complete source/preview/cross-year audit.
Database outage hardening is underway: three red faults now pass, plus packet
loss and exhausted-pool cases. Review identified a separate acquired-client
Kysely timeout/rollback path; that must be fixed and verified before this package
is committed. Then refresh inventory, full local/remote gates and final images,
SBOMs/scans and recovery rehearsal. External inputs above remain pending and do
not excuse leaving these internal tasks unfinished.

Subsequent coherent commits are `196ee90` (canonical bond identity; 1,038
isolated cases, 3,859 refs), `d5edc89` (guided bond/privacy; 665 cases, root/web
types, 3,868 refs and eight parent checks), and `686760e` (canonical Form 7206;
633 isolated cases, root types, 3,877 refs and zero lint errors). Each preserves
qualification gates. The health UI and physical PDF are the next dependent
packages. Database review reproduced the acquired-client issue through actual
Kysely: timed-out ordinary and transactional queries returned a still-pending
client to the pool. That finding is open; passing pool-shortcut tests alone do
not qualify the database outage package.


### Integrated sources, database outages and native amd64 evidence — 2026-10-25

Pushed and refetched `edde2a0`. Separate packages now include actual health
insurance intake `1abb260` and Form 7206 PDF `17f0588`, bounded Coverdell code 6
`4421801`, and separate-owner tip payroll/PDF `edde2a0`. Their package documents
record official sources, immutable validation and remaining source boundaries.
Parent rechecks pass 30 health tests, 22 education/tip source and PDF tests, and
nine canonical education tests. Review found and drove fixes for unidentified
education-credit students, an explicitly absent spouse in the tip exporter, and
long employer names on continuation pages. This is bounded agent review only.

Database outage package `dabb14d` passes 16 tests in three files against real
local PostgreSQL and packet-loss proxies, plus web types and scoped lint. Exact
staged tree `9cd3f6c03129d2ecb5f640aa2756ec74feeba357` completes in 67.93 seconds.
Independent review reproduced the Kysely acquired-client timeout issue and
confirmed its fix: ordinary and transactional blackholed queries fail at about
15 seconds and leave zero busy clients in the pool. An unfinished transaction
rolls back. The package uses bounded connection/lock/statement/read deadlines,
private idle-error handling and no automatic mutation retry. See
`hosted-database-outages.md`; this is local synthetic evidence, not staging.

NIIT fixture repair `9ea5dd1` preserves the existing tax expectations while
reconciling official Form 8960 line 8/12 and actual PA/FTC capital-gain sources.
The same five remote failures were reproduced first. Exact staged tree
`ece2a4e922d50c0bab0315ecf0def1ff9356d263` then passes all 224 cases. Independent
source review and another 224-case run found no remaining issue in that scope.

Native amd64 Web run `40186335148` at `c721f078989f1bd91ecd9bfc8a2cbf8de9f3a03a`
passes all three jobs, including actual Docker build, runtime smoke, Compose
upgrade/restart/backup restoration/rollback/reupgrade, browser flows, SBOM and
critical-vulnerability gate. Artifact `12597285004` has verified ZIP SHA-256
`82119b1ce0c9e10e2c4ad366608613bdf64c0265c864aece7354e7d489ba95cc`.
Runtime image `sha256:7cbf726f1d02e0747e1bcc9840211c981c799be4bf420f8571c057ed2a4110ef`
runs x64 Node 24.22.1 as UID 1001 with a read-only root and 41 templates; no
package manager or provider credentials are present. Recovery reconciles all
nine tables, both synthetic owners, exact costs and browser-only facts/document
bytes across all six phases. The finite observer saw 408 requests without the
private markers; this does not prove absence of encoded leaks. The scan still
has 67 distinct OS advisories (157 matches, zero critical); none has an available
fix in that image. Owner confirmation/exposure assessment and refreshed final
images remain required. This successful older artifact is not final-HEAD proof.

Remaining internal work includes Schedule 1-A intake/business-tip QBI, positive
Marketplace health/PTC coupling, ordinary NIIT source methods, educator mixed/
joint attribution, remaining education source methods and complete preview/
cross-document auditing. The parent is implementing the authorized transient AI
calculation transport: complete facts stay in a separate private request, only
server-recomputed mapped audits and redacted text reach the task adapter. Human
review, provider evaluation and promotion remain closed. Inventory, full current
local/remote checks, final images/scans and recovery must run after integration.
External inputs remain pending; the active goal is not complete.


Follow-up commits `d0dd710`, `2cdc4d4` and `45f497c` preserve actual death-date
senior eligibility, 2026 tip/overtime reporting fields and the linked Schedule
1-A source contract. They pass 58, 143 and 60 isolated cases respectively, with
root types/spec checks and scoped reviews recorded in the owner documents.
Canonical/guided Schedule 1-A integration is still active.

Remote CI at `edde2a0` now has 17,010 passes and one failure across 725 files:
a prior test assumed one header rule after account recovery intentionally added
a stricter second rule. `f919bb3` reproduces that red result and verifies the
exact global/recovery rules, all recovery privacy headers and no relaxation of
CSP/framing. Exact staged tree `bf9cd5758a95889048c774eabb4eff5edb89f910` passes
37 header/auth-recovery/telemetry tests. Inventory is still stale and final full
coverage remains required. The private AI transport currently passes 136 nearby
tests, but independent review has found a source-name redaction gap; it is not
yet committed and remains active work.

### Current integration and bounded PDF performance work — October 27 UTC

Marriage-health is delivered and pushed in `9c077851` after final source and
original/PDF reviews. See [its ledger](upgrade-2025-marriage-health-work.md).
The parent final 192-case/31-file run preserved all 3,560 archived entries and six
independent controls; the main 31-case/7-file check, types, spec and inventory pass.

The separate PDF performance commit `99592823` is also pushed. Its exact six
source blobs passed independent review and 18 tests, including six private
controls. The parent compared 24 saved PDF pairs/50 paired pages with 1,855 field,
text, geometry, notice and pixel assertions and inspected all contacts. Main
integration passes 128 tests in 19 files, root/contract/web types, 5,874 spec refs,
the unchanged 553-row inventory and build. See [the performance ledger](upgrade-2026-pdf-field-batch-work.md).
No deadline, coverage threshold, tax value, privacy control or readiness gate was changed.

Completed remote `927399be` evidence records 19,420 unit passes, both 484-case
browser suites and native amd64 recovery success. Coverage passed19,415 cases
and failed five unchanged 5s PDF deadlines; no complete coverage report exists.
The verified runtime archive has 309 entries and SHA256
`2dcb9d1e3b4a5c4cec607b7f6df7436d82cd6ab9e90f2d6f1c9f68bac77995be`.
Its six recovery phases preserve nine database tables, exact costs, two synthetic
tenants, browser facts and original document bytes. The finite network observer
saw 398 requests without raw private markers. The 157 image matches/67 OS advisories
remain identical to the prior scan, with no critical/npm/fixed-version matches;
owner confirmation remains pending. See [the runtime record](upgrade-2026-runtime-927399be.json).
These are CI artifacts, not staging, production or human-review qualification.

New full CI/Web runs 40440878207/40440878223 target `99592823` and remain in
progress. Raw passive-capital source review passed 33 tests in 11 files including
seven independent controls. Parent original/PDF review passes 10,742 checks
across 122 PDFs/262 pages/836 populated fields, with all 17 contacts and eight
readable pages inspected. The two retained reader mistakes were corrected
without changing product code or saved artifacts. Final integration remains active. Bond reissue/ownership sources and shared-marriage health continue
privately. Charity prior-floor, positive-benefit COD and changed-membership
histories remain in the finite queue. External review, staging credentials,
provider evaluation authorization and final-form gates remain unchanged.
