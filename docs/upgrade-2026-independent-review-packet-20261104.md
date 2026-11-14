# Request for independent tax review — November 4 UTC fixed packet

We need a written, independent assessment of the specific tax methods and cases
listed below. Please check the controlling authority, derive expected results
from the supplied original synthetic records, and report any differences or
unsupported cases. This packet contains no professional approval. All reviewer
names, opinions, decisions and signatures remain unfilled.

The intended launch jurisdictions are Pennsylvania and Ohio, for resident,
part-year and nonresident returns. That selection is settled; none of those six
categories is broadly filing-qualified. A finding about one case does not decide
another year, household, income method or local obligation.

## What you will receive before work begins

The fixed source snapshot is [f09a3dd7](https://github.com/utilityfueled/tax-engine/tree/f09a3dd7ad2f3a12f02a8d50efd0da01050033e6), Git tree `45488b161876873cbbed6091e79ee24a2317954c`. The [delivery manifest](upgrade-2026-independent-review-delivery-20261104.json) binds the supplied spec, synthetic fact files and ledgers by SHA256. This packet is prepared for assignment; no reviewer has accepted or approved it. A later application change needs a recorded scope comparison before review can apply to it.

| Delivery record | Current value |
| --- | --- |
| Source commit and tree | Fixed above; manifest records both |
| Original synthetic facts, specs and engineering ledgers | Fixed hashes in the delivery manifest; all are public repository test records |
| Public authority refresh | [November4 UTC refresh](upgrade-2026-public-source-refresh-20261104.md); raw-response hashes retained there |
| Reviewer, qualifications and independence | PENDING assignment |
| Accepted years and named scenarios | PENDING reviewer acceptance |
| Independently derived expectations and signed findings | PENDING; leave [the decision form](upgrade-2026-independent-review-decisions-20261104.json) unapproved |

Original source records are necessary for checking ownership and payment history.
Review PDFs intentionally redact identifiers and are not full-data backups.
Supply the original synthetic records securely and separately from credentials;
do not transmit any real taxpayer records or account secrets as part of this
prepared synthetic packet.

## Suggested first assignments

Select explicitly named methods within the reviewers' expertise. Each row is a
review request, not a completed or approved scope. The linked package ledgers
define the narrower admitted cohort and must be supplied with their manifests.

| Proposed assignment | Questions to answer |
| --- | --- |
| Federal2025 source and household baseline | Are actual owner/year/history facts sufficient, deductions and credits ordered correctly, and all intermediate rounding points justified? Is each required attachment present or honestly unavailable? |
| Federal2026 law integration | Check enacted law/effective dates, indexed amounts, family/dependent rules, SALT, Schedule1-A, QBI, health/PTC, education and charitable transition/carry rules. The code explicitly remains incomplete; final2026 forms are a separate requirement. |
| PA ordinary and married J/M | Check actual eligibility and state election independently of federal MFJ, separate-owner income/cash, household SP eligibility and shared-versus-per-owner rounding. Confirm actual PA40/SP column/status mapping and distinguish a requested refund from cash received. |
| PA care, royalties, interest and debt | Review each finite source method separately: actual care eligibility/provider receipts, MI royalty settlement and historical-return corrections, pending foreign-account cash and zero-credit limits, and personal unsecured-debt qualifications. Do not infer settled refunds or allowed credit from withholding. |
| Ohio reciprocal employee | Check actual PA domicile/OH service and reciprocity, separate PA/OH withholding, known zero versus positive cents, required W/IT1040/Credits companions and nominal printed exemption-credit treatment without changing canonical cash. |
| Ohio resident/Virginia credit | Check actual same-income classification, filed VA return, remittance/refund chronology, complete account and linked distinct transaction identities. Derive the tax/credit limit and withholding/refund independently; scalar amounts alone are not source proof. |
| Ohio ordinary business NR/PY | Check current C/half-SE/BID and apportionment, actual property/payroll/benefit-of-service sales, zero payroll reweighting, source-dated residence and actual county/district originals. Check new July212 versus retained old181 output limits. |
| Ohio Hillsdale0302 earned-income SD | Check actual district/Finder/domicile originals, tax base/rate, W2 local classification, SD versus IT cash, dated estimates/prior credit, outgoing election and required official companions. Municipal obligations remain distinct. |

Supply engine/audit and saved-PDF comparisons after the reviewer pins independently derived expectations. The manifest contains original synthetic inputs and their engineering ledgers; it does not turn the existing expected numbers into professional approval. The reviewer must record which inputs and authority were used for each independently computed result.

The new July212 business sources retain annual profit$100,000/$400,000, actual
property$10,000 Ohio/$20,000 everywhere, payroll0, sales benefit ratio.25 and
independently dated deductions. Their 780 source-pinned cells and82 appearances
are engineering checks; your legal/source assessment remains required. Its four
privacy adversarial cases denied before output, so they are not examples of
rendered masking. Do not infer an amount allowlist from two example profits.

## Questions requiring a specific written interpretation

Keep original facts unchanged. If none of the retained alternatives is correct,
derive the replacement and identify its authority.

- Form172/section1202: the unchanged historical loss/gain/exclusion example
  produces competing$99,800 versus$100,000 NOL treatments. Explain the capital
  adjustment, IRC172(d)(2), regular/AMT and future-history consequences.
- Mixed employee/business tips: determine attribution of the reduced combined
  deduction before QBI, including multiple businesses and rounding.
- Two educators' reduced education-bond exclusion and equal partition of a
  community bond: distinguish actual ownership from allocation, recognition,
  successor basis and state-property conditions.
- Broader Coverdell disqualification and two-owner capped PTC repayment: resolve
  each retained event and owner limit separately.
- The five retained COD/charity frames: resolve capacity crossing, prior-property
  treated-paid versus final allowance, partial cash/property attribution,
  current/prior charitable floor allocation and nonadditive NOL benefit. An
  arbitrary order, proportional split or override is not established authority.
- The method register's named EIC, foreign-tax basis/release, shared-policy/PTC,
  annualized preferential income and business1099-G questions: first confirm the
  current exact source boundary, then decide that question. Do not reopen a later
  delivered method merely because an older register still names it.
- PA government unemployment with apparently erroneous state withholding, and
  young code7 retirement originals: establish lawful classification/source facts
  before admitting an unsupported positive. Missing facts must remain unknown.

The existing packet and individual decision ledgers preserve the precise original
frames and source passages. Engineers should prepare one question sheet per
decision, with the original competing calculations and any source search limits.

## November 13 companion for qualified lump-sum distributions

Use the final 2026 Form 4972. Check the later, local `cd4b3e29` calculation
and `9758b773` physical review mapping separately from the fixed November 4
packet. The finite worksheet covers one qualifying participant, one
distribution and one confirmed recipient. For the beneficiary estate-tax
case, the participant died on or after August 21, 1996. The administrator's
original record must establish the attributable amount.
[Final Form 4972](https://www.irs.gov/pub/irs-pdf/f4972.pdf).

Derive the capital and ordinary allocation independently for the synthetic
case with Box 2a of $20,000, Box 3 of $5,000, and $2,000 of estate tax.
Boxes 6 and 8a are zero. Compare elections for Part II alone, Part III
alone and both. For Part II alone, resolve the ordinary income and any
separate deduction on Schedule A under section 691(c). Verify that
the same dollar of estate tax cannot reduce line 6 and also enter an
itemized deduction. Include one itemizing return, one standard-deduction
return and a return subject to the 2026 limitation on itemized deductions.
[26 U.S.C. § 691](https://uscode.house.gov/us/usc/119-124/t26/s691/) ·
[IRS Publication 559](https://www.irs.gov/publications/p559) ·
[Schedule A instructions](https://www.irs.gov/instructions/i1040sca).

Verify the separate-tax amount and ordinary pension transfer against the
published annual return when it becomes available. The current 2025
Form 6251 removes the Form 4972 tax in the regular tax comparison on
line 10. The current Form 1116 instructions exclude it from the ordinary
foreign-credit limit and use a separate category g worksheet for foreign
lump-sum distributions. The current Form 2210 instructions include it
on Schedule AI line 16 for periods that contain the actual event.
Confirm each rule against the final 2026 revisions and derive one
positive and one unaffected control for each applicable interaction.
[Form 6251](https://www.irs.gov/pub/irs-pdf/f6251.pdf) ·
[Form 1116 instructions](https://www.irs.gov/instructions/i1116) ·
[Form 2210 instructions](https://www.irs.gov/instructions/i2210).

On November 13 the IRS current-form endpoints still served 2025 Forms
1040, 6251, 1116 and 2210 and 2025 Schedule A. The IRS lists a draft 2026
Form 1040. Pennsylvania's filing page still links its 2025 PA-40 and
Ohio's forms page lists the 2025 IT 1040 and SD 100 as current top returns.
Record the exact final revisions when they become available.
[Form 1040](https://www.irs.gov/pub/irs-pdf/f1040.pdf) ·
[IRS draft index](https://www.irs.gov/draft-tax-forms?find=Individual+Income+Tax+Return) ·
[Pennsylvania forms](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax) ·
[Ohio forms](https://tax.ohio.gov/home/forms).

## November 13 farmland and refundable credit questions

For Form 1062, derive the sale gain and both tax determinations separately
from the synthetic direct-sale originals in `50c72a04`. Confirm which
regular-tax additions and credit subparts to recompute. Check installment
rounding, the sale-year estimated payment exclusion and the later
installment and acceleration boundaries. In IRS ATS scenario 13 the
partnership allocation supplies $56,516, the partner's Schedule A lines 9–12
are blank, and draft Form 1062 reports $13,621 on line 14 and $3,405 on
line 15. Verify the required partnership originals and return transfers
independently. Verify why the draft Form 1040 reports $21,715 on line 24c
while printed lines 24a and 24b sum to $21,714. Confirm the cent calculation,
the final form instructions and any IRS correction before adopting the
transfer. The published partnership example also supplies identical $1,413
additions on both sides. Confirm the controlling applicability of each
addition rather than inferring eligibility from that scalar example.
[IRS instructions](https://www.irs.gov/instructions/i1062) ·
[IRS ATS scenario 13](https://www.irs.gov/pub/irs-efile/ty26-1040-ats-scenario-13.pdf) ·
[Notice 2026-3](https://www.irs.gov/pub/irs-drop/n-26-03.pdf).

For Schedule 3-A, confirm which amount controls Pennsylvania's Working
Pennsylvanians Tax Credit and Ohio's earned income credit if the final
federal treatment leaves a positive amount on Form 1040 line 27a but
adjusts aggregate refundable payments. Pennsylvania's statute refers to
the federal credit received and separately requires claiming it. Ohio's
statute refers to the federal credit allowed. Check a return with EIC
alone and a return with EIC and a second refundable credit. Verify the
effective date and state agency transfer instructions before relying on
either interpretation. [PA Act 45 of 2025, section 15](https://www.palegis.us/statutes/unconsolidated/law-information/view-statute?ActNum=0045.&SessInd=0&SessYr=2025&txtType=PDF) ·
[Ohio Revised Code §5747.71](https://codes.ohio.gov/ohio-revised-code/section-5747.71) ·
[IRS draft Schedule 3-A](https://www.irs.gov/pub/irs-dft/f1040s3a--dft.pdf).

## How to record your result

For every method actually examined, record:

1. The exact year, jurisdiction, residency/household/income cohort and source facts.
2. The operative statutory/regulatory/instruction revisions, effective dates and
   any professional interpretation, separately from a published worked example.
3. Independently derived eligibility, line formulas, precision/rounding, tax,
   refund/balance/carry values and required forms.
4. Comparison to engine/audit, guided confirmation and saved physical output;
   findings and the correction/retest references.
5. Your decision: approved within the stated scope, changes required, or unresolved;
   exclusions, conditions for re-review, date, qualifications and signed reference.

Use the linked decision form as an empty working form. No signature or approval is
prepopulated. An unresolved item stays unresolved. A successful software test or
agent review cannot replace your derivation or professional judgment.

## Separate release requirements

The current federal rule packs remain2025.223 legacy-available and
2026.221-law-integration-draft incomplete, both independently unapproved. The
public review-template pack remains2025.2-review. The compiled filing allowlist
is empty. This packet does not change any of those facts.

A tax opinion does not complete independent security/privacy review, AI human
case labels, live provider/accounting evaluation, final native runtime evidence,
hosting outages/restoration, final forms, filing activation or production
authorization. Those owners must supply their own exact-artifact evidence.
