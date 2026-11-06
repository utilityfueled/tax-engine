# Actual insolvency and NOL attribute reduction

This package implements one source-bound Form982 route. It does not qualify a
return for filing or open the incomplete2026 full-return gate. Its guided
collector is a separate follow-up owned by the federal-law agent.

## Sources and supported method

Refreshed2026-10-25:

- [IRC108](https://uscode.house.gov/us/usc/119-118/t26/s108/), especially
  (a)(1)(B), (a)(3), (b)(2)(A), (b)(4), and (d)(3).
- [Form982 instructions](https://www.irs.gov/instructions/i982), PartI1b/2 and
  PartII6; [actual form](https://www.irs.gov/pub/irs-pdf/f982.pdf).
- [Pub4681](https://www.irs.gov/publications/p4681), Insolvency and All other tax
  attributes; [Pub908](https://www.irs.gov/publications/p908), Making the reduction.
- [Reg1.108-7(b)](https://www.govinfo.gov/content/pkg/CFR-2025-title26-vol2/pdf/CFR-2025-title26-vol2-sec1-108-7.pdf),
  [Reg1.55-1(a)](https://www.ecfr.gov/current/title-26/section-1.55-1), IRC56(d),
  and [Reg1.1411-4(h)(3)](https://www.ecfr.gov/current/title-26/section-1.1411-4).

The source packet retains every original statement, debtor/creditor/account,
actual year and discharge date, complete immediately-before asset and liability
records (including exempt/retirement property), and explicit exclusions/elections.
This initial route is one event date, an individual noncommunity return, unsecured
personal recourse debt, no interest/property transfer/title11/other exclusion or
basis-first election, and full insolvency exclusion. The entire reported excluded
amount must fit independently within regular and alternative NOL attributes.
Missing amounts and answers never become zero or false.

Current tax, original losses, regular/AMT deductions and their source histories
are calculated before the reduction. The reduction consumes the current original
loss first, then older carryovers to the discharge year. It does not use an
already-expired carry. Residual final-year carry expires only after the COD step.
The original regular/1411 loss fraction stays fixed; the remaining applicable
carry decreases with the regular vintage. The independent AMT ledger is not
copied from regular tax.

For an unrestricted pre2018 regular claim, the full claim can exceed current
positive taxable income. The supported comparison identifies current use as the
lesser of available carry and positive actual limit income less earlier claims.
For post2017 regular and alternative carry, it uses the current capped claim.
If that use differs from modified-income absorption, this package rejects the
combination pending its complete coordination method. It does not silently choose
opening less claim or succeeding carry as a universal108 reduction base.

## Derived literal controls

These are statutory implementation examples, not published IRS numerical oracles.

| Actual records | Retained current calculation | After COD |
| --- | --- | --- |
| Wages100000; two post2017 regular and AMT losses100000 each; excluded40000 | Regular67400 deduction; AMT90000 | Regular32600+7400 reductions,92600 carry; AMT10000+30000 reductions,70000 carry |
| Current original regular80000/AMT75000; earlier10000+20000; excluded90000 | Current origins remain separately retained | Regular20000 carry; AMT15000 carry |
| Wages100000;2005 and2022 losses100000 each; excluded5000 | Regular100000 unrestricted claim but84250 taxable-income use; AMT90000 use | Reduce2005 first; expire10750 regular/5000 AMT afterward; newer100000 carries unchanged |
| Original regular100000/141140000; excluded5000 after current use | Actual regular67400 and141126960 deductions unchanged | Regular27600 carry and11040 applicable investment carry |
| Two excluded original statements1000.30 each | Original cents retained | Aggregate2000.60 reports2001 once |

The spec-first expiry regression reproduced the incorrect reduction of the newer
loss after the older balance had already expired. The modified-absorption
regression reproduced acceptance of an unsupported capital-loss combination.
Both now enforce the bounded ordering above.

## Review packet and validation

An opaque private token is prepared from the complete original input and a fresh
canonical calculation before identifier redaction. It binds the entire original
and redacted input plus all consumed regular/AMT/current-origin/COD calculation
contexts. A supplied result or plain object cannot establish that context.
Review generation rechecks all vectors and audits, including residual expiry,
and rejects stale sources or calculations before writing any packet file.
The NOL statement and Form982 reference show the separate numeric transfers;
creditor TIN, account, last-four IDs, private source IDs/references are absent.

The reviewed immutable tree `183cbe33621972e0f073ddb55fc72116ae5233b2`, based
on `9015b41`, passes 713 tests across 34 files, pinned Node24 root/web typechecks
and all 4,665 spec references. Scoped lint has zero errors and six existing
warnings. Evidence is in `cod-nol-rebased-{tests,root-types,web-types,spec}.log`
and `cod-nol-exact-lint.log` under `.local/upgrade-evidence/`.

The parent independently refreshed the controlling sources and passed 16 cases
across four files, including five additional probes for ordering, aggregate
rounding at AMT capacity, residual expiry, actual event facts and stale exact-cent
source tokens. No actionable finding remained in the bounded method
(`parent-cod-review-183cbe33.log`). This is agent software/source review, not
independent professional filing qualification.

The ordinary and final-year-expiry packets were regenerated from that immutable
tree. The saved NOL and Form982 statements were reopened, text/privacy checked
and all four rendered pages inspected. They label the original NOL carry before
COD separately from the final reduced carry and show any residual expiry.
Evidence is under `cod-nol-visual-final/`. The source/core and guided collector
remain separately tracked.

## Finite residual work

- Federal-law owns the actual guided insolvency/debt collector immediately after
  the canonical package. A structured-only route is not enabled-source completion.
- Modified172 absorption different from current taxable-income use, later
  attribute waterfall/basis limits, partial taxable debt, multiple-event dates,
  title11/estate/joint/community ownership and special debt exclusions require
  additional internal source methods. No external approval is inferred.
- AI agent owns prior/mixed charity and2026 nonitemizer carry. Facts owns actual
  ordinary Form172 capital intake. The negative-net1202 Form172 printed/statutory
  mismatch remains the separately documented qualified-tax interpretation question.
- Final-year forms and independent professional review remain external evidence;
  this package supplies neither.
