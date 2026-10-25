# Education distribution source work

Status: implementation in progress. No filing qualification or independent human review is claimed.

Official sources refreshed 2026-10-25: [Pub. 970](https://www.irs.gov/publications/p970), [Form 1099-Q instructions](https://www.irs.gov/instructions/i1099q), [Form 5329 instructions](https://www.irs.gov/instructions/i5329), [IRC529](https://uscode.house.gov/us/usc/119-124/t26/s529/), [IRC530](https://uscode.house.gov/us/usc/119-124/t26/s530/), [PL119-21 sections70413–70414](https://www.govinfo.gov/content/pkg/PLAW-119publ21/html/PLAW-119publ21.htm), and [IRS Topic313](https://www.irs.gov/taxtopics/tc313).

- [x] Inspect current source law and existing implementation. Existing global QTP aggregation, unconditional Box4 exclusion, and raw scholarship-dollar earnings exception are not sufficient for verified2026 calculations.
- [x] Write source-first specification covering identities, expense allocation, K12/credential changes, account worksheets, actual transfers and additional tax.
- [x] Red-first ordinary distribution/source/schema calculations and Decimal implementation; source edge cases below remain explicitly blocked.
- [ ] Federal actual-recipient and final education-credit allocation reconciliation.
- [ ] Guided source collection and actual credit/distribution expense coordination.
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
