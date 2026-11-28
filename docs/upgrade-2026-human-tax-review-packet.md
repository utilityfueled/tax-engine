# Human tax review packet for the 2026 upgrade

A qualified, independent tax professional needs to check the tax methods and their
expected results before any scenario can be approved for filing. No CPA, enrolled
agent or tax attorney has been selected. Human review is **unassigned and pending**;
it has not been waived. This packet prepares that work. It records no professional
opinion, signed approval or permission to enable filing.

The project owner is being asked to engage the appropriate reviewer, not to choose
tax formulas. The questions below belong with that reviewer. Passing tests, an
agent's source research, a code review, a populated checklist or a correctly drawn
PDF cannot substitute for the required human work.

## What the reviewer would approve

Review an expressly bounded list of tax years, jurisdictions, residency types,
scenarios, source facts, calculations and output forms. Confirm the operative law
and instructions, derive independent expected results, identify defects and
exclusions, and record the disposition of every finding. A qualified professional
may need additional state or specialist expertise; a credential alone does not
establish expertise in every method listed here.

The requested launch states are Pennsylvania and Ohio, each for full-year resident,
part-year resident and nonresident returns. Selection is settled. None of these
six combinations is filing-qualified. Approval of one ordinary income method does
not approve a whole state return, school-district/municipal tax, every attachment
or a different residency category.

Tax review is one required gate. Final-form mapping review, independent security
review, complete facts, software checks, staging/recovery evidence and release
authorization remain separate requirements in the [execution brief](upgrade-2026-execution-brief.md).
A tax attestation does not authorize production deployment, model promotion or
filing activation.

## Exact material and limits of this packet

This preparation used committed source at
`1bb723b201311ba1f65ccd0ce1fdc6a6af2db888` on November 2, 2026. It does not cover
later commits, uncommitted work or independently frozen candidates merely because
they share a branch name. The preparation receipt and captured source hashes are
retained locally under `.local/upgrade-evidence/nov02-human-tax-review-packet/`.
That directory is ignored evidence, not a public repository attachment or a
completed review record. The engineer must supply the exact reviewed source and
relevant evidence to the reviewer and record hashes of what was actually supplied.

At this source revision:

- The recursively frozen federal 2026 metadata is version
  `2026.221-law-integration-draft`, calculation status `incomplete`, review status
  `independent-review-pending`, and `filingQualified: false`. Immutability protects
  a revision from mutation; it does not make its interpretation final or reviewed.
- Federal 2025 metadata is `2025.223`, `legacy-available`, also independently
  unapproved and not filing-qualified. Source-bound historical calculations and
  synthetic review PDFs are engineering evidence within their stated scenarios.
  They are not approved 2026 results.
- The public engine-year contract admits 2025. The historical review template pack
  is `2025.2-review`, marked `legacy-review-only`. Final 2026 Schedules C and R have
  separately documented physical candidates; that does not provide a complete
  final 2026 return or qualify their calculations/maps for public export.
- `QUALIFIED_FILING_SCENARIOS` is empty. No signature in this packet automatically
  changes that compiled allowlist. Redacted review downloads and encrypted recovery
  archives serve different purposes from a complete-data filing artifact.

Before beginning, pin the actual review commit and package manifests below. If the
branch advances, compare the changed rules, adapters, fixtures and forms and state
whether an addendum or a new review is required. Historical green test counts must
not be represented as current whole-branch or deployed evidence.

## Reading and evidence index

| Material | What to inspect |
| --- | --- |
| [Execution brief](upgrade-2026-execution-brief.md), [checklist](upgrade-2026-checklist.md), [progress](upgrade-2026-progress.md), [checkpoint](upgrade-2026-checkpoint.json) | Complete scope, recorded deliveries and remaining gates. Dated entries and package-specific scope control historical claims. |
| [Federal rule-pack metadata](../src/models/rule-pack-metadata.ts), [constants](../src/models/constants.ts), [rule-pack spec](../spec/federal/rule-packs.yaml) | Year/version, source section and revision, retrieval date, limits and review status. Read the operative source text; a URL or copied constant is not sufficient. |
| [Federal specs](../spec/federal/), [state specs](../spec/state/), [coverage inventory](../spec/coverage/inventory-2025.json) | Per-line formulas, caps, phase-outs, rounding, eligibility and linked tests. An inventory link proves traceability, not legal completeness. |
| [Public year/scenario rows](../apps/web/src/lib/tax-year-support.ts), [document support contract](../packages/contracts/src/index.ts), [state gap ledger](upgrade-2026-state-gaps.md) | Compare advertised capabilities with the exact year, residency, scenario and available output. A supported input document is not a qualified return. |
| [Readiness computation](../src/utils/return-readiness.ts), [filing allowlist](../src/pdf/filing-registry.ts), [review template registry](../src/pdf/template-registry.ts), [form ledger](upgrade-2026-forms-work.md), [source refresh](upgrade-2026-release-source-refresh.md) | Missing facts, omitted/reference-only attachments, exact official year/revision/hash and physical field placement. Check canonical field values and rendered appearances. |
| [External review questions](upgrade-2026-external-actions.md), [refreshed source derivations](upgrade-2026-source-questions-20261101.md), [method register](upgrade-2026-unsupported-method-register.md) | Unresolved interpretations, explicit unsupported methods and delivered methods still awaiting qualification. These registers are dated; verify the exact current source before reopening a delivered item or closing an old guard. |
| Package `docs/upgrade-2026-*-work.md` ledgers and their linked spec/test/evidence files | Original synthetic facts, cited authority, independently derived amounts, genuine failed regressions, later checks, exact commit/manifests, limitations and agent review. Request the original saved outputs and source hashes where evidence is local-only. |

Start the federal review with indexed/payroll values; SALT and itemized limits;
child/family/dependent eligibility; Schedule 1-A; charitable floors and carryovers;
QBI; health/PTC; education/529; energy transition dates; historical refunds/losses;
and source ownership, income classification and year/rounding interactions.
These are worklist areas, not a claim that every method is complete.

For PA/OH, start with the selected-state specs and the PA residency, resident-credit,
ordinary-return/PDF, Ohio residency, payment/date and school-district ledgers.
Review actual source-year/owner binding, period allocation, reciprocity, state
conformity, local obligations, deductions/credits, withholding counted once,
payment dates, prior balances and every required attachment. Do not substitute
federal aggregates or paper-line rounding for the actual source facts.

## First unresolved case: stock exclusion and a business loss

The following is a **synthetic historical case**, using a $15,750 standard deduction.
It is not a taxpayer's return or the 2026 standard deduction. A net operating loss
(NOL) is an income-tax loss that may affect later years. Section 1202 excludes
certain eligible small-business stock gains. Here those two calculations interact
with the capital-loss adjustment in Form 172.

Facts: single filer; $100,000 active business loss; no wages or other income;
$1,000 gross nonbusiness capital gain; $700 capital loss; $500 actual section 1202
exclusion; $15,750 standard deduction; no business capital items or prior NOL
deduction. After the exclusion, Schedule D is negative $200 and AGI is negative
$100,200. Neither result below is an approved treatment or a matching published
IRS numerical example.

| Retained calculation | Competing amount |
| --- | ---: |
| Literal printed Form 172: line 1 −115,950; line 9 +15,450; line 17 +500; line 21 +200; line 24 −99,800 | $99,800 NOL |
| Recompute without the section 1202 exclusion: $300 nonbusiness capital income offsets $300 of otherwise nonbusiness deductions | $100,000 NOL |

The reviewer must explain the controlling treatment, the affected capital-loss
adjustment and its authority; reconcile the printed lines with IRC 172(d)(2);
and state consequences for regular tax, alternative minimum tax and future loss
records. If neither proposed result is correct, derive the replacement from the
unchanged facts. Do not resolve the discrepancy by changing the original gain,
loss, exclusion or deduction, or by authorizing an arbitrary override.

Full line trace and source history:
[Form 172/QSBS ledger](upgrade-2026-form172-qsbs-origin-work.md) and
[spec](../spec/federal/form-172-section-1202-origin.yaml).
Official starting points: [Form 172](https://www.irs.gov/pub/irs-pdf/f172.pdf),
[instructions](https://www.irs.gov/instructions/i172),
[recorded section 172 snapshot](https://uscode.house.gov/us/usc/119-136/t26/s172/)
and [Regulation 1.172-3](https://www.ecfr.gov/current/title-26/section-1.172-3).
Refresh the applicable revision and controlling authority before deciding. The
negative-net branch remains explicitly rejected; the separate implemented
nonnegative-net method does not resolve this question.

November 27 source review found the current Form 172 still dated December
2024 and no correction listed on the IRS product page. Under §172(d)(2),
restoring the excluded $500 leaves $1,000 of gain against the $700 capital
loss. Section 172(d)(4)(B) carries the same $300 net into the nonbusiness
deduction limit, leaving a statutory computation of $100,000 before any
later-year use. The outstanding question is how to report that treatment
against the printed line 21 adjustment. [IRS product page](https://www.irs.gov/forms-pubs/about-form-172) ·
[26 USC §172(d)](https://uscode.house.gov/us/usc/t26/s172/).

The review should also address the actual $200 Schedule D loss separately.
Section 1212(b)(2) takes negative adjusted taxable income into account, so
this loss appears unused in the synthetic case. Its character requires the
original short- and long-term lots. A separate alternative minimum tax
calculation would start with a $99,700 loss under the assumptions of no
standard deduction, no basis difference and no other AMT adjustments or
applicable QSBS preference. These are review calculations. The original
facts still need reviewer signoff before any form or carryover is qualified.
[26 USC §1212(b)](https://uscode.house.gov/us/usc/t26/s1212/) ·
[26 USC §56(d)](https://uscode.house.gov/us/usc/t26/s56/) ·
[Form 6251 instructions](https://www.irs.gov/instructions/i6251).

## Other recorded interpretation questions

These are specific questions already identified in repository research. No answer
or reviewer approval is inferred here. The cited search history is bounded and
does not prove that no additional authority exists.

| Question | Required review and source ledger |
| --- | --- |
| Reduced deduction combining employee and business tips | Determine how the final shared cap/MAGI reduction is attributed to business tips before reducing QBI, including rounding and multiple businesses. The $20,000 employee/$10,000 business illustration with a $25,000 combined cap does not establish employee-first, business-first or proportional allocation. [Tips decision](upgrade-2026-mixed-tips-method-decision.md). |
| Reduced joint savings-bond education exclusion for two educators | Distinguish actual income ownership from allocation of the final reduced exclusion to each educator's expense deduction. Establish owner-specific rounding. [Education decisions](upgrade-2026-education-method-decisions.md). |
| Community bond divided into two separate successor bonds | For the actual equal-partition facts, decide section 454 recognition, deferred interest, successor basis and operative state-property conditions. Do not infer no recognition from unchanged wealth or rewrite one actual payment as two. [Community bond investigation](upgrade-2026-community-bond-method-decision.md). |
| Broader Coverdell account disqualification | Resolve partial pledge, positive education expenses and later activity after termination separately, with basis and owner consequences. The delivered whole-account/zero-expense/no-later-activity cohort is narrower. [Education decisions](upgrade-2026-education-method-decisions.md). |
| Two-owner 2025 health deduction with capped advance-credit repayment | Establish which owner receives the binding joint repayment before separate earned-income limits. The retained hypotheses give health deductions $1,579 versus $1,950 and credits $3,444 versus $3,491 while both repay $1,950; neither allocation is enabled. [Owner-income ledger](upgrade-2026-marketplace-owner-income-work.md). |
| 2026 farm optional method near the printed profit limit | For a confirmed domestic cash-method sole proprietor with $11,340.01 of gross income and $8,186.00 of net profit, establish whether the exact statutory earnings comparison controls before applying the form's printed strict $8,186 profit threshold. Verify the rounding stage and consequent tax, credit and deduction transfers. The standalone test uses the printed threshold. [Final Schedule SE](https://www.irs.gov/pub/irs-prior/f1040sse--2026.pdf) · [26 U.S.C. § 1402](https://uscode.house.gov/us/usc/119-134/t26/s1402/). |
| Form 1062 annual recomputation and draft return total | Verify the annual taxes included under § 26(b) and reconciliation of the IRS scenario with draft Form 1040 lines 24a, 24b and 24c. The example prints $18,309 plus $3,405 and shows $21,715 on line 24c. Also confirm original sale or pass-through statements and annual aggregation before activation. [IRS ATS scenario 13](https://www.irs.gov/pub/irs-efile/ty26-1040-ats-scenario-13.pdf) · [Form 1062 instructions](https://www.irs.gov/instructions/i1062). |
| Publication 505 adjustments for multiple elected sales | If two sales enter the annualized income in different periods, establish how to attribute the common full-year Form 1062 tax difference without independently recomputing each sale and double-counting rate or credit effects. Confirm the method and applicable period evidence before enabling payment or penalty routing. [IRS correction](https://www.irs.gov/forms-pubs/clarification-for-calculation-of-estimated-tax-payments-when-making-an-election-under-section-1062a). |
| Pennsylvania ordinary and farmer estimated tax boundaries | Resolve § 325(a)(1) “exceed” $14,000 against the REV-413(I) language and $430 worksheet gate. Verify April 1, June 1 and September 1 against § 325(d) and the department's installment table. Confirm how the annual farmer penalty worksheet uses § 352(d)(1), inclusive two-thirds and any rounding before enabling it. The 2025 REV-1630A prints 0.6667 and inconsistent equality language. [2026 REV-413(I)](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2026/2026_rev-413i.pdf) · [Pennsylvania Tax Reform Code](https://www.legis.state.pa.us/WU01/LI/LI/US/HTM/1971/0/0002..HTM). |
| Ohio certified venture capital gain | Review the eventual Director certificate, prior certification interval, exactly matched investor holding and federal gain in the one underlying sale estimator. Establish allocation and recapture, mixed gains, business deduction ordering, residency and the final form line before widening the slice. [Enacted Ohio law](https://codes.ohio.gov/assets/laws/revised-code/authenticated/57/5747/5747.01/3-5-2026/5747.01-3-5-2026.pdf) · [Certificate requirements](https://codes.ohio.gov/ohio-revised-code/section-122.851). |

The November 1 research also preserves these five distinct cases. Their totals
and competing allocations are derived research controls, not approved outputs.
See [the complete source derivations](upgrade-2026-source-questions-20261101.md)
for original frames, authorities and receipts.

| Question | Preserved decision boundary |
| --- | --- |
| Canceled debt crossing modified loss capacity | Opening $100,000, normal use $39,200, comparison use $48,608; reduction $51,392 fits both, $51,393 crosses comparison capacity by $1. Determine section 108/charitable-benefit ordering and later attribute handling. Do not clamp the negative balance. |
| Prior capital-gain property after the 2026 other-recipient offset | Base $100,000, public cash $10,000, other-recipient cash $30,000, prior property $40,000: distinguish $30,000 treated-paid consumption from $20,000 final property allowance and determine closing carry/year/expiry. |
| Cash/property use within one limited category | Base $10,000 with cash $2,000/property $2,000 permits $3,000 aggregate, leaving $1,000 carry; determine actual source attribution rather than select one of several conserving splits. |
| 2026 charitable floor across current and prior gifts | Base $100,000, current cash $10,000, original 2025 carry $60,000 gives $59,500 aggregate after the $500 floor. Determine current/prior reporting, disallowed older amount, expiry and any allowable new carry. |
| Loss benefit shared by multiple charitable excesses | Wages $100,000, public property $80,000, public capital-gain property $60,000 and prior NOL $100,000: the retained $16,000 aggregate benefit is nonadditive. Determine attribution without choosing arbitrary replay order, source-ID order or proportional allocation. Keep regular and AMT histories separate. |

Additional named boundaries in the [method register](upgrade-2026-unsupported-method-register.md)
and [external-actions audit](upgrade-2026-external-actions.md) need precise review:
Schedule AI preferential gains/dividends; joint/equal-AGI EIC comparisons; joint or
community-property canceled-debt insolvency/attribute allocation; later-year
release of basis-suspended K-1 foreign tax; below-poverty marriage-year PTC;
business Form 1099-G refund destination/tax benefit; and shared-policy months
covering only one family. Confirm current implementation and the exact source
case before giving an opinion. This list is not a blanket exemption from further
engineering or primary-source research.

The external-actions ledger separately identifies **implemented conventions**
requiring human assessment: Form 2555's 30-percent computation/guaranteed-payment
and foreign-plan deduction attribution; Schedule AI cumulative Schedule 1-A
adjustments and its $400 test; section 1341 refund-versus-balance comparison;
EIC nonclaiming higher-AGI nonparent treatment; and the delivered living-apart HOH
PTC route's spouse-proof boundary. These must not be described as already resolved
by a qualified reviewer, or as merely missing credentials.

## Required independent expected results

### Capital loss carryover from 2025 into 2026

Independently complete the IRS Capital Loss Carryover Worksheet for a single
taxpayer with a $15,750 standard deduction, only the stated wages and capital
transactions, and no other deductions or adjustments. Confirm the 2025
Schedule D line 21 amounts and the carryover by character. The engine's entries
below are regression expectations for review. Reviewer approval is pending.
[2025 Schedule D instructions](https://www.irs.gov/instructions/i1040sd) ·
[Publication 550](https://www.irs.gov/publications/p550).

| 2025 wages | Short-term loss | Long-term loss | Line 21 loss | Expected 2026 short-term carry | Expected 2026 long-term carry |
| ---: | ---: | ---: | ---: | ---: | ---: |
| $12,000 | $0 | $2,000 | $2,000 | $0 | $2,000 |
| $15,751 | $2,000 | $0 | $2,000 | $1,999 | $0 |
| $16,350 | $500 | $2,500 | $3,000 | $0 | $2,400 |
| $17,750 | $0 | $2,000 | $2,000 | $0 | $0 |

### Ownership when filing status changes

Use the known unused loss amounts from the preceding return. Confirm the
proper allocation by character, the records that establish each owner's portion,
and the evidence needed to carry a whole loss from a joint return filed by the
same spouses. These are engineering expectations awaiting independent review.
[Schedule D instructions](https://www.irs.gov/instructions/i1040sd) ·
[Publication 550, Joint and separate returns](https://www.irs.gov/publications/p550).

| Preceding return records | Current return | Expected amount entering Schedule D |
| --- | --- | --- |
| Separate 2024 worksheets show short-term losses of $250.23 and $749.77, with zero long-term loss | Joint 2025 return by both owners | $1,000 short-term loss |
| Joint 2025 worksheet shows short-term losses of $250.23 attributable to the taxpayer and $749.77 attributable to the other spouse | Taxpayer's separate 2026 return | $250.23 short-term loss |

### Federal overpayment applied to the next return

Verify Form 1040 line 26 using a $125.37 estimated payment and a $7.09 overpayment
applied from the immediately preceding return. The expected unrounded total
is $132.46. An explicit zero applied amount leaves $125.37. Confirm the paper
rounding point and the original evidence to use when an account correction
changes the applied amount. The engine holds a negative reported overpayment
and an entry tied to the wrong preceding year.
[Form 1040 instructions, line 26](https://www.irs.gov/instructions/i1040gi).

### Schedule K-1 original header year

For a calendar-year individual return, verify that a 2026 original entity
period cannot supply partnership, S corporation, estate or trust amounts to
the 2025 return. For the positive fiscal-year example, verify that an old
printed header can describe the legitimate period from July 1, 2024 through
June 30, 2025. The compatibility controls keep an absent header unknown and
allow an otherwise supported matching header.

Independently reconcile the synthetic positive-control AGI from $85,000 of
wages, $125.75 of partnership ordinary income and $115.25 of estate interest.
Review the treatment across the tax-year boundary and record any separate
authority needed for special inclusion methods.
[IRS partner instructions](https://www.irs.gov/instructions/i1065sk1) ·
[IRS shareholder instructions](https://www.irs.gov/instructions/i1120ssk) ·
[26 CFR 1.662(c)-1](https://www.ecfr.gov/current/title-26/section-1.662(c)-1).

### Review scope

For each accepted method, prepare the expected calculation before using the
engine output as evidence. Use the actual original synthetic sources and record
year, owner, eligibility, dates, elections and missing facts. Preserve zero as zero
and unknown as unknown. State the legal section, instruction revision, every
material line formula, monetary precision and rounding point.

Include published worked examples where they match, plus independently derived
cases on both sides of phase-outs/caps, ages, filing statuses and date cutoffs;
zero/negative amounts; exact cents and aggregation; spouses/dependents; carryover
origin/use/expiry; regular/AMT differences; and federal/state interactions. Clearly
label an independently derived example rather than calling it an IRS example.
Record expected source totals, printed form values, tax, refund/balance and carry
records independently; do not derive all expectations by calling production code.

Then compare the engine/audit, source adapters, guided confirmation and actual
saved output against those expectations. Reconcile original sources before privacy
redaction, and inspect both physical field values and appearances. A displayed
number or test copied from the implementation is not an independent oracle.
Document unsupported cases and how the application rejects them. An approval flag
cannot supply a missing legal method or a missing taxpayer fact.

Findings need a cited basis, exact affected sources/lines, expected/actual results,
severity, correction reference and independent retest evidence. An unresolved
finding remains open; it is not converted to approval by a deadline or green CI.

## Blank reviewer attestation

Complete only after the actual review. Leave unreviewed and unresolved items
explicitly pending. This template is not an attestation until a real independent
reviewer supplies and signs its contents.

| Field | Reviewer entry |
| --- | --- |
| Reviewer name and organization | ____________________ |
| Professional qualifications, jurisdiction and relevant specialist expertise | ____________________ |
| Independence and any conflicts/limitations | ____________________ |
| Review date and source-law effective/retrieval dates | ____________________ |
| Scope revision / exact commit / tree and package-manifest hashes | ____________________ |
| Tax years, jurisdictions, residency types and named scenarios actually reviewed | ____________________ |
| Included/excluded methods, taxpayer facts and assumptions | ____________________ |
| Official authority, final form/instruction revisions and asset hashes | ____________________ |
| Independently prepared expectation files, examples and hashes | ____________________ |
| Expected-versus-actual results and saved artifact evidence | ____________________ |
| Findings, unresolved questions and correction/retest references | ____________________ |
| Decision per scenario: approved within stated scope / changes required / unresolved | ____________________ |
| Conditions requiring re-review, expiry or source/form refresh | ____________________ |
| Reviewer signature or authenticated attestation reference | ____________________ |

Attach a scope table with one row per scenario and a separate response for every
interpretation decided. Record the derivation and why competing treatments were
accepted or rejected. A broad signature without year/scenario/source boundaries
is insufficient. After corrections, engineers must follow the spec-first workflow
and obtain the applicable independent retest and final-form review; release gates
remain closed until their own evidence and authorization requirements pass.


## November6 bounded source addendum, still unreviewed by a tax professional

The original November2 preparation above remains historical and unchanged. Later
engineering deliveries below need their own qualified review; no human opinion,
filing permission or blanket method approval is recorded here. Supply their exact
commits, original synthetic source packets, law observations, genuine regressions,
independent agent findings and retained failure history to the professional.

| Delivered source | Specific review, with limits |
| --- | --- |
| COD full-pool endpoint, `3cef70a1`; [ledger](upgrade-2026-cod-full-pool-exhaustion-work.md) | Check independent regular/AMT current-use and modified-absorption pools, terminal exhaustion, and overlap as reconciliation only. Partial, charitable and multiple-vintage cases remain outside this endpoint. |
| Charitable total-excess endpoint, `c9ae4af2`; [ledger](upgrade-2026-charity-total-exhaustion-work.md) | Check exact source conservation proving complete current excess exhaustion. The positive canonical case is2025; the initially proposed2026 oracle was wrong and its partial-attribution refusal remains. No proportional or list-order method is enabled. |
| Binding-owner full advance repayment, `8e54457d`; [ledger](upgrade-2026-marketplace-binding-owner-full-repayment.md) | Check separate original-linked C/F earned-income limits and independently completed zero-credit/full-repayment proof. Income above400% alone is insufficient in2025. Partial/capped owner attribution remains unresolved. Saved-field/visual engineering checks pass while the strict decoded raw-marker scan keeps a separate numeric-operand HOLD. |

These finite endpoints do not resolve the broader questions in the original table.
The subsequently integrated [prior-floor endpoint](upgrade-2026-charitable-prior-floor-no-excess.md)
also needs review: a sole fully consumed original and no surviving percentage
excess permit a uniquely attributable floor to reduce the deduction without
restoring consumed carry. Review the original 2025 receipt, actual annual
history, all four 2026 cent boundaries and the separate nonitemized treatment.
Competing origins, surviving excess and NOL-linked attribution remain refused.
Before review begins, pin the actual supplied source. Qualified review must distinguish original carry consumed
as paid from deduction claimed, preserve original years, and assess the complete
ordinary method rather than treating a passed endpoint as general approval.

## November 19 Marketplace and IRA review material

Review Form 1095-A source replacement on `5a4377f7`. The synthetic original
and corrected statements concern the same policy. Using the corrected statement
alone produces $425 on Form 8962 line 25. The two statements together formerly
produced $825. A separate Worksheet E control produces $408 with the matching
source designation. Check the rule for voided forms, corrected replacements and
the effect of a stale copy in the Worksheet E or marriage inputs. [2026 Form 1095-A](https://www.irs.gov/pub/irs-pdf/f1095a.pdf)

Review the ordinary zero-basis traditional IRA QCD worksheet independently.
The IRS example reports $6,500 transferred, $4,000 of unused deducted
contributions and a $2,500 exclusion. Verify the per-owner annual cap, the
ordering of the cap and contribution adjustment, the resulting $4,000 of
taxable IRA income, the transfer-date age boundary and the treatment of an actual
Code 7 statement that omits the optional QCD code. Check overlap with the cash
charitable deduction when a receipt could describe the same transfer. The full
return keeps current-year IRA deduction coordination, separate Form 8606 methods
and specialized recipient or asset cases outside this ordinary path. [IRC §408(d)(8)](https://uscode.house.gov/us/usc/t26/s408/), [IRS Publication 590-B](https://www.irs.gov/publications/p590b), [IRS Notice 2025-67](https://www.irs.gov/pub/irs-drop/n-25-67.pdf), [2026 Form 1099-R instructions](https://www.irs.gov/instructions/i1099r)

## November 22 first-home IRA and Ohio early-withdrawal material

Review the single primary taxpayer examples in `8b8a7d84` and `00cd051c`.
An otherwise fully taxable $7,000 traditional IRA receipt is used for an
eligible first-home purchase. The owner previously used $4,000 of the lifetime
limit. Independently verify the amount under exception 09 and the income that
remains taxable. The expected Part I result is $7,000 on line 1, $6,000 on
line 2, $1,000 on line 3 and $100 on line 4. Include the calendar-day count for
September 15 through January 13 using the receipt year on the return, and check
the day-121 control. Verify the acquisition date and principal-residence
lookback using the signed contract and payment source. The internal review
artifact records the tax printed for Schedule 2 line 5. Annual instructions and
public export qualification remain open. [26 U.S.C. §72](https://uscode.house.gov/us/usc/119-124/t26/s72/),
[2026 Form 5329](https://www.irs.gov/pub/irs-prior/f5329--2026.pdf) and
[2025 exception instructions](https://www.irs.gov/pub/irs-prior/i5329--2025.pdf).

Review the 2025 full-year Ohio single-filer example in `e44e8b31`. One primary
non-IRA Code 1 Form 1099-R reports a documented $6,000 withdrawal before
retirement, alongside $60,000 of wages. Independently establish whether the
payment was on account of retirement, how the prior lump-sum election would
affect an otherwise eligible credit, and the Ohio tax with an explicit $0
retirement-income credit. The expected federal and Ohio AGI is $66,000 and the
Ohio tax is $1,444. Missing facts and other reasons for a Code 1 payment still
require source review. [Ohio Revised Code §5747.055](https://codes.ohio.gov/ohio-revised-code/section-section-5747.055)
and [Ohio Department of Taxation retirement guidance](https://tax.ohio.gov/help-center/faqs/income-retirement-income/income-retirement-income).

Review the ordinary 2025 payment reconciliation in `f6ef1045`. For the
single-filer fixture, one processed April 15 federal estimate of $500 gives
Form 1040 line 26 of $500 and an underpayment penalty of $127. Independently
derive the penalty when two separate processed receipts support $1,000 on
line 26. Confirm the $94 result, the source-date allocation, and the separate
transfer for a payment with an extension. Verify that a Direct Pay confirmation
is reconciled against a processed, unreversed payment before counting it.
The 2026 estimate check covers intake and canonical transfer pending annual
calculation qualification. [2025 Form 1040 instructions](https://www.irs.gov/instructions/i1040gi),
[2025 Form 2210 instructions](https://www.irs.gov/instructions/i2210),
[2026 Form 1040-ES](https://www.irs.gov/pub/irs-pdf/f1040es.pdf) and
[IRS Direct Pay guidance](https://www.irs.gov/payments/direct-pay-help).

## November 23 IRA tuition and Pennsylvania partnership material

**IRA tuition.** A single primary taxpayer under age 59½ has one
fully taxable traditional IRA distribution of $3,000.45 and pays
$2,000.15 of their own tuition at an eligible college in the same
year. The tuition was fully paid without aid, reimbursement,
education-account funds or an education-credit allocation. Review the
eligibility and overlap checks independently. Compare the result with
the implementation's Code 08, $2,000.15 exception, $1,000.30
remaining distribution and $100.03 additional tax. Also review whether
a separately qualifying medical expense uses Code 99 with the combined
exception. The physical review fixture uses $3,000 of taxable IRA
income and $2,000 of qualified tuition. Its line 4 is $100, the
amount printed for Schedule 2 line 5. Confirm the form-line rounding
method before certifying a PDF with cents in the source facts. See
`b406c579`, `16af26be` and `95c40f61`.
[26 U.S.C. §72](https://www.govinfo.gov/content/pkg/USCODE-2024-title26/html/USCODE-2024-title26-subtitleA-chap1-subchapB-partII-sec72.htm) ·
[IRS Publication 970](https://www.irs.gov/publications/p970) ·
[Final 2026 Form 5329](https://www.irs.gov/pub/irs-prior/f5329--2026.pdf).

**Pennsylvania partnership.** Review the 2025 full-year nonresident
who receives an ordinary partnership NRK-1. The matching federal
original reports $10,000 of ordinary income. The Pennsylvania
statement reports the same Pennsylvania-source income and $307 of
nonresident withholding. The taxpayer separately has $184 of
Pennsylvania payroll withholding and files individually without a
consolidated return. Independently verify treatment of NRK-1 ordinary
profit on PA-40 line 4 and withholding on line 17, separate from
payroll withholding. Confirm which original attachments must accompany
the individual return. The implementation holds the official review PDF
until those attachments qualify. See `af96bd3a`.
[2025 PA-40 instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40in.pdf) ·
[2025 Schedule NRK-1](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforbusinesses/partnerships-s-corps-llcs/documents/2025/2025_pa-20s-pa-65nrk-1.pdf).
## November 25 Ohio dependent-care credit

Review one 2026 joint return with two full-year Ohio spouses, separately
verified wages, one claimable child under 13 all year, and linked records
showing that a spouse paid an unrelated Ohio care center so both spouses
could work. Confirm the source restrictions and derive the federal and
Ohio amounts independently. [Federal §21](https://uscode.house.gov/us/usc/119-120/t26/s21/)
and [Ohio conformity statute](https://codes.ohio.gov/ohio-revised-code/section-5701.11).

With $1,500 of qualifying expenses, adequate separate earnings, and
$39,000 of federal AGI and Ohio MAGI, the worksheet expects a 38% federal
rate, a $570 federal tentative credit and a $142.50 Ohio tentative credit.
At $39,001, the figures are 37%, $555 and $138.75. At $40,000, the Ohio
amount is $0. Check both the 100% Ohio tier below $20,000 and the 25% tier
from $20,000 through $39,999.99. Confirm the reporting rounding separately.
[Ohio credit statute](https://codes.ohio.gov/ohio-revised-code/section-5747.054)
and [Ohio rounding statute](https://codes.ohio.gov/ohio-revised-code/section-5703.055).

The interpretation to resolve is whether the instruction to disregard
federal §26 applies to the 25% tier. The final 2025 Ohio booklet directs
that tier to Form 2441 line 11, which can reflect the federal liability
limit. At $39,000 of AGI with $3,000 of eligible care and $680 of available
federal liability, the exact tentative federal amount is $1,140. At 25%,
the statutory worksheet gives $285, and applying the prior line-11
instruction gives $170. Verify the governing treatment and then determine
the separate Ohio liability limit and ordering. The 2026 worksheet stays
outside Ohio return and filing flows pending that review and the applicable
final annual instructions. [2025 Ohio booklet, page 45](https://dam.assets.ohio.gov/image/upload/v1769706362/tax.ohio.gov/forms/ohio_individual/individual/2025/it1040-booklet.pdf#page=45),
[Ohio credit ordering](https://codes.ohio.gov/ohio-revised-code/section-5747.98)
and [IRS final Form 2441 index](https://www.irs.gov/forms-instructions-and-publications?find=2441).

## November 26 Schedule 8812 other-dependent credit

Review the two private wage-only 2026 specimen paths in `5445447a1`.
Independently derive the credit from the confirmed dependents and liability,
then compare the result and stop lines with the specimen. In the first case,
one other dependent produces a $500 tentative credit and the $350 tax limit
leaves $150 unused. With no qualifying child, line 16b is zero and no amount
is refundable. In the second case, one qualifying child and one other
dependent produce $2,700 combined. After $500 in nonrefundable credit, the
$2,200 unused credit is subject to a separate $1,700 ceiling based on one
refundable-credit-eligible child. Reconcile both pages and downstream Form
1040 transfers against the final annual instructions when released.
[Final 2026 Schedule 8812 blank](https://www.irs.gov/pub/irs-pdf/f1040s8.pdf) ·
[IRS draft instructions index](https://www.irs.gov/draft-tax-forms).

## November 26 Ohio bank interest for a midyear move

Review the private cash-method draft at `13f82ced7`. A primary taxpayer
moves from Virginia to Ohio on July 1. Of $50,000 of wages, $30,000 is
allocated to Ohio. The one $4,000 Form 1099-INT Box 1 reconciles to a $3,000
unrestricted bank credit on June 30 and a $1,000 credit on July 1.
Independently derive the domicile allocation and nonresident credit. The
draft applies a 0.4259 nonresident ratio to $1,042 gross Ohio tax, yielding
a $444 credit, $598 Ohio tax and $402 refund after $1,000 withholding.
Confirm the separate resident and nonresident credit boundaries and the
rounding and source requirements in the applicable final Ohio instructions.
[Ohio R.C. 5747.20](https://codes.ohio.gov/ohio-revised-code/section-5747.20/3-23-2022) ·
[Ohio R.C. 5747.05](https://codes.ohio.gov/ohio-revised-code/section-5747.05) ·
[IRS Publication 550](https://www.irs.gov/publications/p550).

The successor at `c2044be1f` covers two additional 2026 cash-method cases.
For the full-year Ohio resident, verify that the $4,000 available interest
and $50,000 of wages give $54,000 AGI, $1,042 Ohio tax, and a $208 refund
after $1,250 withholding, with no nonresident worksheet. For the full-year
nonresident, only $10,000 of those wages was for work performed in Ohio.
Verify the $44,000 outside-Ohio numerator, 0.8148 credit ratio, $849 credit,
$193 tax and $807 refund after $1,000 withholding. Confirm the Part B
exclusion and the allocation and rounding against the final instructions.
[Ohio 2026 draft instructions, pp. 41–42](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/DRAFTS/2026/it1040-booklet-draft.pdf#page=41).

## November 26 Pennsylvania moves with Ohio wages

For `1b9c40793`, derive Ohio results for a single ordinary employee who
works in Ohio for one employer throughout the year and moves between Ohio
and Pennsylvania. Test both move directions with $40,000 of pay during Ohio
residency and $25,000 during Pennsylvania residency, all reconciled to the
original W-2 and payroll. Verify the Schedule of Adjustments line 17 amount,
the exclusion from Schedule of Credits NRC line 1, the $2,400 exemption,
$650 tax and $350 refund after $1,000 of Ohio withholding. Confirm which
original payroll and residency records establish the allocation and whether
the final Ohio instructions change line placement or rounding.
[Ohio AGI statute](https://codes.ohio.gov/ohio-revised-code/section-5747.01) ·
[Ohio reciprocity statute](https://codes.ohio.gov/ohio-revised-code/section-5747.05) ·
[Enacted Ohio rate](https://codes.ohio.gov/ohio-revised-code/section-5747.02/9-30-2025) ·
[Draft reduction instructions](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/DRAFTS/2026/it1040-booklet-draft.pdf#page=25) ·
[Draft NRC instructions](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/DRAFTS/2026/it1040-booklet-draft.pdf#page=41).

## November 26 Pennsylvania part-year small balance

For `a6752c176`, review a single Florida-to-Pennsylvania mover with
$75,000 from one 2026 W-2, $9,000 of documented Pennsylvania-taxable
pay, zero state withholding and four contemporaneous $9,000 estimates of
unwithheld Pennsylvania income. Reconcile the annual estimate requirement
at the statutory thresholds, $276 of Pennsylvania tax and a timely
$276 PA-40 payment. Check the separate outputs for tax, payment settlement
and estimated-tax interest. The engineering review checked stale payroll,
one-cent receipt and owner discrepancies.
[2026 REV-413(I), p. 1](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2026/2026_rev-413i.pdf#page=1) ·
[PA Tax Reform Code §325](https://www.legis.state.pa.us/WU01/LI/LI/US/HTM/1971/0/0002..HTM#19710002u325s).

## November 26 Form 1098 loan transfer

Review two statements reporting $12,000 of interest each for one original
$480,000 acquisition loan sold during the year. The second lender's Box 2
reports $476,000 at acquisition. Verify which original records establish
that there is one debt, the allowable annual balance method, and the
allocation of actual interest, refunds and any points before calculation.
The current guided and direct calculations hold positive Box 11 dates.
Confirm that the no-transfer separate-loan evidence suffices
for ordinary distinct debts and identify any exceptions.
[IRS Form 1098 instructions](https://www.irs.gov/instructions/i1098) ·
[IRS Publication 936](https://www.irs.gov/publications/p936).

## November 26 estimated-tax underpayments

For an ordinary calendar-year resident, take $40,000 of current-year tax,
zero withholding and refundable credits, and no prior-year return or
applicable exception. Independently complete the penalty worksheet for
two alternatives. The taxpayer makes one $36,000 estimated payment on
January 1, 2027, or makes a $36,000 return payment on April 16, 2027,
with no earlier payments. Report the installment amounts, days by rate
period, exact accrual, and whole-dollar penalty. Confirm which date ends
accrual when the payment is later than April 15.

For a farmer who satisfies the two-thirds gross income test, use
$30,000 of current-year tax, $18,000 of qualifying prior-year tax, $5,000
of withholding, and an $8,000 January 15 estimated payment. The taxpayer
files and pays the remaining $17,000 on March 1, March 2, or April 16,
2027. Determine the applicable exception or penalty, date count, and
any disclosures for each. Use the final 2026 forms and instructions when
published. The ruling supplies the applicable rate today.
[Revenue Ruling 2026-25](https://www.irs.gov/pub/irs-drop/rr-26-25.pdf) ·
[26 USC §6621](https://uscode.house.gov/us/usc/119-136/t26/s6621/) ·
[26 USC §6654](https://uscode.house.gov/us/usc/119-134/t26/s6654/) ·
[Draft Form 2210-F](https://www.irs.gov/pub/irs-dft/f2210f--dft.pdf).

## November 26 Pennsylvania and Ohio cash dividends

Review a cash-method individual holding a domestic corporation directly.
The original Form 1099-DIV and complete account ledger reconcile. The
dividends are ordinary cash distributions available on their actual
credit dates, June 30 and July 1. The Pennsylvania example uses $80 and
$40. The Ohio example uses $3,000 and $1,000. Move domicile into the
state on July 1 for the part-year comparison. For the other two
comparisons, hold domicile in the state or out of the state all year.
Assume no business situs or other allocation facts for this account.
Determine the taxable and outside-state portions and how they affect
Pennsylvania Schedule SP eligibility income and the Ohio IT NRC
allocation. Confirm the required records and when a different method
applies. Use the final annual forms to verify form lines and transfers.
[Pennsylvania dividend guide](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/dividends) ·
[Pennsylvania Tax Forgiveness guide](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/tax-forgiveness) ·
[Ohio Revised Code §5747.20](https://codes.ohio.gov/ohio-revised-code/section-5747.20) ·
[Ohio Revised Code §5747.05](https://codes.ohio.gov/ohio-revised-code/section-5747.05).

## November 26 Marketplace estimate exception

Independently complete Form 8962 for a single filer in the contiguous
United States in 2025 and 2026. The filer has a tax family of one,
$14,000 of household income, and no one can claim the filer as a
dependent. At enrollment the Marketplace projected $20,000 for that
coverage year. An original Form 1095-A shows $600 of enrollment
premiums, a $600 applicable benchmark, and $400 of advance credit for
each of twelve eligible months. Assume the plan qualifies and no other
exception or coordination rule applies.

Compute the Form 8962 line 6 answer, total credit, and excess advance
credit repayment in each year for two scenarios. In the first, the
filer gave incorrect information through a reasonable mistake. In the
second, the filer supplied the same information with reckless disregard
for the facts. State what further evidence is needed if records establish
only that the information was incorrect. Confirm the worksheet against
the final annual materials once available.
[26 CFR §1.36B-2](https://www.ecfr.gov/current/title-26/section-1.36B-2) ·
[2026 draft Form 8962 instructions](https://www.irs.gov/pub/irs-dft/i8962--dft.pdf#page=10) ·
[2025 Form 8962 instructions](https://www.irs.gov/instructions/i8962).

## November 26 federal deduction transfers and Ohio filing dates

Pending independent qualified review. Record the form and instruction
revisions reviewed and the sources used for each conclusion.

- Trace the 2026 draft Schedule 1-A deductions through line 44 and the
  Form 1040 deduction lines. Show where the nonitemizer charitable
  deduction and the qualified business income deduction belong and
  which amounts enter line 14. Compare the prior-year transfer
  assignments to check the archived return. Repeat the trace on the
  final 2026 forms when published. [Draft Form 1040](https://www.irs.gov/pub/irs-dft/f1040--dft.pdf#page=3)
  · [Draft Schedule 1-A](https://www.irs.gov/pub/irs-dft/f1040s1a--dft.pdf#page=4)
  · [Draft Form 1040 instructions](https://www.irs.gov/pub/irs-dft/i1040gi--dft.pdf#page=38).
- Assume no filing extension or disaster relief. For an otherwise
  eligible Ohio draft, consider an actual filing and a documented
  balance payment both dated April 15, 2027, when first reviewed on
  April 16. Compare a filing or payment that actually occurred on
  April 16, and a planned April 15 filing with no confirmation at the
  time of review. Identify the evidence needed to distinguish each
  result. Consider employee returns under all three residency types,
  the admitted part-year and nonresident business methods, and the
  withholding-only case where no balance payment is due.
  [Ohio Revised Code §5747.08](https://codes.ohio.gov/ohio-revised-code/section-5747.08).

## November 26 QBI minimum and cooperative patron deduction

Pending independent qualified review. Consider a 2026 single filer with
$300,000 of taxable income before the QBI deduction, $1,200 of materially
participating qualified non-SSTB business income, zero qualified wages
and property basis, and a reported $100 cooperative domestic production
activities deduction (DPAD). Assume no other QBI items or patron
reduction. Confirm whether those facts are sufficient and permissible.

Derive the §199A(a) deduction, any minimum under §199A(i), the separate
patron deduction and cap under §199A(g)(2), and the amount transferred to
Form 1040. The draft Form 8995-A places the cooperative amount on line
38 and compares an amount including it on line 39 with the active
minimum on line 40. Address how that sequence applies when it yields
a different result from applying the minimum to the subsection (a)
deduction and adding the separately capped cooperative amount. Confirm
the treatment against the final instructions when available. The direct
calculation has a cooperative input, and the federal return adapter
does not supply it. This worksheet does not qualify cooperative
patronage or its filing export.
[26 U.S.C. §199A](https://uscode.house.gov/us/usc/119-124/t26/s199A/) ·
[Draft Form 8995-A](https://www.irs.gov/pub/irs-dft/f8995a--dft.pdf#page=3) ·
[Draft instructions](https://www.irs.gov/pub/irs-dft/i8995a--dft.pdf#page=8).

## November 26 combined Pennsylvania interest and dividends

For this fictional single part-year resident, Pennsylvania domicile
begins July 1, 2026. Assume $75,000 in annual wages including $39,000
of verified Pennsylvania compensation. The independently supported
bank interest and ordinary cash dividend originals each report $120,
with $80 credited before the move and $40 credited on July 1. Neither
original reports withholding or any other amount. The only PA
withholding is $1,200 on the wage original.

Independently derive Schedule A, Schedule B, the PA-40 tax and balance,
and worldwide Schedule SP income. Repeat the withholding comparison
with $1,199, keeping all income facts constant. Confirm the treatment
on the final 2026 state forms when published.
[Department of Revenue residency guidance](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax/determining-residency) ·
[Schedule SP instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40sp.pdf).

## November 26 upper QBI form transfers

For Form 8995, use $1,000 and negative $250 of current QBI from two
businesses, a $2,000 prior business QBI loss, $200 in current qualified
REIT dividends and a separate $600 prior qualified REIT/PTP loss.
Use $10,000 of taxable income before QBI and $200 of gains and qualified
dividends. Derive lines 2 through 14 and the two separate carryforwards.

For Form 8995-A, assume a single filer, $239,250 of taxable income
before QBI, a non-SSTB with $100,000 of QBI and $20,000 of business
wages, zero UBIA, $1,000 of qualified REIT dividends and no other
deduction, loss or cooperative facts relevant to this form. Derive
the Part III reduction, the transfer through Part II, and line 32.
Record the official thresholds, loss presentation and final form
revision used in the independent worksheet.
[Draft Form 8995](https://www.irs.gov/pub/irs-dft/f8995--dft.pdf#page=2) ·
[Draft Form 8995-A](https://www.irs.gov/pub/irs-dft/f8995a--dft.pdf#page=3).

## November 26 draft federal tables and Ohio investment allocation

Recompute federal draft ordinary tax at the $25,300 joint example,
just below $100,000, and at $100,000. Recompute the one-child EIC with
$1,000 of earned income and $30,000 of AGI. Confirm how the final
instructions treat a qualifying surviving spouse and each of the eight
partial EIC intervals. Require the final Publication 1040 revision and
source hash before approving filing. The full-cell engineering
comparison used 8,248 ordinary and 11,240 EIC amounts.
[Draft Publication 1040](https://www.irs.gov/pub/irs-dft/p1040--dft.pdf) ·
[November 24 draft instructions](https://www.irs.gov/pub/irs-dft/i1040gi--dft.pdf).

For the single Ohio midyear mover, determine which independently
confirmed receipts from the original Form 1099-INT and Form 1099-DIV
enter IT NRC Part B line 10. Recompute the Ohio allocation ratio, credit,
state tax and refund using the combined synthetic fixture with $58,000
of AGI, $2,000 of investment income received while domiciled in Ohio and
$1,000 of withholding. Record the official form revision and separately
verify both original receipts. The current draft yields a $516 credit,
$636 tax and $364 refund.
[Ohio allocation statute](https://codes.ohio.gov/ohio-revised-code/section-5747.20) ·
[Draft Ohio instructions](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/DRAFTS/2026/it1040-booklet-draft.pdf).

## November 26 Form 8919 original and overtime transfer

Recompute the case of a single employee with $85,000 of W-2 wages
and another $1,000 in Form 1099-NEC Box 1a from a different firm.
The original reports $200 of eligible overtime in Box 1d and
$100 of federal withholding in Box 4. The employee has no
business receipts or expenses. The IRS determination was
issued November 1 and received November 2. Confirm when Reason A
applies, whether the wages enter only once, and how the $200 and
$100 flow to the return. Determine the additional Social Security
and Medicare tax. The draft engine produces $86,000 gross income,
$69,700 taxable income and $77 of additional payroll tax. Record
the final 2026 Schedule 1-A line and authority for the transfer.
[Form 8919](https://www.irs.gov/pub/irs-pdf/f8919.pdf) ·
[Draft Schedule 1-A instructions](https://www.irs.gov/pub/irs-dft/i1040gi--dft.pdf#page=110).

## November 26 separate-filer Form 6251 line 4

Derive the beginning, rate and cap of the high-income Form 6251
line 4 adjustment for separate filers in 2025 and 2026. Recompute
the IRS worked examples beginning at $920,350 in 2025 and $660,200
in 2026. Then use the 2026 $670,200 tentative base with line 2f
deductions of $10,000 and $30,000. Record the tentative AMT income
used to calculate the line 2f limit, the final line 4 addition, and
the actual line 4 for each case. Confirm the enhanced senior
deduction's line reference for the final 2026 form separately.
[IRC §55](https://uscode.house.gov/us/usc/119-142/t26/s55/) ·
[Draft 2026 instructions](https://www.irs.gov/pub/irs-dft/i6251--dft.pdf#page=10) ·
[Final 2025 instructions](https://www.irs.gov/pub/irs-pdf/i6251.pdf#page=9).

## November 27 Form 8919 and Form 8962 transfer review

For 2026 Form 8919 Reason G, assume the worker filed Form SS-8 before
filing the return and has received no reply. The worker shows $600 of
claimed wages tied to a MISC Box 3 original, and the same statement
appears as active other income. Identify the records needed to classify
and report the amount once. Compare an unrelated payer's same-amount
statement and a receipt with no amount attributed to the wage row.
Confirm which distinctions need primary source evidence. The internal
review PDF holds the potential duplicate and waits for reconciliation.
[Final 2026 Form 8919](https://www.irs.gov/pub/irs-pdf/f8919.pdf).

For Form 8962, use a single filer in the contiguous United States with
$18,000 of household income, twelve eligible months, $600 monthly
enrollment premiums, and a $200 monthly benchmark. For advance payments
of $500 or $0 per month, derive the reported amounts and verify the
candidate outputs of $3,978 excess and $2,022 net credit. Also trace an
equal-amount case after annual reconciliation. Confirm the transfers or
zero stop instruction against the final form. Check the alternative-marriage
instructions and verify capped 2025 repayment on line 29. Record the date
and revision used in the signed worksheet.
[2026 draft](https://www.irs.gov/pub/irs-dft/f8962--dft.pdf#page=2) ·
[Final 2025 Form 8962](https://www.irs.gov/pub/irs-pdf/f8962.pdf).

## November 27 vehicle loan statement reconciliation

For a joint 2026 return, assume one Form 1098-VLI reports $900.25 of
interest, including $300 paid directly by a third party, and the taxpayer
deducted $50 of the borrower-paid interest as a business expense. Derive
the personal interest amount from those facts. Then compare two rows with
the same lender and account reference and different borrower and VIN labels
against two loans with separate account references. Identify the record that
resolves the first comparison, such as an amended lender statement or dated
loan records, and confirm each amount that transfers to Schedule 1-A.
[Form 1098-VLI instructions](https://www.irs.gov/instructions/i1098vli) ·
[2026 draft Schedule 1-A](https://www.irs.gov/pub/irs-dft/f1040s1a--dft.pdf).

## November 27 Form 8863 factor precision

For a single primary student with verified refundable AOTC eligibility, a
$2,500 tentative credit, $85,006 on Form 1040 line 11a, and at least $750 of
credit-limit worksheet tax, derive Form 8863 lines 7, 8 and 19. Compare the
exact line 6 factor of `0.4994` with the form's permitted `0.499` display.
Document where whole-dollar rounding applies and derive both transfer amounts
using each permitted preparation method. The current private check accepts
exact-factor workpapers; the shorter factor requires separate review.
[Final 2026 Form 8863](https://www.irs.gov/pub/irs-prior/f8863--2026.pdf) ·
[Draft 2026 Form 8863 instructions](https://www.irs.gov/pub/irs-dft/i8863--dft.pdf).

### November 27 single-student AOTC on a joint return

Use a joint return with $168,000 of Form 1040 line 11a income, zero excluded
income, a $2,500 tentative AOTC for the student spouse and $700 available from
the credit-limit worksheet. The student spouse is 21 and otherwise meets the
student, institution and qualified payment requirements. In the first case,
only the primary spouse has a timely employment-valid SSN and the student has
a timely ITIN. In the second case, only the student spouse has a timely
employment-valid SSN and the primary spouse has a timely ITIN. Independently
derive lines 7, 8 and 19 in each case. Repeat with the primary spouse as the
student and the same two SSN assignments. State which name and TIN lines 20
and 21 require and how the joint return affects the under-24 test.
[Final 2026 Form 8863](https://www.irs.gov/pub/irs-prior/f8863--2026.pdf) ·
[Draft 2026 Form 8863 instructions](https://www.irs.gov/pub/irs-dft/i8863--dft.pdf).

## November 27 Schedule 8812 payroll-based additional child tax credit

Consider a married-filing-separately return with three qualifying children,
$3,000 of wages, zero Worksheet A tax, zero EIC, zero excess Social Security
withholding and no taxes added on Schedule 8812 line 22. The verified W-2s
show $500 and $2,500 of Box 1, 3 and 5 wages. Their Box 4 and Box 6 amounts
are $31 and $7.25 on the first W-2 and $155 and $36.25 on the second.
Independently complete lines 16b through 27 and identify when to round the
combined source taxes. In a second case with a confirmed $0.49 allowable
offset, explain how to handle the difference between rounding after source
subtraction and subtracting the displayed whole-dollar lines. Review the
second case as a rounding boundary using an assumed parent offset.
[Final 2026 Schedule 8812](https://www.irs.gov/pub/irs-prior/f1040s8--2026.pdf#page=2) ·
[Draft 2026 Schedule 8812 instructions](https://www.irs.gov/pub/irs-dft/i1040s8--dft.pdf#page=4).

## November 27 commercial clean vehicle credit and carryback

For a single calendar-year taxpayer materially participating in a sole
proprietorship, consider a qualifying light battery-electric vehicle used
solely for the business. Assume the actual $25,000 purchase and pre-credit
tax basis, comparable gasoline vehicle price of $19,000, zero section 179
deduction, written binding contract and payment on September 30, 2025, and
possession on February 1, 2026. Derive the tentative section 45W credit and
compare original payment dates on October 1, 2025 and December 31, 2022
with the corresponding binding contracts on those dates.

Assume the 2026 workpapers after applying the actual basis treatment report
$3,000 regular tax for section 38, $1,000 tentative minimum tax, zero AMT,
and $500 of allowable nonrefundable credits that reduce the limit. There are
no other business credits. The same taxpayer's 2025 workpapers show a $2,000
section 38 limitation and $1,000 of credits with priority over this carryback.
Assume no earlier-source-year carrybacks. Derive the 2026 allowable credit,
2025 carryback and potential balance into 2027. Verify which vehicle basis
must be reduced, the timing and amount of the reduction, the original records
needed for federal attribution, and the credit ordering before approving an
expected full-return result.
[26 USC §45W](https://uscode.house.gov/us/usc/t26/s45W/) ·
[26 USC §38](https://uscode.house.gov/us/usc/t26/s38/) ·
[26 USC §39](https://uscode.house.gov/us/usc/t26/s39/) ·
[Draft 2026 Form 3800](https://www.irs.gov/pub/irs-dft/f3800--dft.pdf).

For the first-year depreciation review, assume the same vehicle is the only
asset placed in service in 2026 and is an ordinary passenger car with an
unloaded gross weight of 3,000 pounds. The full-year records verify 100%
qualified business mileage, new original use, five-year GDS with 200%
declining balance, no §179 expense, and no basis adjustments beyond the actual
§45W claim. Independently derive Form 4562 lines 25, 26(e), 26(h), and 28
under each of these changes:

- Compare claiming the full per-vehicle credit, a confirmed no-claim position,
  and a valid five-year class election out of bonus depreciation.
- With a claimed credit and no bonus election out, compare a written contract
  enforceable January 19, 2025, with one whose original cancellation rights
  expire January 20. Assume each qualifies as a timely §45W acquisition.
- With the bonus election out, compare placing the vehicle in service on
  September 30 and October 1, 2026.
- With a $68,000 purchase and pre-credit basis and a $62,000 comparable price,
  compare the first-year limit for a January 19, 2025 acquisition with 20%
  bonus versus an election out. Verify the distinction between an ordinary
  car at 6,000 pounds unloaded and an ordinary truck above 6,000 pounds GVWR.

Review the source boundaries and rounding before attributing this deduction
to the Schedule C activity or using it in the Form 3800 tax limit.
Confirm whether the vehicle's adjusted depreciable basis is the same for
regular tax and AMT in each scenario and verify the resulting Form 6251
line 2l adjustment. The current instructions describe equal-basis treatment
for qualified special-allowance property, including the post-2015 election
out rule. A complete Form 3800 result requires the actual post-depreciation
return, including the regular tax, tentative minimum tax and applicable
nonrefundable credits.
[IRS Publication 946](https://www.irs.gov/publications/p946) ·
[Form 6251 instructions, Line 2l](https://www.irs.gov/instructions/i6251) ·
[26 USC §168(k)(2)(G)](https://uscode.house.gov/us/usc/t26/s168/) ·
[Notice 2026-11](https://www.irs.gov/pub/irs-drop/n-26-11.pdf) ·
[Rev. Proc. 2026-15](https://www.irs.gov/pub/irs-drop/rp-26-15.pdf) ·
[Draft 2026 Form 4562](https://www.irs.gov/pub/irs-dft/f4562--dft.pdf).

For a complete current-year federal return, use the same vehicle prices
and 100% bonus rate for an ordinary work van with a 7,200-pound GVWR. Use
$179,185 in verified business receipts, $185 in other business expenses,
no wages or other income, and the 2026 single standard deduction. The
taxpayer's annual log shows 654.25 actual hours of material participation.
Derive Schedule C net profit, Schedule SE tax, Form 1040 AGI and taxable
income, Form 8995 QBI deduction, and Form 6251 tentative minimum tax.
Recompute Form 3800 and Schedule 3 after an otherwise eligible $2,200
child tax credit. Compare calculating as of January 31 and February 1
when the actual possession date is February 1. Report independent expected
results together with any source or rounding disagreements.
[Final 2026 Schedule SE](https://www.irs.gov/pub/irs-prior/f1040sse--2026.pdf) ·
[Rev. Proc. 2025-32](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf) ·
[Form 6251 instructions](https://www.irs.gov/instructions/i6251) ·
[26 USC §38](https://uscode.house.gov/us/usc/t26/s38/).

For the carryback case, use two otherwise eligible children in the same
current federal return. The taxpayer filed a calendar-year single 2025
return on April 15, 2026. Its actual ordinary §38 limit is $1,400 and
$1,000 of priority credits apply. Derive the 2026 tax reduction, unused
credit, permitted 2025 carryback and potential 2027 balance. Then reconcile
a separate 2025 vehicle MAGI workpaper that says the taxpayer filed
jointly. Compare calculations dated April 14 and April 15 and identify
which workpapers must be available. Verify the §108 attribute reduction
ordering before accepting an unused-credit case with an excluded debt
discharge. [26 USC §39](https://uscode.house.gov/us/usc/t26/s39/) ·
[IRS Form 3800 instructions](https://www.irs.gov/instructions/i3800).

For the continuing-asset case, assume the same ordinary 7,200-pound work
van entered service in 2025. The filed 2025 workpapers include the verified
$6,000 credit, a timely five-year class election out of bonus, no §179 and
the ordinary half-year 200% GDS method. The actual yearly mileage logs show
100% qualified U.S. business use for the same vehicle, with no disposition
or other basis changes through the close of 2026. Independently verify the
2025 allowed and allowable depreciation, the 2026 opening and closing basis,
and Form 4562 lines 26(h) and 28. For the posted-value check, compare an
original exact basis of $10,001.50, filed line 21 of $10,002 and filed line
26 of $3,001. Derive the exact second-year deduction and the final reported
whole-dollar amount. [IRS Publication 946](https://www.irs.gov/publications/p946) ·
[2025 Schedule A (Form 8936)](https://www.irs.gov/pub/irs-prior/f8936sa--2025.pdf) ·
[26 USC §1016](https://uscode.house.gov/us/usc/t26/s1016/).

## November 27 Ohio wages with interest and dividends

For a single taxpayer without other income or dependents, use $50,000 of
verified W-2 wages, $4,000.25 of ordinary taxable bank interest and
$4,000.25 of ordinary cash dividends. Compare the full-year Ohio resident
with a full-year nonresident domiciled in a nonreciprocal state. For the
nonresident, assume original employer records establish $10,000 of wages
from actual Ohio work and the investments have no Ohio business source.
Derive adjusted gross income, the Ohio wage and nonbusiness investment
amounts, the tax before credit, and the nonresident credit ratio and tax
before payments.
Compare separately rounded original items with the draft amounts and
identify which rounding step controls the ratio. Document any differences
from the prepared case before approving a final 2026 transfer.
[Ohio allocation statute](https://codes.ohio.gov/ohio-revised-code/section-5747.20) ·
[Ohio credit statute](https://codes.ohio.gov/ohio-revised-code/section-5747.05) ·
[Draft 2026 IT 1040 instructions](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/DRAFTS/2026/it1040-booklet-draft.pdf).

## November 27 Pennsylvania resident and nonresident investment comparison

For a single taxpayer with $75,000 of verified wages, compare continuous
Pennsylvania domicile with continuous domicile in a nonreciprocal state.
The nonresident worked in Pennsylvania and earned $9,000 there. The
ordinary interest and dividends are $120.11 and $120.19, respectively.
Neither investment arises from a Pennsylvania business. Derive the
individual Pennsylvania income lines, taxable income, tax and Schedule SP
eligibility income under each residency. Confirm the treatment of the
individual amounts under the final 2026 instructions before approving the
transfers.
[Pennsylvania interest guide](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/interest) ·
[Pennsylvania dividend guide](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/dividends).

## November 27 second-year Schedule C and AMT attribution

Carry the verified 2025 work van and its 2026 depreciation into the same
taxpayer's primary cash Schedule C. Use $166,265 receipts, $125.25
advertising, $40.25 office expenses and $19.50 supplies. Derive regular
Schedule C profit, the separate AMT basis and adjustment, the QBI deduction
and total tax. Check whether the original credit has any new current-year
effect. Repeat the QBI source check with a break-even Schedule C and a
separate $40,000 S corporation K-1. Confirm which source supports each
deduction before approving a federal transfer.
[IRS Publication 946](https://www.irs.gov/publications/p946) ·
[Form 6251 instructions](https://www.irs.gov/instructions/i6251) ·
[26 USC §1016](https://uscode.house.gov/us/usc/t26/s1016/).

## November 27 Form 4952 final worksheet

Use verified $6,000.25 current-year investment interest and $2,000.50
from the filed 2025 carryforward. Ordinary original records show
$5,800.50 gross investment income, $1,000 of qualified dividends,
$4,000 net gain including $3,000 net capital gain, and $500 deductible
investment expenses. There is no preferential-income election or Form 8814
amount. Derive the investment interest deduction and disallowed carryforward.
Compare every posted monetary line with the private review proof and confirm
the final form and transfer rules before any public export.
[Final IRS Form 4952](https://www.irs.gov/pub/irs-prior/f4952--2026.pdf).

## November 27 Form 2210 receipt reconciliation

Compare one $2,000.01 processed extension payment on April 9, 2027 with
two separate $2,000.01 original receipts for the same day, one extension
and one balance-due payment. Use $8,000 of initially unpaid required
installments. Verify which entry relieves the unpaid amount in each
case, the effect on the penalty to the observation date, and that a
repeated receipt does not create a new payment.
For the observation-date case, compare a verified April 10, 2027
receipt with a receipt dated April 12 at an April 10 observation date.
Also check a December 31, 2026 payment entered as balance due. Compare
the fourth-installment penalty for actual January 20, 2027 filing and
payment in full with the projection without that confirmation.
[IRS Form 2210 instructions](https://www.irs.gov/instructions/i2210) ·
[26 USC §6654](https://uscode.house.gov/us/usc/119-134/t26/s6654/).

## November 27 Schedule R private Box 2 proof

Use the published 2026 single under-65 example with $16,170 taxable
disability income, $16,270 adjusted gross income, $500 nontaxable
Social Security and a $16 credit limit. Confirm the current disability,
the employer payment and the retained Line B physician statement facts
independently. Compare a valid prior signature on or after retirement
with a signature dated before retirement. Derive the tentative, limit
and allowed lines before any public transfer is qualified.
[Final Schedule R](https://www.irs.gov/pub/irs-prior/f1040sr--2026.pdf) ·
[Schedule R instructions](https://www.irs.gov/instructions/i1040sr).

## November 28 ordinary mixed-use dwelling

Independently calculate the Schedule E amounts for the synthetic
sole-owner dwelling with one fair-market lease for 90 days and ten
separate personal-use days. Rent installments total $2,500.27. The
rental-only advertising is $100.05. Shared insurance, utilities and
property tax are $1,000.10, $100.20 and $100.00. A $50.00 expense is
entirely personal. The taxpayer elected the standard deduction. The
original asset register records that the building's $60,000 depreciable
basis was fully recovered before 2026 and shows no current assets.

Verify the home-use threshold, category allocation and treatment of
personal and vacant days. Confirm which exact and rounded amounts
transfer to Schedule E and Form 1040. Check that the lease and receipt
records establish the ordinary rental classification. Document the
separate worksheet required if the home-use threshold is exceeded.
[IRS Publication 527](https://www.irs.gov/publications/p527) · [26 U.S.C. §280A](https://uscode.house.gov/us/usc/119-124/t26/s280A/) · [Draft 2026 Schedule E instructions](https://www.irs.gov/pub/irs-dft/i1040se--dft.pdf#page=7) · [Synthetic fixture](../tests/engine/schedules/schedule-e-personal-use-2026.test.ts).

## November 28 Pennsylvania purchases in two localities

Independently derive annual use tax for a Pennsylvania resident with
one $10,000 taxable purchase delivered in Philadelphia and another
$10,000 taxable purchase delivered in Allegheny County. No sales or use
tax was previously paid. Confirm the amount reported on PA-40 Line 25
and the rate and credit applied to each purchase. Also confirm whether
a confirmed receipt dated after the application snapshot should be
excluded from that snapshot. Reconcile the final annual blank and
directions before approving filing output.
[Pennsylvania use-tax guidance](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/sales-use-and-hotel-occupancy-tax/use-tax/use-tax-for-individuals) · [2025 PA-40 instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40in.pdf) · [Synthetic fixture](../tests/engine/state/pa-2026-ordinary-draft.test.ts).

## November 28 residence expense carryover and at-risk worksheet

For the Schedule E case in `2d174de8b`, assume one wholly owned dwelling
rented at fair value for 80 days and used personally for 20 days, with one
lease. There is $1,000 in rent, $100 of rental-only advertising and $1,250 of
shared insurance. The taxpayer takes the standard deduction. The prior-year
carryovers, current casualty losses and allowable depreciation are all
documented as zero. Derive Worksheet 5-1 lines 2d, 3, 4a, 4f, 7a and 7b,
the Schedule E net and the Form 8582 treatment. Repeat with $1,125 of
insurance to test exact break-even. Determine which separate facts are
required for EIC and NIIT when the same dwelling yields positive net income.
[IRS Publication 527](https://www.irs.gov/publications/p527) · [Form 8582 instructions](https://www.irs.gov/instructions/i8582) · [Form 8960 instructions](https://www.irs.gov/instructions/i8960)

For the Form 6198 case in `6aadaaedd`, assume one ordinary nonpassive
partnership, a $6,000 Box 1 loss, $12,000 of opening outside adjusted basis
and $8,000 included in that basis for which the investor is not at risk.
There are no other relevant adjustments, QBI or self-employment amounts,
prior suspended losses or recapture. Derive Part II lines 6 through 10b,
Part IV lines 20 and 21, the Schedule E transfer and the suspended loss.
Explain how the opening basis and the $4,000 prior at-risk balance affect
the separate worksheets. Identify any fact that would require Part III or
recapture in this scenario.
For `3afb03ba4`, repeat the case with the full $12,000 included in basis
but protected against loss. Derive lines 10a, 10b, 20 and 21, the current
Schedule E deduction and the suspended loss. Explain the recapture inquiry
if the actual Part II decreases instead exceed opening basis by one cent.
[Form 6198](https://www.irs.gov/pub/irs-pdf/f6198.pdf) · [IRS instructions](https://www.irs.gov/instructions/i6198) · [26 U.S.C. §465](https://uscode.house.gov/us/usc/119-124/t26/s465/)

## November 28 recipient classification for direct 2026 gifts

For `c545b7a76`, use a single 2026 taxpayer who takes the standard
deduction, has a $100,000 contribution base and has no charitable
carryovers or other gifts. Each gift has the required documentation.
Evaluate these three independent cases and identify the recipient facts
that determine the result.

- A $500 cash gift to an eligible public charity described in
  §170(b)(1)(A). The organization is neither a supporting organization
  nor a donor-advised fund. The taxpayer receives no benefit.
- A $500 cash gift to a qualified nonprofit cemetery described in
  §170(c)(5), for its general exempt purposes. The cemetery has no
  qualifying §170(b)(1)(A) status. The taxpayer receives no benefit.
- A $500 payment to the eligible public charity in the first case.
  The fair market value of the goods and services received is $500.

Derive the allowable standard-deduction charitable amount under §170(p)
for each case. Explain whether a saved answer that the recipient is not a
private foundation can establish §170(b)(1)(A) status on its own. For the
last case, also state whether the payment creates any charitable carryover
or affects a charitable calculation involving a net operating loss.
[26 U.S.C. §170](https://uscode.house.gov/us/usc/119-124/t26/s170/) · [IRS Publication 526](https://www.irs.gov/publications/p526)
