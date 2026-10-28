# Ordinary K-1 gift activity classification

This package corrects the current ordinary-gift classification before applying
section 465. A separately stated ordinary section 170 gift does not acquire an
activity nexus merely because a source attachment lists its ID or an all-items
checkbox is confirmed. Basis limitation still applies first. The admitted gift
then stays separate from the ordinary and capital deductions in the actual
Form 6198 activity.

The bounded inference uses section 465(c) and (d), final Regulations
1.702-1(a)(4), 1.703-1(a)(2)(iv), and 1.1366-1(a)(2)(iii), and section
1363(b)(2). Proposed Regulation 1.465-13 is corroborating proposed material,
not binding final authority. Business payments under Regulation 1.162-15 and
special property regimes are outside this ordinary-gift source contract.

The original Form 6198 line 4 and activity gift list must agree with that
classification. Missing values do not become zero, and conflicting originals
are rejected rather than repaired. Recorded prior activity deductions retain
their original amount, character, use history, and years. This current
correction neither qualifies an old filed classification nor supplies a new
section 170 admission year for historical risk records. The separate pure-basis
first-admission work and positive old-release carry guards remain distinct.

The three runtime changes are the activity allocation, its original-source
reconciliation, and the existing activity-fieldset explanation. Current gifts
remain in the charitable ledger with zero new section 465 suspension; actual
ordinary and capital deductions, income, risk changes, and prior deductions
keep the established activity calculation. No new input schema or entered
deduction is introduced.

Original-source controls include a zero-risk gift for each entity type; an
80,000 ordinary loss and 20,000 gift sharing 50,000 basis with 25,000 risk;
exact cents and source order; separately stated income; current property
appreciation; and mixed current and recorded prior deductions. In the basis
example, 40,000 ordinary loss and 10,000 gift pass basis. The activity permits
25,000 ordinary deduction and suspends 15,000; the 10,000 gift remains available
for its separate section 170 computation. Original basis suspensions remain
40,000 ordinary and 10,000 charitable.

The spec and permanent controls preceded the implementation. The initial
two-file run retained five intended failures and one boundary pass in
`ordinary-gift-risk-spec-first-red.log` (SHA-256
`e3ed091dee665b334f860939dbfae01bdaf78e480c045c8eb4c7456f15e58603`).
An initial green attempt had a matcher-only failure: the missing original
zero already rejected with a Form 6198 source message. Only that matcher was
corrected; originals and monetary assertions stayed unchanged.

The first follow-through run retained 42 passes and three failures. One was
the intentional fieldset-hint red. Two compared exact activity fractions with
the existing whole-dollar public QBI history. The separate reporting correction
records the original failed assertions, exact activity fractions, and an
independent Fraction calculation of each reported QBI balance. QBI runtime
and internal exact activity assertions did not change. The corrected source
cohort passes 45 tests in 15 files with one worker, including all six unchanged
preimplementation diagnostic controls; root and web type checks pass.
Those six diagnostic controls are authored by this package's implementer and
are not an independent review of the correction.

All 29 pre-ledger owned blobs applied unchanged and without an executable
merge onto delivered commit `7702ba56968d41d18d1ce4935187bd45f06379b4`.
The rebase receipt and retained failures are in `.local/upgrade-evidence`.
Subsequent exact-source checks, browser outputs, and saved originals will be
bound by the review manifest and separate receipts. Initial source evidence
does not claim those pending checks have passed.

The current and recorded-prior browser cases exercise source confirmation,
edit invalidation, reload, and an actual review download. They seed an
interview with only personal and W-2 sections visited; they do not establish
a full interview traversal. Their explicit synthetic payment and withholding
sources are saved beside each output. PDF references keep historical and
current sources distinct; the reference and physical fields must retain the
review notice and identifier redaction.

Production 2026 calculation and physical-form gates are unchanged. Agent
source, software, and saved-output reviews are separate from human tax-law
qualification, filing readiness, and e-file validation. Main metadata, source
links, inventory adoption, and final delivery belong to the parent integration.

The immutable V1 tree `be1e59b42cc27d3ec6b2b2a0a3bcec13c0344628`
retains the first broad run: 1,775 passes and eight failures across 282 files,
with all 3,840 regular files and six Git symlink targets unchanged. Its log is
`ordinary-gift-risk-v1-affected.log` (SHA-256
`f8be80d7441594c8bf27395404d7de0a35f759dcf0a48f598c3c71735a347da4`).
Seven failing adjacency cases still used the former gift/activity source
classification or an assertion derived from it. V2 preserves their original
files and changes only their source fixtures, expected downstream balances,
and corresponding spec entries. The three runtime blobs are byte-identical
to V1.

For simultaneous sources, the ordinary 40,000 basis release is outside the
activity, while the separate recorded 60,000 prior activity deduction uses
50,000 risk and retains 10,000 suspension. No new risk suspension is assigned
to the ordinary gift. A separate no-residual original supplies 300,000 wages
and 90,000 withholding; the original 100,000 wage case still rejects positive
old-release carry pending first-entry proof. Original 2018 and 2024 source
years remain unchanged. This does not validate an old gift's activity nexus.

The passive-capital adjacency keeps basis, risk and passive suspensions
separate. With 40,000 ordinary loss, 20,000 long-term loss, 10,000 short-term
income and 25,000 risk, the activity disallows 25,000 across the 60,000 actual
deductions. The 10,000 ordinary gift remains outside both activity stages.
Exact character fractions are asserted independently of reported whole-dollar
QBI balances. Gift-only source capacity is zero, but its actual Form 6198
facts remain required: explicit zero is accepted and missing facts reject.

The original historical passive-capital browser JSON remains byte-identical.
It now rejects its contradictory ordinary-gift activity assignment before its
missing prior-QBI fact. A separate complete current fixture with only the
prior-QBI source removed still rejects missing QBI history. New current source
fixtures retain explicit synthetic payments and withholding; no historical
unknown is silently filled.

The eighth broad failure was the separate preexisting current Form 172 floor
carry assertion, independently reproduced in CI and corrected by parent commit
`b15003cb`. V2 is prepared on that committed ancestor. Its spec/test pair and
the parent ledger are not owned by this risk package. The six unrelated
ancestor paths are preserved without merging into the risk patch. Corrected
V2 checks and saved output remain pending until their exact-source receipts
are recorded; the retained V1 failure is not described as a passing run.

The first corrected V2 focused run retained 73 passes and two failures in
22 files (`ordinary-gift-risk-v2-focused.log`, SHA-256
`fa6130040abfa1f4665894a6114e92686bc0d5fcd59d96f411ab6b728458857b`).
One stored prior-property guide JSON still contained the former 100,000
activity deduction and the basis-admitted gift ID. Its source values now
match the corrected helper: 60,000 recorded prior activity deduction and
only the historical activity ID. The other new assertion compared simplified
rational arithmetic at 25 decimal places against two successive allocations
in the existing 20-significant-digit Decimal context, differing by 1e-16.
Four repeating-fraction checks now compare at 14 decimal places within that
existing precision. Exact currency, original-source, carry and rejection
assertions remain; no calculation or global precision setting changed. The
original assertion and saved source bytes remain in the evidence supplement.

The corrected V2 focused sequence passes 75 tests in 22 files with one worker
(22.37 seconds), plus root and web type checks. It includes the six unchanged
author diagnostic probes and the parent-owned Form 172 ancestor control;
those scopes are distinct from independent review. The test log SHA-256 is
`47ccef0989cf9e65f609bdcc973c448ce8bc82ff873f4810c9e2d9f765179aea`.
V2 owns 40 paths on exact `b15003cbded162100a146e737bb751b6b9ba0a98`;
all three runtime blobs are unchanged from V1. Broad checks, production
browser downloads and original-output review remain separate pending stages.

The a3233894 V2 freeze and its 14-place assertion attempt are retained but
superseded. The final V3 restores all four original exact `toFixed(25)`
comparisons, using independent Python Decimal source derivations with the
existing 20-significant-digit ROUND_HALF_UP operation boundaries. The ordinary
465 suspension is 16666.666666666666667 and long-term is
8333.3333333333333333. After their separate subtractions, Part IX multiplies
5000 by 23333.333333333333333; the exact product
116666666.666666666665 rounds half-up to 116666666.66666666667 before division
by 35000. The resulting ordinary suspension is3333.3333333333333334, and
long-term is1666.6666666666666667. V3 stores their25-place literal spellings;
no tolerance, reduced assertion precision, source amount, currency result or
runtime change remains. The independent derivation and superseded tests are
retained in `ordinary-gift-risk-v3-exact-stage-oracle`.

V3 with those exact25-place literals passes all75 tests/22 files again
(18.51seconds, one worker), followed by root/web types. Its exact test log
SHA-256 is `bfee8e17078cc1628b658b3481fbd7ea9f7fcdd8373b09943e9f07e1de0fdd46`.
This supersedes the V2 assertion-strength attempt while retaining both runs.


Independent review and integrated delivery
-----------------------------------------

The parent reviewed immutable V3 tree
`ff809319b8ca98076ef1264207c89ff6cdf3a093`, including the three runtime
changes, source/spec history and original-output evidence. V3 passes
1,783 tests across282 files, three type checks,6,174 spec references,
lint with zero errors/38 warnings, engine and production webpack builds.
Four production browser downloads pass with zero retries. All3,840 regular
source files and six links remain unchanged. The author artifact reader and
visual reviews are recorded separately from the parent review.

The parent saved six new original controls before execution: exact source
cents, property appreciation after basis, mixed ordinary/current gift,
three-character risk allocation, missing/contradictory activity facts, and
wrong owner/prior history. A fresh immutable copy passes38 tests in seven
files, including those six private cases. The log SHA-256 is
`d7af1551db4fc2361bdbf72bb0683e10ef022ecf37929d81728b2f850c9c57ac`.
All source hashes and symlink targets remain unchanged.

A separate original-only Python Decimal reader, without engine imports or
the author's oracle, passes10,622 checks over nine canonical originals,
two saved workspaces and four actual browser states;127 PDFs contain513
pages and504 populated fields. Checks include derived basis/activity/gift
amounts, distinct carry/source years, physical1040 fields, page notices,
redaction, reference bounds and hashes. This is not10,622 independent tax
examples. The final report is
`parent-ordinary-gift-artifact-review/checks-attempt3.json`; the original-only
oracle SHA-256 is
`c3a177bd709e147dda0778bad4df71290d2707622825e3b9a20f03b5aede066b`.

The parent's first reader setup error and second attempt's11 failed checks
are retained. The second attempt omitted actual original1099-INT interest
30,000 and ScheduleA real-estate taxes20,000 in the current-NOL case.
Reading those saved originals gives wages20,000 minus activity loss25,000
plus interest30,000 = AGI25,000; gift10,000 plus taxes20,000 = deduction30,000
and NOL5,000. Only the separate parent oracle changed; original inputs and
generated results did not. No failed evidence is described as a passing run.

The parent inspected six actual PDF pages and four desktop/mobile browser
captures. Inspected source amounts and years are readable, notices remain,
and reference footers are not clipped. Viewport captures have sticky-control
and long single-line input limits. These seeded partial-interview downloads
do not prove a complete journey or hosted staging. Displayed refund values
were observed, not independently recomputed by the parent artifact oracle.

The40-path patch applies to69b86517 with39 exact owned blobs and one narrow
composition in the shared source validator. Its earlier basis-admission
import and handoff remain intact. Parent adds provenance/traceability metadata
and this ledger. Exact25-place assertions remain restored; no deadline,
coverage threshold, source gate, privacy control or year readiness changed.
Current integrated checks are recorded separately before commit. Human tax
qualification, final2026 forms and staging evidence remain external gates.

The integrated branch passes116 tests across32 files, all three type checks,
6,221 spec references, inventory generation/freshness with587 entries and166
implementation associations, scoped lint with zero errors/warnings, and engine
and production webpack builds. This includes the separately delivered original
basis-admission paths. Main receipt SHA-256 is
`581de8f5dcf946d3553e43e8f2fb52f169db76175e451af0c146d8c8fc5fb1bd`.
The unchanged final full-suite coverage, browser and native runtime gates remain
due after the remaining foreign/MTC source packages.
