# Philadelphia 2026 nonresident salary allocation

Reviewed the city sources on November 19, 2026. Income Tax Regulations
§209(a) apportions straight salary by actual working days and requires signed
employer evidence for assignments outside the city. Section 401 ties withholding
to payment. The Department's remote-work policy explains why work away from the
city at the employee's convenience stays taxable when a Philadelphia worksite is
regularly available. The nonresident rate is 3.43% through June 30 and 3.425%
starting July 1. [Income Tax Regulations](https://www.phila.gov/media/20200131115216/Philadelphia-Income-Tax-Regulations-compiled-2020-january.pdf) · [Remote-work policy](https://www.phila.gov/media/20231024112123/UPDATED-Wage-Tax-policy-guidance-for-non-resident-employees.pdf) · [City rate history](https://www.phila.gov/departments/department-of-revenue/forms-documents/regulations-rulings/tax-rate-history/)

The review draft covers a full-year city nonresident with one employer, a
Philadelphia base of operations and an available regular city worksite,
straight salary, complete whole-day records and actual Philadelphia withholding. It
reconciles the payroll totals to one original W-2 local row and matches the
workday counts and required outside dates and locations to the signed employer
record. A worksite keeps one city geography across all workdays even when the
employer requirement varies by date. The calculator applies the statutory day
fraction to paid salary in each half and uses the existing cents calculation.
A payment with workdays in the other half
requires a separate method. The latest petition listed by the City was explicitly
for 2025. Its printed allocation and rounding rules provide historical context.
Final 2026 petition presentation and filing qualification remain open.
[City refund procedure](https://www.phila.gov/services/payments-assistance-taxes/taxes/refunds/request-a-wage-tax-refund/) · [Published petitions and certification templates](https://www.phila.gov/documents/wage-tax-refund-form-salaried-employees/)

Spec-first validation recorded 32 new failures alongside 16 existing passes.
A second failing control caught an omitted regular workday before the certified
half totals were enforced. Independent review reproduced a location assigned
both city and outside geography, and its regression failed before adding the
consistency check. A separate Python Decimal calculation reproduced
$12,000 and $9,000 taxable salary, $719.85 tax and $205.65 overpayment. For the
one-half recurring fraction it reproduced $6,666.67 taxable salary, $228.33
tax and $114.17 overpayment. On Node v26.13.1, all 64 focused tests, all 1,256
Pennsylvania spec references, root TypeScript and strict scoped lint passed.
