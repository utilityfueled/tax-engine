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
