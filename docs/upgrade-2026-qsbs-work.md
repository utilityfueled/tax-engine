# Actual qualified small business stock sources

Execution is active. This package is a standalone calculation prerequisite;
canonical source binding, Form8949, ScheduleD, AMT and guided intake follow.
No filing, model, public-readiness or human-qualification gate is changed.

Sources refreshed2026-10-25:

- [IRC1202](https://uscode.house.gov/us/usc/119-118/t26/s1202/), current through
  PL119-120: acquisition percentages, eligible-gain issuer limit before applying
  percentages, disposed-qualified-stock basis alternative and actual transfers.
- [IRC57(a)(7)](https://uscode.house.gov/us/usc/119-118/t26/s57/): the7percent
  AMT preference applies only to excluded gain acquired on/before2010-09-27.
- [Final2025 ScheduleD instructions](https://www.irs.gov/instructions/i1040sd)
  and [Form6251 instructions](https://www.irs.gov/instructions/i6251): Q
  adjustments,28percent worksheet component and AMT line2h.

The spec and absent-module red test preceded the Decimal implementation.
Literal cases cover50/75/100percent dates, strict more-than-five-year holding,
post-July2025 ineligibility in2025/2026, separate issuers, prior eligible gain
before exclusion, MFS, joint limits, loss/short-held basis, explicit mixed-rate
allocation, source cents, actual pre2019 empowerment attribution and AMT.
Missing facts, invalid dates, nonfinite values, duplicate identities and invalid
allocations reject. Audit lines contain no source references or issuer IDs.

Independent agent review ran the six original tests and two additional literal
probes. It identified that valid replacement stock can carry an earlier holding
date than its legal issue date under1202(h)(4). The actual acquisition method is
now explicit: this initial original-issue method rejects transfers pending the
actual predecessor, ownership and exchange-cap worksheet. A new spec-linked red
test reproduced that distinction before the fix. Seven tests and root types
pass. This is bounded agent review; independent human tax qualification remains
required. Evidence: `.local/upgrade-evidence/section1202-*` and
`agent-qsbs-probe.log`.

Exact isolated tree `0e28340cc2f841abdccacb490e8a28d779568da7` (base `ec6505d`)
passes14 focused tests in2files, root types, all4,325spec references and scoped
lint with zero errors/warnings. The later evidence append does not change code.

Remaining internal sequence:

1. Bind actual issuer qualification/history and original brokerage/statement
   amounts to the actual household, without trusting a1099DIV2c label alone.
2. Carry computed Q adjustments exactly once through8949/D, the28percent
   worksheet,6251line2h and the NOL modified-income computation.
3. Implement actual pass-through/child and transfer/exchange source methods;
   do not infer predecessor eligibility or a qualifying acquisition date.
4. Collect positive-source facts in the guided path and qualify review records
   separately from complete-data filing exports.

## Original brokerage and constant-proportion fund sources

The source binder now verifies actual household/owner, canonical original trade
identity and dates, complete per-issuer prior eligible-gain history, original
corporate/active-business/redemption facts and assets including predecessors
and controlled groups. Broker amounts reconcile before exclusion; fund lots
partition every actual2c source and verify original constant ownership shares
against entity gain and basis. Missing values stay unknown; known failures to
qualify produce no exclusion. Changed ownership, transfers and offsetting
positions retain explicit method requirements.

Seven source tests exercise signed/cents amounts, multi-issuer fund partitions,
prior cap use, asset thresholds and business eligibility, late/interrupted fund
ownership, actual empowerment attribution and conflicting/aliased sources.
The spec and absent-module red case preceded implementation. A separate red
regression caught a noncanonical index alias before rejecting it and checking
the transaction's holding period against its actual dates.

Independent agent review refreshed1202(g), inspected the source/schema/core and
ran14cases without a finding in the original-issue/constant-fund-share slice.
The later alias/holding-period assertions and multi-issuer partition probe add
source validation without broadening the qualified method. Canonical integration
and positive-source guided collection are still the next internal work.

Exact source tree `42d168bd02ce6bc26e23f27c916f5341015b62d5` (base `9889cba`)
passes121tests in15files, root types, all4,356spec references and scoped lint
with zero errors/warnings. The immutable snapshot isolates the input-schema
addition from parallel foreign/NOL work. No canonical tax behavior changed.

## Canonical return integration — 2026-10-25

The spec-first return package replaces the old label-only, globally capped
exclusion with actual original issuer/date sources. Brokerage rows retain original
amounts and receive Q once; fund2a remains on ScheduleD13 with separate issuer Q
rows in8949BoxF. Complete source character feeds the actual28percent loss-netting
worksheet. Form6251 adds the rounded7percent pre2010 preference while retaining
the full exclusion in its capital-gain method. Modified NOL income restores the
exclusion before capital-loss netting and omits the preference for an exclusion
that is already fully restored. Public2026 and filing gates remain unchanged.

Seven new literal return cases failed first. Adjacent verification reproduced
legacy fixtures with impossible2c>2a values and fabricated capital losses. Their
actual original sources and expected gross-distribution/once-only adjustment
assertions are now corrected; no case was removed. Treea3b597221 passes2,195
tests in54files, root types and4,384 spec references. A subsequent source-lot
consistency guard and explicit required-fixture checks remove45new lint warnings;
14focused cases and scoped lint0 pass before final immutable verification.

Independent agent review refreshed current ScheduleD QSBS reporting and6251
line2h instructions, passed21source/core/canonical cases, and separately probed
mixed50/100percent same-issuer lots and split fund issuer lots. No actionable
finding in that bounded review; it is not independent human qualification.
Evidence: section1202-return-red.log, section1202-adjacent-green.log,
section1202-return-final-tests.log, federal-review-qsbs.log and
federal-review-qsbs-probes.log under .local/upgrade-evidence.

The next dependent package completes actual8949category pagination, fund-only
review inclusion, ScheduleD10 and6251line2h review mapping. Guided actual-source
intake is active separately. Transfer/exchange/changed ownership and child QSBS
methods remain identified internal work; no form or scenario is qualified by
this calculation package alone.

Final isolated calculation tree `e4991d78f3356e4f42146a9affaaf965f5a408f6`
(base `4925ce1`) passes 2,195 tests in 54 files, root type checking, all 4,384
spec references, and scoped lint with zero errors or warnings. This includes
the source-lot consistency guard, the narrower actual-source input type used by
intake, and explicit required-fixture assertions. Logs are
`.local/upgrade-evidence/section1202-return-exact-{tests,types,spec,lint}.log`.
The evidence append changes documentation only.
