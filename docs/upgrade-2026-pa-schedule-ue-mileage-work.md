# Pennsylvania Schedule UE mileage for 2026

The preliminary 2026 calculation applies $0.76 to the annual total of qualifying
employee business miles. Pennsylvania’s latest published Schedule UE and PA-40
instructions use the highest federal business rate for the whole year when the
IRS changes it midyear. The IRS set $0.725 initially and raised its own rate to
$0.76 beginning July 1. [2025 PA Schedule UE, Section II line 6](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40ue.pdf),
[2025 PA-40 instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40in.pdf),
[IRS Notice 2026-10](https://www.irs.gov/irb/2026-04_IRB),
[IRS Announcement 2026-11](https://www.irs.gov/irb/2026-29_IRB).

The department’s mileage FAQ still listed the original $0.725 rate as of its
March 23, 2026 update. Its September 14, 2026 Schedule UE FAQ confirms the annual
total-times-federal-standard method after the federal change. The rate is an
application of that guidance and the latest printed line 6 instructions. As of
November 12, 2026, a final or draft 2026 Pennsylvania Schedule UE or final PA-40
instructions were unavailable in the public state forms search. Confirm the
rate against the year-specific instructions and obtain qualified tax review
before promoting it. [PA mileage FAQ](https://revenue-pa.custhelp.com/app/answers/detail/a_id/2577),
[PA Schedule UE FAQ](https://revenue-pa.custhelp.com/app/answers/detail/a_id/3205).

Typed Schedule UE inputs carry annual total and business mileage. Taxpayers need
the underlying dated trip records to establish eligibility. The source-bound
guided employee workflow currently accepts union dues, work clothing, small tools
and supplies, and occupational license fees. It has no positive vehicle-mileage
path. The full typed 2026 Pennsylvania return is still gated by incomplete 2026
federal rules, including the federal earned-income-credit line required by the
Pennsylvania Working Pennsylvanians Tax Credit path. The Schedule UE summary
remains a reference artifact. [PA unreimbursed business expense guide](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax/unreimbursed-business-expenses).

The spec and tests preceded the Decimal rate change. The old rate failed the
annual-mileage, PA-40 line 1b composition and reference-summary regressions. The
five targeted suites passed all 347 tests with the new rate, including the 2024
and 2025 rates, actual vehicle expenses, and the typed 2026 return gate. The
Schedule UE spec validator resolved all 25 test references. The root typecheck,
scoped engine lint and diff check passed. The PDF test file retains the
baseline’s seven lint warnings and adds zero errors or warnings.

The same 2025 instructions identify separate qualification work in the general
typed Schedule UE path. Section II line 13 allows 100% of actual qualifying
overnight travel meals. Lines I and J distinguish reimbursements already taxed
on Form W-2, reimbursements covering an expense class, and excess reimbursement
reported as additional compensation. The existing general calculator limits
meals to 50% and subtracts a single aggregate reimbursement. Both differences
require separate source and regression coverage. [2025 PA Schedule UE, lines 13, I and J](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40ue.pdf).
