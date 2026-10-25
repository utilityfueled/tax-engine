# Current loss origins with actual QSBS exclusions

Status: bounded implementation independently reviewed and verified. The specific
negative-net interpretation below remains disabled. This is not human tax review, filing qualification or 2026 readiness.

## Supported source method

Sources refreshed 2026-10-25: [Form172](https://www.irs.gov/pub/irs-pdf/f172.pdf),
[i172](https://www.irs.gov/instructions/i172),
[IRC172(d)(2)](https://uscode.house.gov/us/usc/119-120/t26/s172/),
[Reg1.172-3](https://www.ecfr.gov/current/title-26/section-1.172-3),
[IRC56(d)(2)](https://uscode.house.gov/us/usc/119-120/t26/s56/),
[i6251 line2h](https://www.irs.gov/instructions/i6251) and
[Reg1.1411-4(h)(2)](https://www.ecfr.gov/current/title-26/section-1.1411-4).

The current-origin source packet recomputes each actual issuer/lot exclusion
from the existing qualified stock records. It retains gross nonbusiness gains
before the exclusion, actual capital losses and prior short/long carry. Exact
post-exclusion totals reconcile to ScheduleD and the original AMT worksheet;
the taxpayer supplies no exclusion or gain override.

This package supports a nonnegative post-exclusion capital net. For that
cohort, Form172 lines16 and18–22 are zero and line17 restores the exclusion
once. The statutory recomputation without the exclusion and printed form trace
agree. The independent alternative origin first removes the actual rounded
pre-2010 seven-percent preference included on6251, then restores the full
exclusion. The investment-only origin excludes the actual active business.

Derived controls, not published IRS numerical examples:

| Actual facts, in addition to 20,000 wages, 5,000 interest and 100,000 active business loss | Regular origin | Alternative origin |
| --- | ---: | ---: |
| Broker gain1,000.25, actual exclusion500.125, included AMT preference35 | 80,000 | 74,000 |
| Fund gross gain1,500.50, exclusion500.125, included preference35 | 80,000 | 73,500 |
| Same fund plus actual prior ST loss200 and LT loss100 | 80,000 | 73,800 |
| Fund gain20,000, full exclusion20,000, actual net0 and preference0 | 70,750 | 55,000 |

All four investment-only origins are zero. Known ineligibility remains taxable;
missing or inconsistent original issuer/history, source classification, amount,
exclusion or AMT preference rejects. Exact source cents and the previously
reviewed computational-versus-reported rounding boundary are retained.

## Unresolved negative-net interpretation

The actual source case below remains blocked. It is a specific conflict between
the literal printed worksheet and an independent statutory recomputation; it is
not a missing taxpayer election or permission. Neither result below is claimed
as a published numerical oracle. Parent and federal agents independently
refreshed the form, instructions and regulations and found no authoritative
worked correction resolving the conflict.

Facts: single taxpayer, active business loss100,000; no wages or other income;
nonbusiness gross capital gain1,000 and capital loss700; actual1202 exclusion500;
standard deduction15,750; no business capital items or prior NOL deduction.
ScheduleD net is -200 and AGI is -100,200.

| Form172 line | Literal printed computation | Amount |
| --- | --- | ---: |
| 1 | AGI less deduction | -115,950 |
| 2 | Nonbusiness capital losses | 700 |
| 3 | Nonbusiness capital gains before exclusion | 1,000 |
| 4 | Positive part of2−3 | 0 |
| 5 | Positive part of3−2 | 300 |
| 6 | Nonbusiness deductions | 15,750 |
| 7 | Nonbusiness ordinary income | 0 |
| 8 | 5+7 | 300 |
| 9 | Positive part of6−8 | 15,450 |
| 10 | Smaller of5 or the positive part of8−6 | 0 |
| 11 | Business capital losses | 0 |
| 12 | Business capital gains | 0 |
| 13 | 10+12 | 0 |
| 14 | Positive part of11−13 | 0 |
| 15 | 4+14 | 0 |
| 16 | Actual ScheduleD net-loss magnitude | 200 |
| 17 | Actual1202 exclusion | 500 |
| 18 | Positive part of16−17 | 0 |
| 19 | Smaller of16 or3,000 | 200 |
| 20 | Positive part of18−19 | 0 |
| 21 | Positive part of19−18 | 200 |
| 22 | Positive part of15−20 | 0 |
| 23 | Other-year NOL deduction | 0 |
| 24 | Sum1,9,17,21,22,23 | -99,800 |

The statutory recomputation without1202 has300 nonbusiness capital income,
offset by only300 allowed nonbusiness deductions, leaving a100,000 NOL.
The literal printed trace restores500 at17 and an additional200 at21.
Substituting a pre-exclusion net at16, dropping21, or inventing a residual would
change the form without controlling support. This specific question requires
authoritative qualified tax interpretation before a positive exclusion with a
negative net is enabled. The package preserves the explicit error and both
small-loss and capped-loss regression controls.

## Original-source review boundary

The existing Form8949 preparation token holds a private, frozen original capital
source snapshot. Its digest binds the household/year, statements, QSBS histories,
ScheduleD source worksheet, AMT worksheet, prior records and current172 capital
packet. A limited accessor returns a clone only after authenticating that token
and the original or redacted source digest. It supplies actual original facts for
fresh calculation; it supplies no computed-result override or invented identity.

Missing/forged tokens and changed source amounts, owner, year, prior carry,
AMT or original account reject. The retained calculation is frozen; mutating an
accessor's clone cannot mutate the private source. The numeric NOL statement
does not print original accounts, SSNs or source references. The saved packet
reopens with an independent PDF reader and retains its review notice.

## Verification

The seven initial source/calculation/review regressions failed before the
implementation, then passed. Saved-packet coverage, isolated type/spec/consumer
checks, visual inspection and independent agent review are recorded below when
complete. Rule versions2025.70/2026.66 keep their existing readiness, independent
review and filing restrictions.

- Independent parent review of exact tree `e1fbc77db1a2ee77119f011d03f1702346b462b7` passed13 cases across three files, including five independent source/token/amount probes. Official172,6251 and Regulation1.172-3 were refreshed. The zero-wage/interest control gives regular100000 and alternative98999.75 reported99000. Changed original qualification, another valid packet token and changed noncapital business expenses reject. No actionable finding remained; this is agent review, not human qualification (`parent-qsbs-origin-review.log`).
- The first isolated consumer run passed571 cases; its sole failure was the existing Form8949 independent-reader test's Python stdin wait. A serial rerun confirmed the same blocked read and was terminated. The parent repaired only that test transport in `9da0bab`, saving the same bytes to its auto-cleaned output directory before reading them. Assertions and timeouts are unchanged. The final affected rerun is recorded below.
- Root/web types and all4614 spec references passed on the reviewed product. Scoped lint had no errors; seven new test-only non-null assertions were subsequently replaced with explicit fixture guards. The remaining warnings are preexisting. All four saved review-statement pages were rendered and inspected; text is readable, notices retained and original SSNs, account identifiers and source references absent (`form172-qsbs-review/`).

- Final isolated tree `194d229b3ce295d2b4a23305eaf27343a951710f`, based on committed reader repair `9da0bab`, passes all12 affected package and independent-reader tests, root/web types, all4614 spec references and scoped lint (zero errors; two preexisting warnings). Together with the preceding571 passing adjacent cases, this resolves the sole failed transport check without changing assertions or timeouts. Evidence: `form172-section1202-final-{tests,types,web-types,spec,lint}.log`. Only this evidence and ledger text are added after the tested tree; executable product blobs are identical.
