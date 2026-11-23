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
