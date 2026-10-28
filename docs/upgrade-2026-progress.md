# 2026 upgrade implementation evidence

## Current checkpoint — 2026-10-28 UTC

The latest implementation is `7702ba56`: determined current charitable floor
carry now follows the allowable deduction calculation under either standard or
itemized treatment. Rule provenance is `2025.190` /
`2026.188-law-integration-draft`; inventory has 582 entries, 6,167 spec references
and 163 explicit associations. The frozen source passes 732 affected tests;
independent source review passes 48 tests in twelve files, including 22 private
controls. Parent derives 27 saved originals and passes 7,936 source, arithmetic,
handoff and gate checks. Main integration passes 132 tests in 39 files, all
three typechecks, spec/inventory, scoped lint and engine build. The frozen-source
desktop/mobile browser checks pass 2/2 with zero retries; no 2026 PDF is created.
See the [charitable carry ledger](upgrade-2026-nonitemized-allowable-carry-work.md).

This supersedes the no-floor-under-standard premise in `6fc4312d` and related
methods. Earlier software evidence remains historical, with the legal correction
recorded in the [source finding](upgrade-2026-charity-floor-source-finding.md).
Prior-vintage floor attribution and newly basis-admitted gift portions remain
separate work. The signed minimum-tax-credit primitive is delivered in
`ecdb754d`; its [source-year ledger](upgrade-2026-minimum-tax-credit-source-year-work.md)
records 63 independent and 83 main integration tests. Current-year source binding
and final integrated release checks remain internal work. Human tax review and
filing qualification remain open.

The later [183c1bbc CI run](upgrade-2026-ci-183c1bbc.json) passes all 19,735
unit tests in 1,463 files, static checks, both builds and both 520-case browser
suites; each browser suite retains five hosted-only skips. Coverage retains
12 five-second timeouts and 19,723 passes, so this run does not establish a
passing coverage gate. The [amd64 runtime evidence](upgrade-2026-runtime-183c1bbc.json)
passes all six recovery phases and preserves the same 157 scan matches across
67 OS advisories. Advisory ownership remains pending. Bounded performance
investigation and final current-source checks remain internal work.

Source research supports a new section 170 admission year for a portion newly
allowed by an entity basis limit, while retaining its actual historical gift
and all previously admitted portions. Independent controls reproduce
four ordinary-gift at-risk classification failures while two controls pass:
sufficient-basis gifts are incorrectly included in the activity-loss calculation.
That correction is separate from first-entry attribution and the delivered
current-floor package. Section 108 source review passes 37 tests in five files,
including fourteen separately derived private originals. Saved-output testing
found a stale pre-cancellation foreign-credit balance and a Form 982 pagination
overflow; both corrections are under verification. Canonical signed current-year
minimum-tax-credit binding and zero-NOL foreign-credit composition remain
internal follow-through, not completed methods established by guards.

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

The finite internal queue is now reconciled against actual source reachability:

- **Education:** common per-expense composition and actual current-year retained
  refund records and determined annual category/borrower limits are delivered.
  The bounded annual interest-only route is now delivered. Mixed July4 chronology,
  mixed-purpose interest attribution remain. Educator/MAGI reconciliation is
  delivered in `00089be4`, with independent source and saved-output reviews. Actual bond reissue/ownership history is delivered in `c6abb245`. See [the education queue](upgrade-2026-education-method-queue.md).
- **Charity:** prior K-1 basis release and ordinary operating K-1 current
  Form 172 classification and current binding at-risk allocation are delivered.
  Prior at-risk character/history and passive capital releases are delivered.
  Charitable filing-unit ownership histories are delivered in `2a8f6c17`.
  Positive benefit with COD/modified absorption, NOL filing histories and
  recurrent partial-joint owner attribution remain in active work or precise
  source-method review. See [the charity queue](upgrade-2026-charity-method-queue.md).
- **Health:** reported-versus-original advance cents are delivered. Signed
  negative Worksheet W remaining-capacity treatment and its actual business
  gross-income source handoff and actual own-family zero-credit cash are also
  delivered, along with actual eligible outside-family persons and their separate
  return evidence. The unshared and shared full-family marriage compositions are delivered.
  Actual monthly partial-family composition is delivered in `05c5819`.
  Outside-family marriage composition is delivered in `977212bf`. Determined
  positive advance/payment and positive other-return credit attribution remain
  in the finite health queue.
- **Verification:** intermediate remote `25f71f06` now passes full coverage
  and every unchanged threshold. Run the complete checks on the final integrated
  source and retain final native images, SBOM/scans and recovery evidence.
  The cancelled container run is not complete runtime qualification.

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

## Previous checkpoint through63b4c4f

The branch is pushed through `63b4c4f`. Rule provenance remains `2025.129` /
`2026.126-law-integration-draft`; the regenerated inventory has 493 entries and
5,306 test references. All readiness gates remain unchanged.

Actual PA royalty intake and workspace handoff are delivered in `9173d20`.
Its immutable cohort passes 486 tests in 9 files, root/web types, spec validation,
lint and production build. Separate review passes 10 cases in 5 files. Both
desktop and mobile production browser cases pass with zero retries; their
screenshots were inspected. The package ledger preserves original failures,
review evidence and the exact tested hashes.

`95e4276` adds meaningful actual digital-asset, OID and child-election panel
interactions. Its immutable candidate on `ee0132c` passes all 18,790 tests in
1,111 files and the unchanged coverage gates: functions 90.64% (10,240/11,298),
branches 86.81% (46,994/54,135), statements 92.02%, lines 94.59%. The initial
sandbox run could not open synthetic localhost services and produced no coverage
report; the unchanged rerun passed with task-local networking. Separate review
caught all three stale-confirmation mutations. Final integration passes 498/10.
Logs and hashes are saved under `.local/upgrade-evidence/investment-panels-complete`.
This candidate excludes later source packages; current integrated verification
is still required. No threshold, exclusion, timeout or assertion was relaxed.

`63b4c4f` completes passive-distribution Schedule E and full-packet follow-through.
Capital gain stays on8949/D; it no longer appears as ordinary Schedule E income.
Review reproduced a removed-source bypass, which is now rejected before PDF I/O.
The corrected frozen tree passes 510/7 and separate review passes 33/3, including
all four unchanged private probes. Final main integration passes 30/3. Nineteen
saved PDFs were independently reopened: 30 literal fields, privacy and one
review notice per page pass; all 35 rendered pages were inspected. This package
changes no tax calculation or form qualification.

The previous full `ee0132c` unit and production-browser evidence remains valid
only for that source: 18,785/1,108 and 396 browser passes, with five hosted-only
skips. Its function-coverage failure is retained, separately from the newer
passing candidate. Current63b4c4f CI and Web were observed in progress; the
preceding three heads were cancelled. No completed current remote result is
claimed. The earlier package audit and76e3538 local runtime/recovery/scan evidence
remain separate; final-source artifacts and advisory acceptance are due.

Shared-policy/self-employed-health source coordination and full-shell source
reachability, actual EIC history/current8862, single-category charitable NOLs and
remaining charitable/education source methods continue in private workspaces.
Their guards and prerequisites do not count as completed end-user methods.
Current full checks, final images, recovery and support reconciliation follow
integration. Sources, exact checks and commit references remain in each ledger.

The goal is active and the upgrade is **not release-ready**. Human reviews and
controlling interpretations, provider account access and approved budget,
authorized staging, launch-state demand, final forms and advisory acceptance
remain unresolved. Public upgrade-branch pushes are expressly approved.
Production deployment, filing and model promotion remain disabled/unauthorized.

## Prior execution evidence

Recent packages add actual current-loss intake (`8cf0e8e`), ordinary investment
capital origins (`3ff896c`), original digital-asset sources (`e7bd6e8`) and all
twelve Form8949 reporting categories with complete review packets (`5006088`).
The reporting tree passes1,756 tests in145 files, root/web types,4,603 spec
references, both builds and separate seven-case/probe review. Original-only DA
returns include8949, exact source columns reconcile and every continuation row
survives an independent PDF parser. Rendered amounts, privacy and notices pass.
Actual AI evaluation/schema/provenance/model binding (`f4da2a6`) and refreshed
provider lifecycle enforcement (`b828ee4`) are also reviewed and pushed. Package
ledgers record exact trees, checks and findings. These checks do not establish
human, provider or final-form qualification.

Source-bound positive1202 origins (`678fe38`), positiveATNOL/current-cash charity
(`f5b096f`), long-term originalDA ScheduleD binding (`905d219`) and originalDA
packet readiness (`81668db`) now have exact package checks and separate agent
reviews. All applicable filing/year gates remain closed. The negative-net1202
interpretation stays disabled and requires a qualified tax reviewer; the user
is not expected to resolve the tax arithmetic.

The actual PA/OH digital-source handoff (`4aef633`) passes4,264 tests/154files,
roottypes,4,634 references, lint and separate12-case review. Three reference
pages are rendered/inspected. Guided intake is committed in `a66b5de`. `b5a0675` removes
repeated PDF test field scans with all assertions and deadlines retained; both
independent four-case runs pass. Full coverage on committed`4aef633` passes
17,754 tests in918files, with86.98%branches against the unchanged85%gate.
All three type checks,4,634spec references, both builds and lint pass; its
regenerated 392-entry inventory passes freshness validation. The full browser
run records 340 passes, five hosted skips and two missing-reader prerequisite
failures; both affected cases pass with the pinned reader. The shared launcher
and CI prerequisite repair is reviewed, committed and pushed in `b31b5df`. Native arm64 image
`535c87589d0d` built after removal of one proven task-owned obsolete build cache
and its unused parents resolved a disk failure.
A second selected cache was in use and was preserved. Smoke and six-phase
upgrade/recovery/rollback pass. The refreshed scan has the identical157 OS
package/advisory matches (67advisories,0critical,0npm,0available fixes); owner
acceptance remains pending. See `upgrade-2026-runtime-4aef633.json`.

Full unit integration of committed `fab31fe` with the regenerated396-entry
inventory passes17,787tests in927files, zero failures/skips, in473.55seconds.
The inventory is committed in `59eae66`. This excludes later charity/COD
guided changes and is separate
from coverage, browser, runtime and staging qualification. Original DA document
sources are committed in `119ff16`; the broader guided cohort passes 785 tests,
and separate 14-case and 12-case source reviews pass. `9da0bab` repairs a
reproduced independent PDF-reader stdin stall by reopening the saved bytes, with
all four tests, assertions and the original timeout retained.

Full verification at `1791979` passed17,577 tests,86.91%branch coverage against
the unchanged85%gate, all required types/spec/build/lint checks and328 production
browser cases with zero retries. Five hosted billing cases were skipped and
provide no staging evidence. Later packages need another full integrated run.
CI at `9da0bab` passes17,725 cases but fails one fourteen-page PDF timeout
and stale inventory. The measured lookup repair is committed in`b5a0675`; inventory392entries
are regenerated from committed`4aef633`.
Observed`59eae66` unit/type/lint/spec/build steps pass; its coverage/browser
were still running before subsequent package pushes. No completed remote
coverage/browser result is inferred. A fresh package audit at`59eae66` reports
zero findings across 521 locked entries; OS advisories remain separately tracked.

The [public capability and entry-path audit](upgrade-2026-enabled-scenario-audit.md)
passes64focused gate cases and corrects stale self-host persistence instructions.
Review reproduced a missingDA ScheduleD copy action and generic-state DA
withholding omission; both are fixed in `a66b5de`, with781tests and two
desktop/mobile browser cases plus separate11-case review. Separate charity
review reproduced early percentage rounding and changed exact amounts surviving
PDF checks. The corrected reporting package `9015b41` passes27parent review cases,
1,476broad cases and476final rebase cases. A separate three-probe audit
confirms legacy2025 gift eligibility/year defects; their source correction
and actual charitable history work continue. The subsequent frozen charity
review on`7dac725` reproduces five additional current-method/identity defects:
private cash limits, ordinary property basis and unknown basis, empty-history
invariance, and original identity binding before PDF access.20package cases pass;
all five are fixed inea2f422 with unchanged parent regressions passing.

Capital-origin intake is committed and pushed in `9d71c5f`: 795 adjacent
tests, 32 post-COD integration checks, types/build and both desktop/mobile cases
pass, with separate source/DOM review. The finite implementation queue continues
with actual prior and mixed charity history and2026 nonitemizer carry.
Guided debt-cancellation sources are committed in`f006285`:795tests/84files,
root/web types,4,678spec references, production build, two desktop/mobile
flows and11independent review cases pass. The source-bound COD core is independently reviewed and committed in
`bb5cbe6` and pushed: 713 tests in 34 files, root/web types, 4,665 spec
references and separate 16-case review pass. Four saved review pages were
rendered and inspected. The negative-net1202/Form172 overlap remains a named interpretation
question; unaffected methods continue. Both AI scorer review defects are fixed,
but all240evaluation cases remain human-unreviewed with zero live measurements.
Final enabled-scenario auditing, inventory, all integrated checks, native
images/scans and recovery rehearsal remain. The IRS's current1040, ScheduleD
and8949 downloads still identify2025; no2026 final mapping is inferred.

Staging credentials/authorization, synthetic provider budget/account access,
independent human reviewers, launch-state demand and final forms remain external
inputs. Human review, filing, live AI promotion and production gates stay closed.
A blocker in one package does not stop other authorized implementation work.

## Starting point

Started 2026-10-24 from `f1f79ec5c38a770cc1f4989e67a12d6ac44f3fda`.
Remote refreshed before edits; no upstream commits were missing. The existing
`docs/reviews/` documents were preserved. Formal verification is out of scope.

## Baseline and security patch package

- Node 24.22.1, pnpm 10.34.8, Node 24 types; versions verified against the
  official npm registry and [Node release](https://nodejs.org/en/blog/release/v24.22.1).
- Compatible requested dependency updates, retaining TypeScript 5.9.3,
  Decimal.js 10.6.0 and pdf-lib 1.17.1. Next remains 15.5.28 in this first package.
  Vite 7.3.7 and PostCSS 8.5.23 address transitive advisories; OpenTelemetry API
  1.9.0 satisfies the SDK's `<1.10.0` peer requirement.
- Hash-pinned Python/pypdf setup and explicit interpreter selection; deterministic
  committed coverage inventory with a stale-file check. The inventory records
  implementation references and is explicitly not filing qualification.
- The auth limiter regression test isolates Better Auth's password delay;
  separate auth tests still exercise Better Auth. CORS tests resolve Next from
  the web workspace, avoiding an accidental hoisted dependency.
- Hosted production requires Redis at startup and rejects protected operations
  on missing configuration, errors, or Upstash's fail-open timeout response.
  Local/self-host requests retain memory limits. Outage responses are 503, quota
  responses remain 429. Tests simulate independent local stores and recovery;
  live Redis/multi-instance staging validation remains required.
- CI now requires coverage, contracts/web type checks, inventory freshness,
  browser flows on every PR, and an image smoke/SBOM job. Docker copies public
  assets and blank templates. These workflows are configured, not yet run remotely.

Local checkpoint: 14,982 tests passed in 471 files with Python enabled. Engine,
contracts and web type checks passed; Next 15 build passed. Coverage was 91.19%
statements, 81.14% branches, 90.55% functions and 91.68% lines. **The 85% branch
gate fails and has not been weakened.** Coverage includes web and shared-package
code as well as the engine. Browser and container execution are separate checks.

Audit refresh: 6 critical / 54 high initially; 0 critical / 1 high after the
compatible patch pass. The remaining `pdfjs-dist` advisory requires its separate
major migration; this checkpoint is not a clean security release. Audit counts
do not establish deployed exploitability. The SBOM job scans the built runtime
image using [Syft](https://github.com/anchore/sbom-action), not just manifests.

Raw local logs are in ignored `.local/upgrade-evidence/`. No staging or production
deployment, live billing, provider quality evaluation, or independent tax review
has been performed. Existing PDFs and state “supported” labels do not establish
filing readiness or e-filing capability.

## Next 16 migration

Next and its ESLint plugin are pinned to 16.4.3. Development and production
builds explicitly use webpack to preserve the source aliases, following the
[official migration guide](https://nextjs.org/docs/app/guides/upgrading/version-16).
Web type checking and the production build pass. The first full test run had
14,981 passes and one obsolete Docker-context assertion; the corrected test now
requires blank templates and excludes filled returns (48 focused tests pass).
Browser qualification is in progress; nested main landmarks were reproduced.
The generated Next type references are retained.

## PDF.js 6 security migration and browser baseline

PDF.js is pinned to 6.4.299, with a matching bundled browser worker. Extraction
releases pages/loading tasks, disables worker resource fetching, and bounds the
optional `pdftotext` subprocess to 15 seconds. Providers still receive redacted
text only. Two real-library synthetic tests check exact text, page order,
malformed input and subsequent recovery. Web type checking and production build
pass. The post-migration audit reports zero advisories (488 dependency entries).
This is an advisory scan, not a security certification or deployed SBOM.

The four browser landmark checks pass after removing nested main elements.
The full browser baseline exposed obsolete onboarding helpers and was stopped
after repeated failures; its upload/confirmation/export lifecycle is not yet
qualified. Next's local generated agent guidance is retained.

## 2025 SALT and child-credit correction

Sources retrieved 2026-10-24: [2025 Schedule A instructions](https://www.irs.gov/instructions/i1040sca)
and [2025 Schedule 8812 instructions](https://www.irs.gov/instructions/i1040s8).
Specs were updated before 30 literal regression cases; 23 failed before the
implementation. The child credit is $2,200, with the separate $1,700 ACTC cap.
SALT uses the $40,000 maximum, MAGI phase-down and $10,000 floor. MFS halves the
worksheet result after phase-down ($20,000 maximum/$5,000 floor). Form 2555
exclusions and housing deduction are added back, with explicit Puerto Rico and
Form 4563 addback inputs. Schedule A audit lines 5b–5e now match the published form.

Older unit and integration fixtures were updated for the changed limits,
including moving full phase-out and exact-tax-liability cases to the new credit
boundaries. The full suite passes: 15,015 tests in 473 files. Spec validation,
engine/web/contracts type checks pass. Expected worksheet literals are agent
derived; **independent human tax review remains pending**. This corrects the
reported amounts and SALT phase-down, not all 2025 eligibility/ACTC branches.
The taxable-refund worksheet still models the prior 2024 SALT regime; it must be
made year-aware before using it for a 2026 return. No filing claim is enabled.

## Explicit year boundary

The 2026 alias is removed. The 2025 constants and nested Decimal values are
frozen, with separate version/source/retrieval/review metadata for each year.
The 2026 pack is explicitly incomplete and rejects federal calculations;
unknown years also reject. This closes the silent fallback but does not yet
implement 2026 law. Standalone empty PA Schedule D calculations no longer need
federal constants; home-sale exclusions still reject unavailable rules.
All 15,018 tests, engine type checking and spec validation pass.

## Guided year, identity and money boundary

Guided interviews now carry an explicit year through storage, federal/state
preview and export validation. Legacy saved interviews without a year retain
an unknown year until the user confirms it; a workspace mismatch blocks output.
The form collects actual primary/spouse birth dates and residency, and requires
complete dependent identities and explicit credit answers. No count-generated
children, default birth dates, default addresses, or zero-to-twelve residency
conversion remain in this adapter. Missing employer IDs and trade dates stay
empty. Credit qualification itself still needs the broader eligibility work.

Monetary parsing and aggregation in the guided bridge and preview use Decimal;
malformed nonempty amounts reject instead of becoming zero. The deduction UI
shows expenses before tax limits and no longer claims that raw totals are tax
savings. Required-fact and year failures cannot fall back to a workspace preview
PDF. Tests use explicit synthetic facts, not production defaults.

Local results: 15,019 tests pass; web type checking, spec validation and focused
lint pass. Browser flows still need updating and rehearsal. This package does
not yet replace the separate advanced-preview synthetic input, qualify credit
eligibility, or remove all legacy mortgage/donation/payment defaults. Those
remain blockers to complete filing exports.

## Stripe 23 migration

Stripe 23.0.1 is pinned with API `2026-09-30.endive` in both clients and the
test-mode webhook rehearsal script. Checkout now uses
`allowed_payment_method_types`, following the [Endive change](https://docs.stripe.com/changelog/endive/2026-09-30/remove-payment-method-types-checkout-sessions).
Web type checking and 57 billing/auth tests pass, including retry/duplicate
handling and credit-purchase event tests. No Stripe account or endpoint settings
were changed. Before deployment, create a test-mode Endive endpoint, replay
duplicate and failed credit events against the real database, reconcile credits,
and rehearse reverting both the application commit and endpoint version. The
previous Dahlia application and endpoint must be retained until that passes.

## 2026 indexed data (partial pack)

Independent 2026 data now records ordinary brackets, standard deductions,
capital-gain thresholds, EIC table parameters, AMT limits and the Social Security
wage base. The AMT reduction rate is year-specific (25% in 2025, 50% in 2026).
Sources: [Rev. Proc. 2025-32](https://www.irs.gov/irb/2025-45_IRB),
[IRC 55](https://uscode.house.gov/us/usc/119-118/t26/s55/), and
[SSA](https://www.ssa.gov/OACT/COLA/cbb.html), retrieved 2026-10-24.
The spec preceded tests and implementation. All 42 new cases pass; the full
suite has 15,061 passes after fixing two literal spec test-name references.
Engine type checking passes. These rate-schedule and exemption cases are not a
complete Form 1040/6251/EIC qualification, and full 2026 calculation remains
blocked. Independent review, remaining law, form numbering and mappings remain
required. The source check also identified a pre-existing 2025 single/HOH AMT
phase-out threshold error; its correction is a separate change.

## Additional 2025 AMT regression

The single/HOH phase-out threshold is corrected from the 2024 amount to $626,350,
as specified by the [2025 Form 6251 exemption worksheet](https://www.irs.gov/instructions/i6251).
Sixteen literal boundary cases were added after the spec update; 12 failed before
the correction. Existing fixtures now use the correct 2025 threshold. All 15,077
tests pass. Prior-year Form 8801 amounts were preserved. This does not qualify
the full Form 6251 mapping or all AMT adjustments.

## Review PDF boundary

The return orchestrator rejects filing-purpose exports, mismatched calculation
years and unavailable mapping years before reading/writing PDFs. Current 2025
mapping metadata explicitly says review-only; 2026 mappings remain unavailable.
Each exported page carries `FOR REVIEW ONLY - NOT FOR FILING`, including web
cover pages and supplementary state summaries. Web downloads remain ID-redacted,
use review filenames and no-store headers, and require guided taxpayer facts;
the synthetic advanced preview can no longer become an exported return.
Readiness responses explicitly report `filingQualified: false`.

The full suite has 15,080 passes; focused PDF/readiness/route tests and web type
checking pass. A shared-output race in older PDF tests was found and those
fixtures now use isolated temporary directories. The existing blank-template
files still need per-form revision/hash qualification and physical year
versioning. These safeguards do not establish complete-data filing exports.

## AI candidate registry and accounting groundwork

Task profiles now record model/provider/effort, versioned prompt/schema IDs,
input/output budgets, timeout, escalation and confirmation requirements. New
profiles remain candidates: the registry returns deterministic fallback in
production. No provider account capability or model quality is certified by this
configuration. Cache-key components include owner, content, year, rules, task,
model, effort and prompt/schema versions; no taxpayer cache was enabled.

Pricing was refreshed against [OpenAI](https://developers.openai.com/api/docs/pricing)
and [Google](https://ai.google.dev/gemini-api/docs/pricing) on 2026-10-24.
Decimal accounting distinguishes exact provider USD cost from the minimum
one-cent retail charge, handles supported cache/long-context/regional prices,
and switches Google pricing on 2027-01-01 UTC. Unknown prices fail explicitly.
Legacy helper billing uses this accounting and reports whether token counts are
provider-reported or estimated. Workspace Responses requests and Gemini requests
now enforce the configured output reservation (default 4,096, including reasoning);
Gemini calls have bounded timeouts. Statement amount ordering uses Decimal.
All 15,090 tests and web type checking pass at this checkpoint.

Remaining AI work is substantial: the legacy live routing and hand-scored model
benchmark still need replacement; document normalization must move behind the
task adapter; 200–300 independently reviewed cases, held-out repeated live runs,
citations, measured latency/cost, atomic credit reservation/settlement, database
cost persistence and staged rollout/rollback are not complete. The new registry
is groundwork, not a model promotion. Existing GPT-5 Mini is now marked deprecated
in its official model documentation; actual account availability remains unchecked.

## Candidate document adapter and Decimal input handling

Document analysis now uses task-specific, strict schemas behind the shared
adapter. Only a trusted synthetic evaluation caller can run candidate profiles;
production falls back to deterministic parsing. Calls accept redacted text only,
use fixed provider endpoints, `store: false` for Responses, bounded response and
input/output sizes, and no hidden retry or provider switch. Source quotes and
Decimal comparisons reject invented amounts, dates and duplicate suggestions.
Merchant/category evidence never establishes business use. Source quotes survive
normalization for review. Hosted document routes retain access checks but do not
reserve or debit AI credits when no provider call occurs.

Currency display and statement aggregation no longer round-trip amounts through
JavaScript numbers. Large-cent regressions fail before the fix and pass after it.
The adapter records provider-reported costs even when content validation fails;
HTTP/transport failures with unknown usage still require later reconciliation.
No provider was called in these tests. All 15,126 unit/integration tests pass at this checkpoint.
Web type checking and focused lint pass. Production-browser currency entry tests
pass for dependent care and solar fields.

This replaces the document path, not the legacy live workspace responder or
hand-scored benchmark. Exact cost persistence, atomic credit reservation,
independent evaluation/review, and production rollout remain unfinished.

## Statement duplicate preservation

The redacted text adapter preserves repeated transaction lines in source order.
Removing duplicate lines could erase separate purchases, refunds or transfers.
The added regression failed before the change and passes afterward; this is a
local deterministic check, not a provider extraction evaluation.

## Measured AI evaluation harness

The four-model union and hand-assigned quality/latency scores are removed.
The harness lists effort-specific candidate profiles and both requested baselines,
uses strict run records, and computes monetary/date exact match, abstention,
grounding, human review results, P50/P95 latency, actual cost and January 2027
cost with Decimal. Failed outputs and the single permitted escalation still
contribute cost; unknown usage prevents promotion review. Duplicate run records,
unknown profiles, invalid usage and excess escalation reject.

The generated corpus has 240 **draft, unreviewed** cases across eight tasks and
ten scenario families with three variants each, including 80 fixed held-out
variants. This is a scaffold for review, not 240 independently validated scenarios.
The committed live-run file is empty. Actual application-schema validation,
independent expected-output/PII review, broader scenario diversity and live runs
remain required. All 20 focused harness/CLI tests pass. They simulate measurement
records; no model was called. No recommendation is emitted from configuration,
and even a passing report cannot activate production routes. See
[the evaluation procedure](strategy/model-stack-eval.md).

## Public support boundaries

The new `/support` matrix reports year, jurisdiction, residency, scenario and
output limits. All filing and electronic submission remain unavailable. Public
help/home text and state labels now distinguish an existing implementation from
qualification; the six dedicated state engines are not represented as reviewed
filing support. The guided generic preview is explicitly unqualified too.
The 78 focused support/copy tests pass. This status page is a disclosure, not
completion of the state gap analysis or a selection of launch states.

## Advanced preview facts and local deletion

Advanced document-only previews no longer manufacture a taxpayer, filing
status, birth date, SSN or address. The input adapter requires explicit taxpayer
facts and matching year before calculating; hydration discards legacy synthetic
previews. Guided calculations use their separately validated facts. Positive
adapter tests now supply named synthetic test fixtures explicitly.

Deleting a workspace also removes its scoped guided answers and mode preference,
even when its main record is already absent; another workspace is preserved.
An unversioned `fw2.pdf` filename no longer selects the 2026 sample fixture.
The new deletion, stale-preview and ambiguous-filename regressions pass. This
package does not complete every eligibility or residency rule, nor remove the
remaining legacy mortgage, donation, retirement and education assumptions.

## PDF test isolation under coverage

A coverage run alongside the browser suite exceeded the default five-second
limit in one test that built three full PDF packets in sequence. The loss, gain
and no-residual cases are now separate tests with individual temporary outputs
and matching spec references; no assertion or timeout was weakened. All 15,141
tests pass under coverage after this split. Branch coverage remains **81.52%
(16,261 / 19,946)**, below the unchanged 85% gate; the coverage command therefore
fails. Statements 91.29%, lines 91.83% and functions 90.61% pass their gates.

## Browser baseline and exact display amounts

The production-build Chromium suite now has **293 passes, zero failures and
five hosted tests skipped**, with retries disabled. It exercises upload and
confirmation, missing birth dates, year mismatch, navigation, keyboard/mobile
layouts, review bundle export, reopening and deletion with synthetic data and
provider/billing credentials disabled. Hosted skips are not hosted-service proof.

Browser failures exposed a real guided-section remount race that discarded the
first edit after navigation; sections now use a stable section ID key. Required
fact failures clear the estimate rather than reusing a stale workspace preview.
Fixture confirmations use the source type, not only a human-readable label.
Ticker aggregation, formatting and animation preserve Decimal amounts; large
cent-value regressions now pass. Browser tests use explicit taxpayer fixtures
and actual field labels and assert review-only output.

## Container rehearsal and resource limit

The Dockerfile now includes public assets and blank templates, excludes nested
credential files, and disables build telemetry. The smoke script supports an
explicit Docker or Podman runtime. Next's documented webpack build worker and
memory optimization preserve custom aliases while releasing compiler memory
before TypeScript; the local production build, web type check and 73 focused
browser checks pass after that configuration change.

The first ARM64 Podman image build compiled JavaScript, then was killed with
exit 137 during TypeScript in the existing 4 GiB VM. The bounded-heap retry
stalled, and the VM stopped responding to build/SSH probes. After the approved
restart and resize to 8 GiB, the image built successfully with a 4 GiB build
limit and a 2560 MiB old-space limit. Podman permits only one active managed VM
([documentation](https://docs.podman.io/en/stable/markdown/podman-machine-start.1.html)).

The resulting `linux/arm64` image passes health, public asset, blank-template and
self-host auth smoke checks. Its full production Chromium run has **293 passes,
five hosted skips and zero failures**, with retries disabled (7.1 minutes).
The runtime uses Node 24.22.1 and UID 1001, has no provider keys, and runs in
self-host mode. Runtime old-space is limited to 384 MiB; V8 reports a 576 MiB
total heap limit, and native memory is additional. This is a local synthetic
rehearsal, not a production capacity or hosted-service qualification.

Image config ID:
`sha256:4d1f2179d38d574a5b0b916070272787b0c1b90dbf5c34702a222be31756e721`.
The OCI archive manifest is
`sha256:0da515abf058044ed3ae8ac7ffd16b5cc7b6d7faf6aaf2a146b8acc9fafa28e7`.
Syft 1.55.0, checked against its official release checksum, generated a CycloneDX
1.7 SBOM with 3,770 components from that runtime image. The ignored local file is
`.local/upgrade-evidence/runtime-image.cdx.json`, SHA-256
`2f7d5455a1029b5eacff97628c24b258a47363cb57c4a7f27a09dff7c5845728`.
This SBOM is not a vulnerability scan. The temporary test container was removed;
the local image is retained. No image publication, backup restoration, migration
rollback or version-to-version upgrade rehearsal is claimed.

## Outstanding release work

This branch is an implementation checkpoint, **not completion of the upgrade**.
No deployment, model promotion, filing enablement or electronic submission occurred.

| Work package | What remains before release |
| --- | --- |
| Baseline | Raise branch coverage from 81.52% to at least 85% with meaningful tests; run remote CI and qualify release artifacts on the target platforms. |
| Complete facts | Remove remaining inferred mortgage principal/lender, donation type/date/recipient, estimated-payment date, retirement code/taxable amount and education history; finish residency and eligibility rules. |
| Federal law | Finish the independent 2026 pack, Schedule 1-A, SALT/CTC eligibility/refundability, charitable/itemized/gambling rules, care/adoption/education/529/QBI/PTC and energy transitions/carryovers, year-aware taxable-refund and historical carryover handling. Current 2026 full calculations reject. |
| States and forms | Choose one or two launch states from demand and a documented gap analysis; verify conformity/residency/local taxes and carryovers; version and qualify every final form and mapping. No state is filing-qualified. |
| Filing exports | Implement and test an explicit complete-data export separately from ID-redacted review downloads; retain readiness/year gates. E-filing remains a separate integration. |
| AI routing and billing | Replace the legacy live workspace responder (including preview defaults, minimal effort and implicit Google selection); connect year-specific sources/audits/citations; implement atomic reservations, exact cost persistence and failure/retry settlement. Candidate document routes remain gated. |
| AI evaluation | Independently review and broaden the 240 draft fixtures, collect repeated held-out runs against both baselines, verify provider account capabilities, meet quality/privacy/cost/latency gates, and implement reversible staged rollout. No live model calls were performed. |
| Hosted rehearsal | Exercise real auth/recovery, tenant isolation, persistence/deletion, telemetry, upload limits, Redis/provider/DB outages, Stripe duplicate/retried events, migrations/rollback and backups in staging. Five hosted browser cases remain skipped. |
| Self-host recovery | Complete full-fidelity browser-local backup/import and prove restoration; review JSON bundles are not complete recovery backups. Scan the final image for vulnerabilities, rehearse upgrades/rollback, and publish versioned artifacts only after qualification. |
| Independent review | Human tax/spec/expected-output review, final forms and security/privacy review remain required. Formal verification remains out of scope. |

Reproduce the local checks with Node 24.22.1, pnpm 10.34.8, Python 3.13+
(`pnpm test:setup`), fetched sample documents and Playwright Chromium. The checked
commands are `pnpm test`, `pnpm test:coverage`, `pnpm typecheck`,
`pnpm typecheck:contracts`, `pnpm typecheck:web`, `pnpm spec:validate`,
`pnpm spec:inventory:check`, `pnpm build`, `pnpm build:web`, `pnpm lint`, and
`pnpm test:web`. Coverage fails only its branch threshold after all 15,141 tests
pass. Lint has zero errors and 3,119 warnings. Spec validation resolves all 2,958
test references; reference existence is not assertion correctness. The latest
package audit reports zero advisories across 488 entries; no OS-image scan or
production exploitability conclusion is implied.

## Active completion execution — 2026-10-24

The full execution brief remains the scope. See `upgrade-2026-checklist.md` and
package evidence files for the live checklist and commit references. Implemented
additional explicit taxpayer/source-year facts, historical refunds/QCD corrections,
Schedule 1-A and charitable/gambling rules, encrypted browser recovery, minimal
telemetry, runtime-base hardening and an exact atomic AI ledger. Focused checks
are recorded per package. Agent review found recovery edge cases and ledger
reconciliation work that is being fixed before final verification. No final
coverage, complete tax-law qualification, live-provider evaluation, hosted staging,
filing approval or final release-artifact qualification is implied by these commits.


The latest active diagnostic and remote CI supersede no historical results:
15,581 tests passed and 50 failed during concurrent implementation, with 82.55%
branches and 87.94% functions. CI at `e910507` failed unit assertions and inventory
freshness. Additional privacy, audited PDF forwarding and billing outage packages
passed their focused checks; see the checklist and machine checkpoint for exact
commit/evidence references. Staging, human review, live provider evaluation and
final release qualification remain unproven. The goal is still active.

The isolated `2cb61b3` snapshot now provides a stable diagnostic: 15,929 tests
passed and six failed, with 84.06% branch and 89.81% function coverage. Both
unchanged coverage gates remain unmet. New audited education/minimum-tax PDFs,
post-calculation identifier redaction, document request guards and recovery UI
cancellation packages passed focused checks. The checklist and `ongoingExecution`
record their exact commits. Remote CI at `edd564b` still failed unit regressions
and inventory freshness; further implementation and full verification continue.

The later isolated `05ec24e` run reaches the unchanged coverage thresholds:
85.15% branches, 91.25% functions, 92.49% statements and 93.65% lines. It records
16,112 passing tests and 11 failures (ten stale complete-source fixtures and one
five-second PDF timeout), so the full command is still failed. The current
checklist separates this evidence from the newly passing request-stream,
saved-return UI, AI-credit sales, provider-boundary and foreign-income packages.
Implementation continues through source reconciliation, state interactions,
remaining federal rules and final runtime/recovery verification. No release or
external qualification is claimed.


Execution now includes exact committed-image arm64 Compose upgrade/restart/
backup restore/rollback and encrypted browser recovery (`a2f62e2`), with reviewed
harness corrections and bounded privacy evidence. Native amd64 CI was added
because the local emulator crashed during compilation. Current image advisories
remain explicitly unresolved; staging and independent human review are absent.
PA/OH source reconciliation, actual business sources, per-owner SE and audited
bond/SSA outputs have passed their focused checks. The durable checklist and
machine checkpoint identify the new commits, the running one-worker coverage
snapshot and remaining internal Form2441, rental/OID, fact and federal work.
No completion or release qualification is claimed.

The `c0871d3` one-worker snapshot completed: 16,241 passes and 14 failures,
with no fresh coverage report emitted. Eleven tax regressions are corrected by
`8ca3655`, the malformed-source parser by `fce3094`, and the parent PA fixture
and spec literal-name checker now pass their focused checks. The care core is
`8262f40`. Native amd64 build/smoke and actual Compose recovery passed at
`a2f62e2`; browser and scan results still need inspection. No final release
qualification, staging or independent human review is claimed.

## Continued source integration — 2026-10-25

Commits through `f23a13a` add actual care providers/persons and audited review
PDFs, complete mortgage source facts, actual IRA status, dated installment
penalties, canonical AMT lines and single aggregation of estate deductions.
The care exception follow-up passes all 81 focused tests and canonical/render
checks; `upgrade-2026-care-work.md` records the initial field-length failure
and corrected evidence. The 229-entry inventory was refreshed from this exact
commit. A new immutable coverage run is in progress; it is not yet a passing
gate. Tax-table, retirement, care benefits and state-source packages continue.

The latest immutable`2f8abd7`run has16,677passes and twoPDFaggregate-test
timeouts;86.41%branch coverage and all other thresholds pass unchanged. The full
command remains failed. `76bb3a6`isolates the same assertions into atomic cases
and passes62staged checks; fresh full validation is next. Browser source fixtures,
actual education UI, PAwithholding and ticker timestamp repair are pushed, and
student-loan source core`d162f6c`has127isolated passes. Current exact-code full
browser, inventory and release checks remain required; no human/staging/final
form/provider qualification is claimed. See the checklist for package evidence.


The complete immutable `5d32549` coverage run now passes: 16,770 tests in 676
files, zero skips/failures, 86.50% branches and all other unchanged thresholds.
Mortgage actual-source integration, owner-specific education/HSA review forms
and the Ohio historical MAGI correction are pushed through `aea0779`, each with
focused verification and bounded code review. The latest Ohio archive passes
728 tests. Fresh browser and final integrated release checks remain required;
local synthetic evidence does not supply human, staging, provider or final-form
qualification. Exact logs, hashes and commit scopes are in the durable checklist
and machine checkpoint. Work continues on the remaining packages.

The immutable `ed915c1` production browser run passes 296 tests with no failures
and five hosted-only skips (5.6 minutes, no retries). Student-loan canonical/UI
work, final 2026 Form 4952 physical candidate and actual returned-Coverdell source
years are committed through `affeef4`. The 270-entry inventory is regenerated
from that exact archive. Remote CI at `00bcea1` still reports three source/rounding
fixture or audit-selector failures plus stale inventory; these are being repaired
without changing assertions' tax intent or readiness controls. Full final checks,
human review, staging, provider and final-form qualification remain outstanding.

The branch is now pushed through `603604b`, including source-backed mortgage/OID
fixture corrections, educator eligibility, government-payment sources, Coverdell
basis/rounding and the published 2025 long-term-care caps. A real ticker keyboard
navigation bug is fixed after three failing browser regressions. The isolated
production build/types/lint pass; 54 adjacent browser cases and the corrected
mortgage entry/correction/reopen case pass. This remains scoped evidence, not a
fresh complete suite or hosted qualification. The checklist and machine checkpoint
record exact commits, evidence and the finite remaining implementation/release
queue. Every external review, staging, provider and final-form gate stays closed.

Canonical government payments and actual refund expense years (`0124905`),
their guided worksheets (`e638184`) and Ohio qualifying-income conservation
(`c98cc70`) now pass isolated packages of 674, 219 and 739 tests respectively,
plus relevant types/spec/lint checks and bounded agent review. TIPS, expanded
educator intake and Coverdell source/credit corrections are separately committed.
The checklist and machine checkpoint retain exact trees, logs and limitations.
Form 7206, educator exclusions and Form 8960 remain active implementation;
current full checks, inventory, remote CI and final-image recovery evidence still
must run. No human, provider, staging, filing or release qualification is claimed.

The branch is pushed through `abcb979`, adding actual Form 7206 and Form 4137
source cores, canonical educator exclusions, corrected Form 8960 sources/lines,
household bond identities, pinned SMTP transport and private transactional
hosted account recovery. The recovery package passes 21 isolated tests, including
real disposable PostgreSQL/loopback SMTP, 116 adjacent checks, production build,
types/lint and four desktop/mobile browser cases across both modes. Hosted UI
responses are synthetic; no actual staging delivery is claimed. Exact commits,
trees, failure-to-fix evidence and source links remain in the package documents
and machine checkpoint.

The `e8e169a` full coverage run meets unchanged thresholds (86.59% branches) but
has one audit-fixture failure among 16,889 tests; `c721f07` repairs it and passes
63 isolated cases. Its remote Web workflow passes, while CI finds five adjacent
NIIT audit/source fixtures plus stale inventory. Newer CI is in progress.
Canonical/guided/PDF health integration, tips/payroll, education methods, NIIT
sources, database outage handling and full final verification remain active
internal work. External human/provider/staging/final-form gates remain closed.


Pushed through `edde2a0`: actual health intake/PDF, bounded Coverdell code 6,
separate-owner tip payroll/PDF, NIIT source-fixture repair and bounded real-DB
outage handling now have scoped immutable checks and parent review. Review drove
three additional source/export fixes. Native amd64 runtime/recovery/SBOM CI at
`c721f07` passed and its artifact hash was verified; unresolved OS advisories and
final-HEAD runtime verification remain. The durable checklist records exact
commits, trees, logs and limitations. Remaining law/facts integration and private
AI audit transport continue; no human, staging, model, filing or release
qualification is claimed.


The fixed `7695387` coverage run passes all 17,381 tests across 811 files with
86.84% branches and all other unchanged thresholds. This result is local
synthetic evidence for that exact commit. Later packages add standalone NOL
vintage arithmetic (`1ca69d0`), the corrected joint-only simplified foreign
credit threshold (`f2d018d`), and Schedule D special-gain worksheet arithmetic
(`ae7512d`). Each has focused checks and separate agent review. Actual canonical
source integrations remain active; the full later code, remote CI, final runtime
images and external qualification criteria still need verification.


Pushed through `dec193d`: actual QSBS issuer arithmetic and original source
binding (`9889cba`, `65a9e9f`), canonical regular/AMT/NIIT NOL vintages
(`d89cbe5`), direct foreign-credit intake/reference (`ec6505d`), capital source
intake (`f6da5b2`) and regular/AMT investment-interest intake (`dec193d`). Each
has scoped immutable checks and separate agent review in the checklist. Review
and browser verification drove corrections for overlapping NOL modifications
and child confirmation inserting blank source cards. QSBS canonical integration,
Pub974/NOL coupling, ordinary foreign credits and advanced source intake remain
active. Current remote CI is pending; no final integrated, staging, human,
provider, filing or release qualification is claimed.


Pushed through `3aed6e8`: canonical QSBS regular/AMT/NOL integration (`5a3aab5`),
actual QSBS intake (`3aed6e8`), ordinary regular/AMT foreign credits (`8638b5e`),
Marketplace/NOL coordination (`1f771ba`) and actual regular/AMT NOL intake
(`4925ce1`). The checklist records exact isolated trees, test counts and bounded
agent reviews. QSBS PDF work reproduced omitted categories/overflow/fund-only
forms and a source-context identifier mismatch; the latter now has a failing
regression and correction. Broader PDF checks pass 623 cases on the initial
source tree; final post-review checks and visual verification remain active.
Current remote CI identified stale audit text, browser spec labels and inventory;
those repairs remain internal work. Charity/NOL coordination and advanced facts
continue. No staging, human, provider, filing or release qualification is claimed.


Pushed through `1791979`: QSBS review pagination/source privacy (`cc10a79`),
ordinary foreign-credit intake (`ce607a2`), current charity/NOL coordination
(`c58a59d`), continuing rental carry (`f7745f3`), standalone Form172 origin
(`d5d148b`) and 240 distinct draft AI cases (`1791979`). Each package has exact
immutable checks and bounded agent review in its ledger. The final QSBS suite
passes 1,174 tests and both desktop/mobile downloads. Audit-text/spec-label and
PDF subprocess repairs are separate test commits. Full checks on `1791979` are
running; its 365-entry inventory and package advisories are refreshed. The
current package audit reports zero advisories across 521 locked dependencies.
Mortgage source methods, 8606 rounding/positive-basis facts, canonical current
NOL origin, AI executor/application bindings and final integration continue.
All 240 AI cases remain human-unreviewed and no live measurements, staging,
filing, final forms or release qualification are claimed.


The full immutable `1791979` verification is complete: 17,577 tests/868 files
pass with zero failures or skips; branch coverage is 86.91% against the unchanged
85% gate. Types, spec/inventory, engine/web builds and lint pass. Production
Chromium passes 328 cases with zero retries; five hosted billing cases remain
skipped and provide no staging evidence. Exact log hashes are in the checkpoint.
The branch is now pushed through `fc46b8d`, including mortgage balance/category
intake (`ba451d3`, `d912b8f`), Form8606 rounding (`c7e8ff7`) and independently
reviewed Roth basis/repayment corrections (`fc46b8d`). Later integration, actual
retirement/points/recovery facts, canonical Form172, AI executor review fixes and
application bindings remain active. No human, live-provider, staging, filing,
final-form or release qualification is claimed.


Pushed through `0517691`: actual tuition assistance (`b56402c`), ordinary K1
loss/SE classification (`3e9164`), charitable recipient categories (`6a90c81`),
marriage source validation (`b2f3796`) and tuition assistance/credit/ESA
coordination (`0517691`) have scoped immutable checks and separate agent reviews.
The last package passes433 cases/38 files,27 readiness/export cases, both types
and builds,4927 spec references and lint; all six review pages were inspected.
The checklist/checkpoint retain exact trees and package ledgers. Current full
verification, finite law/facts extensions and final runtime/recovery remain
active. No human, live-provider, staging, filing or release qualification is
claimed. A normal-push approval rejection was resolved using the original
explicit human authorization and verified existing destination; remote HEAD
was checked after the normal push.


Pushed through `6e58929`: actual K1/history intake (`e586f87`), marriage canonical/
review (`55acc15`) and guided sources (`31a1c4a`), current public/other cash carry
(`b153a91`), original-source QBI loss review (`d777a68`) and actual K12 prepaid
plan/cash-cap treatment (`6e58929`) are delivered. Independent review drove the
marriage workspace-context and K12 furnished-date corrections; physical review
corrected8995 zero-floor displays. Final K12 source passes456 tests/41files,
all scoped types/builds,4973 references, both production browser widths and10
independent cases; eight PDFs are retained. Detailed package ledgers and the
checkpoint record exact source hashes and initial failures. Two-owner health,
finite charitable source/history methods and final integrated/runtime verification
continue. No human, live-provider, staging, filing or release qualification is
claimed.


Current direct charitable category carry (`0b5e881`) and the separate K1 semantic
label correction (`3b93d69`) are committed/pushed. Final checks pass646 cases/67
files and565 cases/5 files respectively, with separate parent review and preserved
source blobs. The earlier broader counts included25 unrelated runner/runtime cases
from an extra filename filter; the ledgers explain the difference. Inventory and
all4,979 literal references are refreshed. A new full immutable integration run
follows; prior/floor/NOL charity, actual crypto handoff and two-owner health remain
active. Public source refresh has not created human, provider or staging evidence.


Pushed through `01c98e3`: official source refresh (`5a9cf6b`), corrected verified
crypto carry handoff (`d1d1ff0`) and actual nonbinding two-owner health attribution
(`01c98e3`) have exact source evidence and separate agent review. Full immutable
`9bcf47b` passes18,079 tests/1,028 files, types/spec/inventory/builds/lint and368
production browser cases with zero retries; five hosted-only cases remain
skipped. Coverage fails its unchanged90% function gate at89.96%, while branches
pass85% at86.97%. Parent is adding actual K1 history interaction coverage;
current-law EIC, binding-owner health and finite charity methods continue.
The451-entry inventory,55 source-response hashes, refreshed local base and Grype
DB are recorded. Later final-source checks/runtime/recovery remain due. No
human, live-provider, staging, filing or release qualification is claimed.


Pushed through `f47cb65`: actual default Marketplace allocation, corrected
S-corporation debt ordering, optional K1 charitable source prerequisites, complete
home/review EIC facts and absent investment-input preservation have scoped checks
and separate agent reviews. Immutable `76e3538` passes 18,159 tests in 1,058 files,
all static checks and 374 local production browser cases; five hosted-only cases
remain skipped. Its coverage run has one spec-reference timeout, reproduced and
repaired separately without changing assertions, deadlines or coverage gates.
Full later coverage remains pending. Its exact arm64 image passes smoke and all
six recovery phases; the same 67 distinct OS advisories await owner acceptance.
No publication, staging, human, provider, filing or release qualification is
claimed. The durable checklist records the finite source-method queue and exact
package evidence; autonomous implementation continues.


Pushed through `61bad865`: overlapping original Marketplace sources (`029a182`),
portfolio royalties in NIIT (`14f179a`), unchanged reference checks scheduled by
spec file (`21478d6`), and actual K1 charitable intake (`61bad865`) are delivered.
Each package has separate review and scoped checks. Browser verification corrected
the collector navigation dependency and footer overlay; all four final flows pass.
The immutable67ce5a5 unit suite passes18,265cases/1,083files with all static/build
checks; coverage fails one monolithic spec-reference deadline, so no passing
coverage result is claimed. The repair passes447cases plus independent negative
controls; a fresh full rerun remains due. Inventory478/5,201refs is refreshed.
Exact logs, hashes and package limits are in the checklist/checkpoint. Actual
royalty expenses, separate-business health, distribution gains/intake and the
remaining finite source methods continue. No human, staging, live-provider,
filing or release qualification is claimed.

## Integration through994d92d

The current checkpoint above records the immutable2011778 full checks and the
seven subsequent commits, with original failures retained. Exact run metadata is
in `upgrade-2026-checkpoint.json`; form and source ledgers remain authoritative
for each package boundary. Useful internal implementation remains active.


## Integration through374e117

All required local checks on immutable `d898091` pass: 18,843 tests/1,125 files,
86.84% branch and 90.77% function coverage against unchanged gates, all static
checks/builds, and 402 production browser cases with zero retries. Five hosted
cases remain skipped. Original source hashes, commands and log hashes are in
the checkpoint. Four later reviewed packages are pushed: actual EIC history
prerequisite (`60611f3`), shared health sources/guide/review (`0b65e34`), current
single-category charitable NOL (`360f340`) and distinct tuition assistance
(`374e117`). Their narrower tests do not extend that full-run boundary.
Inventory is refreshed to 498 entries/5,355 references. The finite internal
source-method queue continues; no human, live-provider, staging, filing,
final-form or release qualification is claimed.

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
