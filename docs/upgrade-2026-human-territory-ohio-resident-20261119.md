# Independent 2026 review assignments for territory deductions and Ohio business sales

Both assignments are open. No qualified human reviewer is assigned. Give reviewers the case facts and a blank worksheet first. Ask each reviewer to record their authority, source revisions, method, line results, assumptions, uncertainties and dated disposition before sharing the engineering comparison. Use fictional records only.

## Federal territory deduction allocation

A single taxpayer reports $505,000 in taxable gross wages and discloses $100,000 of territory income excluded for federal purposes. Consider separate Puerto Rico and American Samoa versions. The taxpayer reports $12,000 of general real-estate tax, with no other itemized deductions in this exercise. Treat the exclusion as provisionally supported to derive the arithmetic. List the facts and original records needed to substantiate it and distinguish gross income from adjusted gross income.

Derive the standard-deduction and itemized alternatives independently. Show the treatment of expenses attributable only to taxable income, only to excluded income, and to both. Explain when to allocate property taxes and when to apply the SALT limit. Identify where actual gross-income and deduction-attribution data belong on the applicable annual worksheets. State how a duplicated disclosure or a conflict between Schedule A and Schedule 1-A should affect readiness. [IRS Publication 570](https://www.irs.gov/publications/p570) · [26 U.S.C. §164](https://uscode.house.gov/us/usc/t26/s164/) · [§931](https://uscode.house.gov/us/usc/t26/s931/) · [§933](https://uscode.house.gov/us/usc/t26/s933/).

## Ohio full-year resident business sale

A single full-year Ohio resident reports one $50,000 Ohio W-2 and one completed long-term secondary-market sale of corporate stock. The broker statement shows $450,000 proceeds, $50,000 basis, and a security identifier matching the executed agreement for the same issuer. The owner held 40 of 100 equal-rights shares and sold 20. The company continuously operated, was incorporated and was headquartered in Ohio throughout the pre-sale period. The owner attests to five years of qualifying participation. Each of the five applicable calendar years has one complete $100,000 Ohio withholding-payroll record for an unrelated worker. The gain is recognized in full in 2026. Carryover records show no capital losses. The fixture supplies no complete payment history.

Derive the Ohio business-sale deduction, business income deduction, modified adjusted gross income, exemption, tax bases and tax components separately. Confirm how to validate participation and payroll, including evidence of Ohio withholding compensation, related-party exclusions, and the denominator for the sold percentage. Resolve deduction order and the income adjustments used in the exemption and tax calculation. Identify what needs the final 2026 instructions and what records would support estimating a balance or penalty. Repeat the admission review with payroll from a different issuer and with a broker statement designated as withholding-only for an open short sale. [Ohio Revised Code §5747.79](https://codes.ohio.gov/ohio-revised-code/section-5747.79) · [§5747.01](https://codes.ohio.gov/ohio-revised-code/section-5747.01) · [§5747.06](https://codes.ohio.gov/ohio-revised-code/section-5747.06) · [IRS Form 1099-B instructions](https://www.irs.gov/pub/irs-pdf/i1099b.pdf).

## Record the independent decisions

| Assignment | Reviewer and qualification | Date and authority revisions | Worksheet and disposition |
| --- | --- | --- | --- |
| Federal territory allocations | Unassigned | Pending | Pending |
| Ohio resident business sale | Unassigned | Pending | Pending |

<details>
<summary>Engineering comparison for use after the independent worksheet</summary>

- Federal `22d9b9aa` holds ordinary 2026 returns with the disclosed exclusion and no allocation in the standard, itemized, nonitemized, automatic and default paths. This applies when an equivalent alias is omitted or agrees with the primary disclosure. The engineering illustration uses $505,000/$605,000, giving $10,017 of allocated property tax before a $10,400 cap and $13,439 of a $16,100 standard deduction. These are arithmetic comparisons for a worksheet. The guarded return produces no tax result for this incomplete packet. [Spec and source](https://github.com/utilityfueled/tax-engine/commit/22d9b9aa) · [Regression inputs](https://github.com/utilityfueled/tax-engine/blob/22d9b9aa/tests/engine/federal-salt-2026.test.ts).
- Ohio `4ae1b8e6` produces $400,000 business gain, $450,000 federal adjusted gross income and Ohio modified adjusted gross income, $100,000 business-sale deduction, $250,000 business income deduction, $50,000 remaining business income and $100,000 Ohio adjusted gross income. The $1,900 exemption leaves $48,100 of nonbusiness taxable income. The draft yields $938 of nonbusiness tax and $1,500 of business tax, for $2,438 before payments. The computed values survived reparse and a JSON round trip. Both changed-source controls held. Payment, refund and penalty stayed unknown. [Spec and source](https://github.com/utilityfueled/tax-engine/commit/4ae1b8e6) · [Fictional fixture](https://github.com/utilityfueled/tax-engine/blob/4ae1b8e6/tests/fixtures/oh-2026-resident-capital-gain.ts).

</details>
