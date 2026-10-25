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
