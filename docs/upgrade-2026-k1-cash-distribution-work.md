# Original K-1 cash-distribution gain

The charitable source handoff rejected a known positive distribution gain because
its original holding period and gain character were not represented. This package
adds an optional original attachment for a bounded investment-only partnership
interest or S corporation stock. Cash31 with immediately-before basis30 produces
one dollar of owner capital gain through Form8949, ScheduleD and AGI. It does not
increase entity income or create another charitable deduction.

The attachment preserves actual cash, box/code, distribution and acquisition
dates, original activity references and confirmations. There is no entered gain
or allocation override. Missing, false and conflicting facts remain distinct.
The first cohort requires one unchanged cash-acquired block held before the
calendar entity year, cash only, no liquidation or duplicate reporting, and
actual investment-only character. Partnership income must precede an actual
December31 distribution; S corporation uses statutory annual income ordering,
uniform per-share basis and actual absence of accumulated E&P. Debt basis does
not shelter a stock distribution.

Official sources refreshed October26,2026:

- IRC731(a), Reg1.731-1(a)(1)/(3) and Reg1.705-1: cash above original outside
  basis is recognized as interest-sale gain. The published11000/10000→1000
  control is distinct from our synthetic charity/basis controls.
- IRC1368(b)/(d), Reg1.1368-1(c)/(e)(2), Reg1.1368-3 Example2 and Form7203
  instructions: stock income increases precede the no-E&P distribution; direct
  debt remains separate.
- IRC1222, Reg1.1223-3 and Form8949 instructions: actual acquisition anniversary,
  no split/tacked holding inference, C/F reporting without a1099B/DA. Partner
  reporting retains cash and recovered basis; S nondividend reporting puts only
  the taxable portion in proceeds/gain, with zero remaining distribution basis.
- Pub925, Reg1.469-2T(c)(2)/(e)(3), IRC1411 and i8960: capital character alone
  does not establish portfolio character. Business/passive owner gains require
  underlying activity treatment. The first route requires actual portfolio
  character; it does not apply proposed1.1411-7 business allocation as final law.
- Form6198 separation and lines2a–2c instructions: actual owner-interest gain
  must belong to the same original activity. We require its original gain-item
  statement, exact source-reference link and single-activity confirmation. This
  is a documented interpretation of activity-specific instructions, not a
  published numeric distribution/6198 example. The existing conservative risk
  capacity test remains independently nonbinding.

The spec precedes the source, canonical and PDF failing cases. Retained reds
reproduce the original gain rejection, omitted capital/AGI, unbound replacement
attachment, redacted-identity recalculation and missing activity evidence.
The focused source/canonical/PDF cohort passes28 tests in6 files. The broader
source, capital, NOL/COD/private-context and strict-spec cohort passes197 tests in
15 files on the development base5e1828c. Root and web types pass; the source scan
finds5190 references, with none missing or broken. Scoped lint reports zero
errors and23 warnings, including non-null fixture assertions. A prior typecheck
identified an optional beginning-basis field; the source helper now explicitly
requires its presence. These development results precede the final14f179a rebase.

Retained red/green and consumer logs are `.local/upgrade-evidence/k1-cash-distribution-*.log`.
Saved packets are in `.local/upgrade-evidence/k1-cash-distribution-pdf/`. Reopening
six capital/ScheduleD/appendix PDFs checked10 pages, exact original31/30/1 and
S-stock1/0/1 reporting, a single review notice per page, and absent private fixture
identifiers. Visual inspection of both Form8949 long-term pages and the partnership
appendix confirms readable amounts, dates, categoryF and blank taxpayer IDs. A
separate full-resolution footer crop confirms the appendix notice; it was too
small to assess reliably in the downscaled full-page preview. The first optional
reopening attempt used an unconfigured Python without pypdf; the successful
retained check uses the pinned pypdf6.10 runtime. The immutable14f179a candidate e13252d6 passes222 tests in18 files, both root
and web typechecks,5202 exact spec references, and scoped lint with zero errors
and23 warnings. The larger count includes25 runner/runtime cases because the
new package script already supplies `run`; a redundant command argument also
matched those three files. Every requested source/PDF/consumer case ran. The
initial mistyped `spec:check` invocation failed before validation; the correct
`spec:validate` then passed, with both logs retained. Final collector-base checks
and independent review remain pending.

The private Form8949 context now binds every consumed K1/charity/QBI source.
Renderers use validated original facts held by an opaque server-local context
and render only redacted copies. Changed original date, cash, basis, owner or
attachment and forged/stale contexts reject before template access. The appendix
keeps actual cash/basis/gain and source-derived dates without raw source references
or taxpayer identifiers. Full-fidelity original input and encrypted backups are
unchanged; future-year calculation/export gates stay closed.

Finite remaining distribution work is explicit: actual interim/fiscal partner
basis and advances; single-business/passive allocation and its loss/NIIT effects;
actual multiple blocks/holding periods; property, marketable-security and liability
money;751/707/736/API1061; liquidation/redemption; accumulated E&P and stock/debt
repayment. This first investment-only cohort does not complete those methods.
The independent/linked charitable collector retains known-zero behavior; it does
not infer the new positive attachment from existing answers. A positive-source
collector extension remains separate. No independent human tax qualification,
2026 readiness or e-filing claim is made.

The initial collector-base candidate a26d4ad3 passed552 tests in7 files, root
types and5211 references; that result preceded the residency correction below.
Federal independent review then reproduced an admitted single S-corp NRA owner
with gain1/AGI100001 despite the ordinary-treatment confirmation (14 other cases
passed). The source definition now requires actual citizen/resident treatment
throughout the relevant period, and reconciles actual primary standard-deduction
status plus the confirmed current-year EIC packet's owner-specific status.
Reg1.1361-1(g)(1)(ii) Example2 preserves an effective6013(g) election; an unrelated
spouse's status is not attributed to the owner. No SSN/address inference is used.
The capital review context binds the consumed status/election facts as well.
Two spec-linked red regressions reproduced acceptance and stale-token template
access; the corrected11 source/canonical/PDF cases pass. Evidence:
`k1-cash-distribution-status-{red,green}.log`. Corrected immutable review and
rebased checks are pending; the earlier review is not claimed as approval.

Corrected immutable fb419563 on2011778 passes548 tests in6 files, both root and
web types and5212 exact spec references. The requested helper path was initially
misspelled under tests/apps/web; its actual tests/guided-interview file was then
run separately and passed5/1. Combined scope is553 tests across7 distinct files;
no omitted test is counted as executed. The five changed TypeScript paths lint
with zero errors and9 fixture assertion warnings. Logs use the
`k1-cash-distribution-corrected-*` prefix.

Federal independently verified all16 owned hashes, reran the unchanged five
private probes with11 package cases (16/4 PASS), and reopened six saved PDFs/10
pages with numeric, identifier and every-page notice checks plus visual8949 and
appendix/footer inspection. The original single-owner NRA rejection probe now
passes. Evidence: `federal-cash-distribution-corrected-review.log` and
`federal-cash-distribution-pdf-review.json`. No actionable finding remained in
this investment-only cohort. This is agent source/software review only.

The source collector extension is a separate active package: its spec and
failing helper/real-DOM reachability tests are recorded before implementation.
Main integration contains only the16 core paths, not that UI work. Metadata is
2025.124/2026.121-law-integration-draft; all year, filing and method gates remain.

Final main integration on2011778 preserves all15 reviewed nonledger blobs and
passes553 tests/7 files, root types,5212 spec references and git diff --check.
The exact delivery source tree before this evidence-only paragraph is11e06929;
logs are `k1-cash-distribution-integrated-{tests,types,spec}.log`.
