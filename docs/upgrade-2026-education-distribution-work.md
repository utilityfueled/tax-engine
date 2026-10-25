# Education distribution source work

Status: implementation in progress. No filing qualification or independent human review is claimed.

Official sources refreshed 2026-10-25: [Pub. 970](https://www.irs.gov/publications/p970), [Form 1099-Q instructions](https://www.irs.gov/instructions/i1099q), [Form 5329 instructions](https://www.irs.gov/instructions/i5329), [IRC529](https://uscode.house.gov/us/usc/119-124/t26/s529/), [IRC530](https://uscode.house.gov/us/usc/119-124/t26/s530/), [PL119-21 sections70413–70414](https://www.govinfo.gov/content/pkg/PLAW-119publ21/html/PLAW-119publ21.htm), and [IRS Topic313](https://www.irs.gov/taxtopics/tc313).

- [x] Inspect current source law and existing implementation. Existing global QTP aggregation, unconditional Box4 exclusion, and raw scholarship-dollar earnings exception are not sufficient for verified2026 calculations.
- [x] Write source-first specification covering identities, expense allocation, K12/credential changes, account worksheets, actual transfers and additional tax.
- [x] Red-first ordinary distribution/source/schema calculations and Decimal implementation; source edge cases below remain explicitly blocked.
- [x] Federal actual-recipient and final education-credit allocation reconciliation (6b07529); loan and educator source reconciliation remains coordinated separately.
- [x] Guided source collection and actual credit/distribution expense coordination; source UI package evidence below.
- [ ] Audited reference summary and actual Form5329 PartII owner integration.
- [ ] Relevant suites, diff review, saved-PDF inspection, scoped commits.

The2026 K12 limit is20000 across the beneficiary's QTPs;2025 remains10000. Expanded K12 and credential categories apply to distributions after July4,2025. These effective dates come from the statute; the current2025 Pub970 K12 summary does not fully describe the expanded categories. QTP account aggregation was repealed after2014; Coverdell instead retains its beneficiary expense ratio and individual account basis worksheets.

The source contract will preserve unknown facts. Other-recipient income stays outside this taxpayer's return. Education-credit allocations are elected facts, validated against linked actual student inputs and the final allowed credit; the software will not invent reallocations. Final2026 instruction/form qualification, human tax review and release gates remain tracked by the parent checklist.

## Core package evidence (2026-10-25)

The source path now separates QTP statements, applies the2026 beneficiary K12
limit and enactment dates, coordinates actual education-credit/loan allocations,
uses account-level Coverdell worksheets, and produces actual recipient results.
It validates rollovers, ABLE/Roth/refund capacity, actual transfer basis, and
same-beneficiary Coverdell contributions to QTPs. Source and report amounts use
Decimal. Blank Coverdell earnings/basis remain absent until the account worksheet
supplies them. Old aggregate aliases must be reconciled and removed before using
the verified source ledger. The original2025 aggregate profile is explicitly
unverified and is not represented as current source qualification.

Red tests caught repeated use of Roth eligible funds, duplicate refund capacity,
and separate-statement Coverdell rounding. All were corrected without changing
coverage thresholds. Capacity facts represent reconciled baselines before the
included transfers; inconsistent histories are rejected rather than silently
refreshing an allowance. Actual source changes in five-year eligibility require
reconciled account histories, not merely a repeated annual transfer allowance.

Validation:
-102 focused tests across core/source/edge files pass.
-Module-only V8 coverage:94.85% statements,87.25% branches,100% functions/lines.
-493 adjacent tests across11 files pass, including existing reference-PDF,
 PA/IL/NY consumers and identifier-redaction checks.
-Root types, scoped lint (zero warnings), and all3663 current spec references pass.
-Logs: `.local/upgrade-evidence/education-core-coverage.log`,
 `education-core-adjacent.log`, `education-core-types.log`, `education-core-lint.log`,
 `education-core-spec.log`; failing-first logs retained beside them.

Stable result contract: `perDistribution` contains `accountType`, actual source,
account and beneficiary links, owner/other-recipient identity, gross/earnings/basis,
valid transfers, allocated expenses, taxable earnings, separate
`educationExpenseExcludedEarnings` and `transferExcludedEarnings`, and exceptions.
`perRecipient` provides taxable earnings and PartII additional tax. Other recipients
are retained for review but excluded from this return's income/tax totals.
`creditAllocations` and `loanInterestAdjustments` support the final federal
no-double-benefit checks; those checks are a separate orchestration package.

Remaining internal work, in execution order:
1. Federal year/source forwarding, final8863 allocation validation, and actual
   student-loan/educator exclusion reconciliation (federal/facts owners).
2. Guided statement, beneficiary, expense/credit/loan allocation, transfer and
   exception collection; invalidate confirmations after source edits.
3. Source-audited reference PDF and actual per-owner Form5329 PartII mapping,
   combined with existing per-owner HSA/retirement sections.
4. Returned Coverdell contributions (codes2/3) and prohibited transactions (code6)
   require separate source-year/account reconciliation; the current source path
   throws explicitly for these statements. They are remaining software/source
   cases, not external qualification evidence. No taxable amount is silently
   assigned to the current year.
5. Independent software review and complete relevant suites after integration.

External qualification remains distinct: final2026 form/instruction availability,
independent human tax review and release evidence are not supplied by synthetic
fixtures or these software tests. The parent checklist retains those gates.

Independent Ohio software review: exact parent commit7a337a0, no actionable
findings. Reviewed source fidelity, Decimal reconciliation, unknown/zero handling,
confirmation invalidation and shared preview/export overlays. Independently ran
`pnpm test tests/guided-interview/guided-ohio-interest.test.ts tests/apps/web/ohio-interest-interactions.test.tsx --maxWorkers=1`:
6 tests passed in2 files; log `.local/upgrade-evidence/ohio-interest-independent-review.log`.
This is agent software review, not independent human tax qualification.

Exact staged-tree archive720b19d8 also passed the102 focused tests, root and web
types, and all3653 spec references present in that archive. The first isolated
test invocation reported the missing PDF-test Python configuration; rerunning
with the existing pinned `.local/pdf-test-venv/bin/python` passed. No dependency
or threshold was changed. Immutable test log: `education-core-immutable-tests.log`.


Core source package committed as `eaaeb04`. The following source-link correction
adds `loanInterestSourceAdjustments` per actual expense, retaining borrower totals
for compatibility. This prevents one loan's unused interest from hiding a
positive overclaim on another loan. The vector contains expenseId, borrowerId,
owner, actual interest paid, claimed interest and exact tax-free earnings used
for that expense's interest. `interestPaid` covers entered education-ledger
expenses only, not every loan payment the borrower made during the year.

Red-first per-expense regression failed on the missing vector, then passed with
103 core/source/edge tests (107 including the four in-progress intake tests).
Root types and scoped lint passed. Logs: `education-loan-source-red.log`,
`education-loan-source-green.log`, `education-guided-types.log`, and
`education-guided-lint.log`. No changes to the rounding or exclusion formula.


## Guided source intake (2026-10-25)

Added actual statement, beneficiary, expense, allocation, transfer, loan-history,
Coverdell-basis and exception controls. Blanks remain unknown; explicit empty-list
confirmation is required. Currency retains exact Decimal source strings. Edits
clear source confirmation while retaining values and local opaque links. No
provider or external transport was added.

Parent agent review found a section-validation gap: the engine bridge checked
actual linked education-credit students, but the section validator did not pass
those inputs. A failing-first regression now covers mismatched students,
excessive credit expense allocations and missing student inputs; both paths
reject them. A second failing-first regression prevents confirmation-only edits
from repeatedly invalidating linked sections. The shared comparison omits only
sourceFactsConfirmed metadata; actual qualification answers remain substantive.
The reciprocal student-loan/educator integration is owned by the facts agent.

Validation:614 guided/DOM tests across42 files passed before the review correction;
8 focused intake/credit/DOM tests passed after it;14 focused intake/PDF tests
passed after confirmation-cycle correction. Root/web types and scoped lint are
recorded in education-guided and education-intake-pdf logs. Shared bridge lint
has nine existing non-null-assertion warnings, zero errors; new owned files have
no warnings. The review is software review by an agent, not human tax approval.

The source-link follow-up is committed as `2f8abd7`; federal recipient/final-credit
integration is `6b07529`. Source/reference PDF and returned-contribution/deemed
transaction cases remain separate internal work. No2026 mapping or filing gate
was enabled.

Immutable staged UI tree `5cd7883e` passed all8 targeted intake/credit/DOM tests,
root types and all3682 spec references. The full working UI also passed web types.


## Audited education reference PDF (2026-10-25)

Guided source intake was committed as `9f2ce31`. The reference summary now copies
unique, finite canonical return, statement, Coverdell account, recipient and
loan-expense audits. It preserves unreported boxes and unknown legacy answers;
other-recipient amounts are shown separately from own-return totals. It rejects
missing, duplicate, wrong-form, nonfinite, mismatched-year or inconsistent audit
values. Long source labels wrap and paginate, and every page has one visible
review-only notice. Opaque source links and student tax IDs are omitted.

Parent agent review identified two missing source comparisons. A new failing-first
regression proved changed QTP Boxes2/3 and outside-recipient identity could retain
an old calculation. The correction requires exact QTP source amounts and actual
recipient identity. Reported Coverdell Boxes2/3 must jointly sum to Box1 and their
whole-dollar amounts must match the audited worksheet; absent boxes stay absent.
The official worksheet example's reported141.67/708.33 remains distinguishable
from calculated whole-dollar142/708. This is software review, not tax approval.

Four source-summary regressions plus legacy reference and federal integration
checks passed (14 tests total). Root types and scoped lint passed after the source comparison correction;
checks are recorded in education-reference-review/types/lint logs.
The synthetic three-page artifact is
`.local/upgrade-evidence/education-reference-2025/f1099q-reference-filled.pdf`.
All pages were rendered and the footer was inspected separately: each page has
one visible notice. No2026 filing map or readiness gate was enabled.

Remaining internal work in this slice: individual Form5329 PartII attachment and
same-owner HSA merging; returned Coverdell contributions (codes2/3), prohibited
transactions (code6) and their source-year/basis reconciliation; final integrated
student-loan/educator reconciliation and adjacent suites. Actual final2026 form
qualification, independent human tax review and release evidence remain external.

Immutable staged reference tree `31246d3d` passed14 focused tests, root types and
all3692 spec references. Logs: `education-reference-immutable-tests.log`,
`education-reference-immutable-types.log`, `education-reference-immutable-spec.log`.

## Individual Form5329 education review (2026-10-25)

Reference mapping committed as `05fd72a`. Reopened official2025 Form5329 and its
instructions: PartII is required when taxable education distributions are
included in income, including amounts fully excepted from additional tax; a
joint return uses a separate form for each affected individual. The packet now
unions actual education and HSA owners and copies the canonical source audits
into one form per individual. Other recipients remain outside the return.
Unresolved legacy joint-return parts are rejected rather than assigned to one
spouse, including prior excess absorbed with zero additional tax. A single
actual taxpayer can retain other legacy parts alongside source PartII.

Red-first owner tests initially failed all three cases. Final28 focused tests
across4 files passed, covering source audits, identities, zero-tax exception
attachment, single-owner other parts, HSA/education union and existing HSA/legacy
mappings. Root types and scoped lint passed. Logs: education-5329-owner-red.log,
education-5329-final-tests.log, education-5329-types.log, education-5329-lint.log.
Saved PDFs in `.local/upgrade-evidence/education-5329-2025/` were reopened and
checked: primary line5/8/49=200/20/6, spouse=400/40/42. Rendered PartII and HSA
PartVII fields occupy the official physical lines and retain review notices.
All values and identities are synthetic; no2026 filing qualification is claimed.

Parent agent independently reviewed the owner5329 diff and reran all5 new source
owner tests, with no actionable findings. Evidence:
`.local/upgrade-evidence/parent-5329-owner-review.log`. This is software review by
an agent, not independent human tax or filing qualification.

Immutable owner-review tree `11c6cc90` passed28 focused tests, root types and
all3708 spec references (education-5329-immutable-* logs).

## Returned Coverdell contribution sources (2026-10-25)

The individual owner Form5329 package is committed as `4a8e8e2`. The next source
package handles actual Coverdell codes2/3 separately from ordinary distributions.
Refreshed official continuous Form1099-Q instructions, IRC530(b)(4)/(d)(4)(C),
Pub970 Worksheet6-3 and Notice2003-53. Sources:
- https://www.irs.gov/instructions/i1099q
- https://uscode.house.gov/us/usc/119-124/t26/s530/
- https://www.irs.gov/publications/p970
- https://www.irs.gov/irb/2003-33_IRB#NOT-2003-53

Actual contribution identity/year/date/amount, returned principal, signed
custodian net income, previously reported income and corrected account-basis
confirmation are preserved without defaults. Timely code3 statement earnings
belong to the prior contribution year. A following-year statement can therefore
support the current return; a current-year statement for prior-year income does
not enter current taxable income. The result retains the signed source income
adjustment for review, without computing or submitting an amended return.
Correction principal/earnings are excluded from ordinary account expense ratios
and require the actual corrected ordinary contribution/basis worksheet.
Reported nonfinal loss boxes remain0/gross while the actual signed loss remains
visible; a loss does not manufacture a deduction. Statutory timely-returned
amounts have no10percent additional tax. Actual transfers, ordinary expenses or
other exception records cannot be assigned to the same correction.

Spec-first tests initially failed for the unsupported codes and incomplete-source
marker. Additional review tests proved an outside recipient could be omitted
from the reference while own-return totals still reconciled; the mapper now
requires every source recipient and correction identity exactly once. The
135-test adjacent run passed before those final two review tests; both new
review tests pass. Root/web types and scoped lint passed. Global spec validation
at that point was blocked only by a separate mortgage UI testRef still being
implemented; the staged package is checked separately before commit.
Logs: education-corrections-red.log, education-corrections-marker-red.log,
education-corrections-intake-red.log, education-corrections-adjacent.log,
education-corrections-review-red/green.log and education-corrections-final-*.
The two-page synthetic reference at
`.local/upgrade-evidence/education-correction-2025/f1099q-reference-filled.pdf`
was saved, reopened and rendered. It distinguishes statement2026 from income2025,
retains the actual100 earnings/40 prior reported/60 difference, and has one
visible review notice per page (including separately rendered page2 footer).

Still internal: prohibited transaction code6 source rules; ordinary Coverdell
rollover-basis line attribution and cents/ending-basis boundaries; final combined
education/educator/source integrations. No filing or independent human
qualification is claimed.

## Adjacent independent agent reviews (2026-10-25)

Reviewed the parent's Ohio year-specific exemption/joint-filing cutoff changes
against the official2024 and2025 booklets, including2024 absence of the new
high-income cutoff and2025 MAGI before exemptions/cents boundary. No actionable
findings; independently ran12 tests, all passed. Evidence:
`.local/upgrade-evidence/oh-exemption-independent-review.log`.
Reviewed the parent's declarative final2026 Form4952 candidate against the current
IRS PDF, SHA25690b9fc0bd6778983521b61ed5c94cc5668e62af858e38e94a1a6fd4b631bfb6d,
printed labels/locations and rendered synthetic proof. Its17 text fields match,
the four source pages and notices remain, and it has no runtime export imports.
All3 candidate tests pass in `ai-4952-candidate-review.log`. No actionable
findings. These are software/source reviews by an agent, not independent human
tax or export qualification.

Parent agent independently reviewed the returned-contribution package against
current official instructions/statute and reran all8 source/PDF tests, passing
(`parent-coverdell-corrections-review.log`). No actionable findings. Calendar
April15 contribution timing covers the supported2025/2026 returns and their
adjacent correction years; special postponed deadlines require their actual
source authority and are not inferred from an untimely date.

Final immutable staged tree `96bc22f0` passed all136 adjacent tests, root types
and all3735 spec references. The initial isolated run caught only a missing-audit
error label mismatch in the existing owner5329 test; the diagnostic was corrected
without changing its assertion or gate. Final logs:
`education-corrections-immutable-final-tests.log`,
`education-corrections-immutable-final-types.log`,
`education-corrections-immutable-final-spec.log`.

## Ordinary Coverdell basis and rounding (2026-10-25)

The returned-contribution package above is committed as `affeef4`. The next
source review reopened [Publication970 Worksheet6-3](https://www.irs.gov/publications/p970)
and [Form1040 whole-dollar rounding](https://www.irs.gov/instructions/i1040gi).
Four red tests exposed negative ending basis from combining exact input cents
with rounded distributed basis, and mislabeled current rollover adjustments on
official prior-basis line2. Worksheet input amounts now round consistently;
multiple amounts for one line aggregate before rounding. Separate source audits
retain every exact account value. Current rollover adjustments use a distinctly
labeled reconciliation worksheet, with unchanged actual prior-year basis on
line2. A fifth red test showed individual rounding could lose transferred basis
across small statements; allocation now preserves the rounded account total.
An exact or rounded negative available-basis contradiction rejects explicitly.

The reference validates source history, account/beneficiary identity, worksheet
identity and rounded source-input lines against their canonical audits. A
mutation regression first failed, then passed after altered worksheet inputs
were rejected. The broad adjacent run passed123 tests across13 files; root
types, scoped lint and all3765 working-tree spec references passed. Logs:
`coverdell-basis-red.log`, `coverdell-rollover-rounding-red.log`,
`coverdell-basis-reference-red/green.log`, `coverdell-basis-broad.log`,
`coverdell-basis-types.log`, `coverdell-basis-lint.log`, `coverdell-basis-spec.log`.
Saved/reopened two-page synthetic reference:
`.local/upgrade-evidence/coverdell-basis-2025/f1099q-reference-filled.pdf`.
Rendered page2 and its separate footer show the rollover labels and one visible
review notice. Exact incoming basis200.49 remains distinct from rounded200.

Separately, reviewed the parent's government-payment source package against
current IRS1099-G instructions12/2026, Publication525 and Rev.Rul.2025-4.
No actionable findings within the supported routes. Its9 tests passed in
`ai-1099g-source-review.log`. This was an agent software/source review.

Remaining internal education work: actual prohibited-transaction source capture
and separately identified unsupported treatment, plus final educator/distribution
coordination. No human qualification, filing enablement or live evidence is
implied by these local checks.

Parent independently reopened Worksheet6-3 and the whole-dollar instructions,
reviewed the ordinary-basis/source/PDF diff and reran all5 new tests. No
actionable findings; `parent-coverdell-basis-review.log` records the passing
agent review. The rollover interpretation remains subject to independent human
qualification. The final rounded-source input mutation checks also passed.
Immutable staged tree `1a7a6b7e` passed all123 adjacent tests, root types and
all3765 spec references, with code6 work excluded. Logs:
`coverdell-basis-immutable-tests.log`, `coverdell-basis-immutable-types.log`,
`coverdell-basis-immutable-spec.log`.

## Code 6 source records and source-route boundaries (2026-10-25)

Ordinary Coverdell basis/source/PDF work is committed as `932d8a3`.
The next spec-first package preserves actual Coverdell account-disqualification
and pledged-portion records: event kind/date, source reference, actual basis,
January1 account value or pledged amount, and explicit source confirmation.
Missing facts remain unknown across parsing. Known facts are validated against
the event year and reported Box1. Ordinary transfer treatment cannot be mixed
with code6. The visible intake explains that these records can be saved while
the calculation remains unsupported.

The official [1099-Q instructions](https://www.irs.gov/instructions/i1099q) and
[section530(e)](https://uscode.house.gov/us/usc/119-124/t26/s530/) refer to rules
similar to408(e)(2)/(4). The official2024 edition of408 establishes January1
disqualification and deemed distribution of the pledged portion. The current
408 endpoint could not be retrieved; that edition is labeled in the spec and
corroborated only as a cross-reference by the current IRS/current530 sources.
The interaction of the deemed distribution, section72 basis, education-expense
exclusion and post-disqualification income is still an **internal calculation
gap**. Neither actual source confirmation nor external approval enables a
guessed amount, ordinary worksheet, or zero-income fallback.

A separate regression exposed new source fields falling back to the historical
2025 aggregate route when the ledger was omitted. Any actual source field now
selects source validation, including explicit false confirmations. Historical
aggregate-only inputs retain their visibly unverified compatibility path.
Optional actual `distributionMedium` (`cash` or `in_kind_prepaid_tuition`) is
preserved in the statement and per-distribution result without an inferred
cash default. This supplies the factual distinction needed by the separate
educator reconciliation.

Source, routing and DOM tests were red before implementation. All497 affected
tests passed before the optional-medium addition; the final98 source/intake/PDF
tests, root and web types, and scoped lint passed after it. Logs:
`education-prohibited-source-red.log`, `education-prohibited-source-second-red.log`,
`education-prohibited-ui-red.log`, `education-medium-red/green.log`,
`education-prohibited-all-consumers.log`, `education-prohibited-final-tests.log`,
`education-prohibited-final-types.log`, `education-prohibited-final-webtypes.log`,
`education-prohibited-final-lint.log`. The simultaneous global spec check found
only the other agent's then-unwritten spec-first1099G integration test file;
the immutable scoped package receives its own complete validation.

Bounded independent review of the parent's guided1099G source binding refreshed
the IRS1099G instructions, Publication525 and Rev.Rul.2025-4 and reran six
worksheet/DOM tests successfully (`ai-guided1099g-review.log`). One actionable
source-ID collision was reproduced: distinct payers sharing a local statement
reference produced the same audit source ID. The owner received the exact
case (`ai-guided1099g-identity-review.log`) for correction. This is an agent
software/source review, not human qualification.

The parent corrected that collision using result-local row IDs while retaining
actual payer/owner/reference duplicate checks. All7 worksheet/DOM tests passed
on independent rerun (`ai-guided1099g-identity-fix-review.log`); no remaining
actionable finding in that bounded review. The parent independently reviewed
this code6 source package and reran all6 focused tests with no actionable
findings. A code6-only archive based on `8f7c622` passed98 tests, root types and
all3772 spec references (`education-prohibited-isolated-{tests,types,spec}.log`).

### Finite remaining education checklist

- [x] Implement, review and verify the code6 source/medium package; keep the
  calculation explicitly blocked. The commit reference is recorded in the next
  package entry so the executable commit does not need its own hash in advance.
- [x] Implement and independently review the separately specified outside-
  recipient credit-allocation fix.
  Its new regression first failed, then38 source/integration/owner-PDF tests
  passed. Final credit validation must include affected outside recipients;
  their earnings and additional tax remain off this return.
- [x] Complete and verify educator coordination with the federal owner using
  actual `distributionMedium` and per-owner excluded education earnings.
  Distinguish cash QTP earnings from basis, transfers and prepaid/in-kind
  distributions; preserve unknown sources rather than infer cash or zero.
- [ ] Implement the code6 method once its unresolved legal treatment is
  established. The bounded follow-up research is complete; the source package
  itself does not close the calculation gap. Retrieved sources include
  [Notice2001-81](https://www.irs.gov/pub/irs-drop/n-01-81.pdf),
  [IRS account guidance](https://www.irs.gov/irm/part21/irm_21-006-005r)
  and [IRS education-distribution analysis](https://www.irs.gov/irm/part4/irm_04-019-003r).
  These describe ordinary education distributions or the analogous IRA event;
  none retrieved so far expressly resolves whether and how section530(d)(2)
  applies to the deemed code6 amount, the pledged-portion basis method, and
  post-January1 disqualification income. A general ordinary worksheet cannot
  supply those missing methods. This is an internal unresolved legal method,
  separate from missing taxpayer records and release/human qualification.

The additional [official2024 section72(e)(9)/(8)(B) text](https://www.govinfo.gov/content/pkg/USCODE-2024-title26/html/USCODE-2024-title26-subtitleA-chap1-subchapB-partII-sec72.htm)
establishes ordinary pro-rata allocation for an ESA. [Publication590-A](https://www.irs.gov/publications/p590a)
explains the analogous IRA January1 distribution and gain over basis. These
do not establish that the ordinary ESA year-end worksheet remains correct for
a pledge whose assets remain in the account, or resolve the education exclusion
after disqualification. Required next decision: an authoritative interpretation
and source-backed worksheet for each subtype, including basis/carry and
post-disqualification income treatment. Then add actual dated account-income
source bindings, independently derived examples and return/PDF integration.
Existing event facts and the ordinary source ledger are retained for that work;
an approval flag or a manually supplied taxable amount is not a replacement.

Exact staged tree `b8a95076` passed98 tests, root types and all3779 spec references
after the other agents' preceding commits. Its eight staged files excluded
the new Form7206 source schema,1099G orchestration and the separate outside-
recipient guard. Logs: `education-prohibited-staged-{tests,types,spec}.log`.

## Outside-recipient education-credit coordination (2026-10-25)

The source/medium package is committed as `6965daa`. A separate red regression
showed that an expense allocation could create taxable earnings for an outside
recipient while the return's fully phased-out credit escaped final validation.
The coordination vector now includes every linked beneficiary source. Own-return
taxable earnings and additional tax still use their separate actual recipient
filter. The passing allowed-credit control retains735 outside-recipient taxable
earnings and717 attributable to credit allocation while this return retains
zero distribution income, zero distribution additional tax and AGI50000.

The parent independently reviewed this one-line calculation change and its eight
assertions with no actionable findings. Working and isolated source/integration/
owner-PDF runs each passed38 tests. The separate archive based on `8f7c622`
passed root types and all3767 spec references. Logs:
`education-outside-credit-red.log`, `education-outside-credit-green.log`,
`education-outside-credit-final.log`,
`education-outside-credit-isolated-{tests,types,spec}.log`.
No source expense is silently reassigned and no filing or human qualification
claim follows from this software correction.

Exact staged tree `f9414b63` passed38 tests, root types and all3780 spec
references; the scoped lint check reported no findings. Logs:
`education-outside-credit-staged-{tests,types,spec}.log` and
`education-outside-credit-lint.log`. Only the core guard, its spec/regression and
this evidence document are included in the package.

## Educator education-exclusion reconciliation (2026-10-25)

Outside-recipient credit coordination is committed as `475e96d`. The finite
educator follow-up adds a pure reconciliation helper; federal placement remains
with the federal owner. It compares each confirmed educator's declared
reductions exactly to calculated current-year exclusions for that actual
recipient. It excludes another recipient, returned contributions, basis and
transfer earnings. A positive QTP education exclusion needs actual cash medium;
unknown and in-kind prepaid treatment remain unresolved. An explicitly supplied
zero with no source result is the educator's declaration of none, not an
inferred external record.

Sources reopened: [current section62(d)(2)](https://uscode.house.gov/us/usc/119-118/t26/s62/)
(the retrieved page includes laws through PL119-120, October7,2026),
[final2025 Schedule1line11 instructions](https://www.irs.gov/instructions/i1040gi),
[Publication970 chapters6/7](https://www.irs.gov/publications/p970) and the
[linked Publication529](https://www.irs.gov/publications/p529), whose 12/2020
QTP-earnings wording is corroboration only. No old publication supplies2026
eligibility or inflation amounts. The basis/earnings distinction follows the
actual source calculations; the helper does not recalculate distributions.

A positive final bond exclusion binds directly only when every eligible actual
source establishes the same taxpayer or spouse owner. Mixed or jointly
registered bonds remain blocked because the retrieved sources do not establish
a discretionary per-owner split. Parent independent review identified that a
confirmed taxpayer worksheet could not replace the missing statutory method;
the proposed manual-allocation schema and acceptance were removed before commit.
The regression rejects even a supplied confirmed split. A zero final exclusion
remains zero. Source interest must reconcile to the rounded Form8815 interest
worksheet before attribution; no rounding difference is assigned to an owner.
No halves, proportional shares or external amounts are inferred. The audit uses
owner labels and calculated values without exposing private source references.

Spec preceded the new tests/helper. The first suite could not import the absent
helper; the initial implementation then exposed one fixture expectation that
incorrectly used source-box cents instead of the upstream worksheet's rounded
exclusion. The corrected fixture preserves the existing upstream calculation.
An intermediate source-capacity red regression helped identify the allocation
boundary; the final method rejects all positive mixed/joint allocations pending
authority rather than validate a discretionary split. All6 final helper tests
pass (`educator-exclusion-joint-guard.log`). The preceding56-test source cohort
passed before that review correction; final adjacent and immutable checks follow.

Source-derived controls: cashQTP Box2 amounts200.10 and100.20 produce final
upstream exclusions200 and100; the helper requires those final amounts. The
published ESA850 distribution/1500 basis/950 ending-value example yields142
education-excluded earnings when fully qualified. An eligible paperEE bond with
10000 proceeds less8000 principal has2000 interest; below the phaseout threshold
its final exclusion binds to its actual sole registered owner. A noneducator
spouse's exclusion remains with that spouse. Mixed-owner or jointly registered
bonds do not become a primary educator's exclusion merely because a joint
return was filed. No taxpayer-supplied allocation establishes missing tax law.

The guided intake currently has no actual Form8815/bond-record path. The parent
assigned that narrow intake as the next finite education package, coordinated
with the facts agent's flow/bridge ownership. It remains internal software work,
not an external credential or qualification blocker. No filing readiness or
model promotion gate is changed.

Bounded independent review of the parent's Ohio government-income adapter found
no actionable findings after refreshing ORC5747.05(E) and the final2025 Ohio
Schedule of Credits line12. All3 new tests passed independently in
`ai-oh-government-review.log`. This is agent software/source review only.

Final reviewed helper checks:56 tests across five files, root types and scoped
lint pass. Exact staged tree `4483931d` independently passes the same56 tests,
root types and all3820 spec references. Logs:
`educator-exclusion-reviewed-{tests,types,lint}.log` and
`educator-exclusion-staged-{tests,types,spec}.log`. The archive uses the pinned
local PDF Python environment required by the test launcher. The working-tree
web check encountered only the separate in-progress health-insurance intake
fields; no web files are included in this core package. Four scoped files are
staged; the discarded owner-allocation schema is absent.

### Actual savings-bond intake (2026-10-25)

The preceding educator reconciliation core is committed as `7fcf2ab`. The parent
independently reran its six corrected cases and reported no remaining actionable
finding in the bounded sole-owner method (`parent-educator-exclusion-review.log`).
The positive mixed/joint ownership gate remains in place; a confirmation does
not authorize a missing tax-law allocation method.

Added actual Form8815 intake beside education distributions in the credits
section. The controls collect original bond dates, registered ownership and
birth date, face value, redemption proceeds, prior interest reporting, actual
beneficiary/institution expenses and benefit allocations, statement adjustments,
and signed royalty/territory MAGI worksheet facts. Blank and false remain
distinct. Explicit empty lists are possible; adding a record creates only a
local opaque link. No exclusion, income amount, date or eligibility is invented.
The original bond serial-number record remains with the taxpayer.

Refreshed the official [Form8815 endpoint](https://www.irs.gov/pub/irs-pdf/f8815.pdf)
and [Publication970](https://www.irs.gov/publications/p970). The form endpoint
still serves the final2025 form/instructions. This intake forwards the actual
return year to the existing year-aware calculation; it does not qualify a2026
physical form or change readiness. The helper validates source arithmetic and
actual Form1099-INT Box3 capacity, without running a hypothetical zero-MAGI
calculation. Canonical federal calculation retains the phaseout and final audit.
Source edits invalidate linked bond/distribution/educator confirmations; toggling
confirmation metadata alone does not create a reciprocal confirmation loop.

Spec and new source/DOM tests preceded implementation. Initial red runs failed
on the absent helper/component (`guided-bond-red.log`, `guided-bond-dom-red.log`).
An independent numerical fixture has10000 proceeds,8000 principal and500
previously reported interest:1500 current interest/exclusion,500 actual statement
adjustment, and100 separate Box1 interest remaining on the return. The unchanged
review-only reference summary shows the same principal, interest and exclusion.
Exact decimal preservation is exercised beyond JavaScript's safe-integer range,
including a signed royalty adjustment and actual2026 source forwarding.

Current owned/adjacent cohort:417 tests across nine files pass
(`guided-bond-owned.log`); root/web types and all3858 spec references pass.
Scoped new-file/component/test lint has zero warnings. The shared bridge retains
two existing non-null warnings at its unrelated lines443/450. A broader guided
run passed680 cases and found one separate in-progress Form7206 integration
expectation, reported to its owner; no bond case failed. Exact staged verification
and parent source review follow before this intake commit.

The identity follow-up is separately committed as `fe4afa8`; the canonical
educator handoff is `1dac908`. The parent's review identified that separately
entered birth dates and recipient assertions were insufficient. The intake now
calls the same return-identity validator used by the engine, using actual
PersonalInfo and claimed dependents. Joint registration collects an explicit
actual age-test owner; changing registration clears that role. Beneficiary IDs
are entered as source facts, never inferred from names.

A fresh DOM-to-engine case enters every fact through visible controls, starts
without any computed completeness marker, and obtains the independently derived
1500 exclusion. The schema computes completeness from actual raw presence.
The parent's initial concern about a hidden UI flag was withdrawn after the
preprocess was checked; no user-editable provenance override was added.
Both DOM cases pass (`bond-new-row-review.log`). The guided, DOM and real review
PDF/encrypted-recovery cohort passes (`bond-ui-privacy.log`); its recovery test
confirms full identity is used before rendering, redacted copies reach the real
PDF renderer, source state is untouched, and encrypted import restores the exact
original beneficiary ID and monetary strings. Existing recursive review redaction
already covers the tax-ID suffix, so no redundant rendering mutation was needed.

The canonical return identity boundary is committed as `196ee90`; the intake
package has completed its immutable verification. The remaining education
implementation queue contains the three tax methods listed below. The ordinary/returned-
contribution Coverdell calculations, outside-recipient final-credit guard,
per-expense student-loan linkage, sole-owner educator reconciliation and source
intake are implemented. The following methods stay explicitly unresolved, with
facts retained and calculation blocked rather than guessed: Coverdell code6
education exclusion/deemed-distribution basis and post-disqualification income;
positive mixed/joint bond attribution to individual educators; and non-cash or
unknown QTP medium in educator reductions. These are bounded internal tax-method
gaps, separate from unavailable taxpayer facts and independent human/form/release
qualification. An approval flag cannot supply the missing legal method.

Exact intake staged tree `6511ea52` passed all665 tests across49 guided,
review-PDF and privacy files, root/web types and all3,868 spec references.
The parent independently reran all8 guided/DOM source cases successfully with
no actionable findings (`parent-guided-bond-review.log`); that is an agent
software review, not independent human tax qualification. Logs:
`bond-ui-staged-{tests,types,web-types,spec,lint}.log`.
The staged shared flow/bridge changes contain only the bond integration and
merged credit-source invalidation; the concurrent health intake stays separate.

### Bounded Coverdell code6 whole-account method (2026-10-25)

The bond intake is committed as `d5edc89`. Refreshed current
[IRC530](https://uscode.house.gov/us/usc/119-124/t26/s530/), the official
[IRC408 edition](https://www.govinfo.gov/content/pkg/USCODE-2024-title26/html/USCODE-2024-title26-subtitleA-chap1-subchapD-partI-subpartA-sec408.htm),
[IRC72](https://www.govinfo.gov/content/pkg/USCODE-2024-title26/html/USCODE-2024-title26-subtitleA-chap1-subchapB-partII-sec72.htm),
[Reg1.408-4(d)](https://www.ecfr.gov/current/title-26/chapter-I/subchapter-A/part-1/section-1.408-4),
and the continuous [Form1099-Q instructions](https://www.irs.gov/instructions/i1099q).
The parent independently checked the narrow method against the official sources.
This is agent source/software review, not independent human qualification.

The implemented branch uses actual January1 whole-account value and basis,
requires an explicit Decimal total of zero qualified education expenses
(including eligible QTP contributions under530(b)(2)(B)), and requires an actual
full-year source review confirming no subsequent income, gains or losses. It
rejects another statement for the terminated account, conflicting beneficiary
expense/credit/QTP records, ordinary year-end account history and any claimed
additional-tax exception. Basic code6 event completeness alone cannot enable it.
Reported Boxes2/3, when supplied, must reconcile exactly to the actual basis
and earnings. Actual source cents remain intact; only taxable income is rounded
to the physical-line dollar. No ordinary annual Coverdell worksheet is reused.

An independent synthetic1000 January1 value less700 basis gives300 taxable
earnings and30 additional tax. With1000.50 value and700 basis, source earnings
remain300.50 while taxable earnings round to301 and additional tax to30.
Both2025 and2026 canonical returns route actual own-recipient income once to
Schedule1line8z and actual owner Form5329PartII. Outside recipients remain outside
this return's income and additional tax. The interview collects the actual zero
total and later-activity facts without defaults; editing invalidates confirmation.
The review reference requires the dedicated disqualification audit and matching
source boundaries, and preserves exact source cents.

Spec and tests preceded implementation. Four core tests initially failed against
the existing block; two surface tests initially failed on the absent intake
fields and ordinary-PDF rounding. Parent review found that a missing credit-
student ID could be mistaken for a known different beneficiary. A new regression
reproduced that error; missing/invalid AOC or LLC identities now reject while
actual different-student expenses remain separate. Positive unassigned LLC
aggregates also reject. Logs are `coverdell-disqualification-{red,surfaces-red,
identity-red,identity-green,related,types,web-types,spec,lint}.log` under the local
evidence directory. The initial related run passed149 tests across16 files;
immutable final verification follows the review correction.

The synthetic2025 reference was saved, reopened and rendered. Both pages have
exactly one visible review notice; page2 was also inspected as a separate footer
crop. The final2026 filing/export qualification remains unchanged. The first
render attempt used an unavailable default font-cache path; rerendering with
the repository's existing `.local/pdf-fonts.conf` succeeded. Evidence lives in
`coverdell-disqualification-reference/`.

Remaining finite methods: (1) code6 with positive qualified expenses, pledges,
basis losses or subsequent income still needs its own controlling tax method
and actual source routing; the new zero-expense whole-account branch does not
claim those cases; (2) mixed/joint bond educator attribution needs actual income
ownership and a supported allocation of final Form8815 exclusion; (3) prepaid
in-kind QTP educator reductions need a supported treatment distinct from the
implemented actual-cash earnings method. Current Pub550 Table1-2 identifies
co-owner income by actual purchase funds/community-property treatment; it does
not by itself establish an arbitrary split of the final education exclusion.
Research and implementation of these bounded methods continue separately.

Final immutable code tree `150d2363` passes150 tests across16 source, return,
guided, DOM and PDF files; root/web types, all3,912 spec references and scoped
lint pass. Logs: `coverdell-code6-staged-{tests,types,web-types,spec,lint}.log`.
The exact staged shared model delta contains only the three optional
disqualification facts and their comments; concurrent tips/Schedule1-A sources
remain outside this package. This closes the narrow actual-zero-expense method,
not the remaining broader methods or any independent qualification gate.
