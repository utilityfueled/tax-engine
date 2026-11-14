# Personal mortgage cancellation with a current business loss

Complete retained-home cancellation sources now compose with a separately
source-qualified current Form 172 loss. The shared mortgage validator must prove
personal use, retained ownership, original borrowing, basis, discharge and equal
regular/AMT exclusion treatment. Its taxable remainder enters nonbusiness income
once; the excluded amount reduces only residence basis. No insolvency or NOL
attribute packet is manufactured.

The [Form 172 line 7 instructions](https://www.irs.gov/instructions/i172) classify
ordinary income outside a trade or business as nonbusiness income. [Publication
4681](https://www.irs.gov/publications/p4681) places taxable personal mortgage debt
on Schedule 1 line 8c and applies residence basis reduction to the excluded
amount. Both official pages were refreshed November 14. The new test values are
manual synthetic examples, not examples attributed to the IRS.

With a 100,000 active business loss, no other income and 50,000 taxable personal
mortgage debt, AGI is -50,000. The 15,750 standard deduction is within nonbusiness
income, producing a 65,750 regular NOL; the independent AMT NOL is 50,000. With
fully excluded debt, both loss origins remain 100,000 and residence basis alone
falls from 300,000 to 200,000. Exact subcent examples retain source precision
through the nonbusiness deduction limit before reporting whole-dollar totals.

The spec and same-test predecessor run precede implementation: two real public
calculator cases fail at the old missing-source guard, while the negative case
passes. The successor passes four focused and 76 adjacent tests across 19 files.
A pure `8e7fd9a2` archive with only these three files overlaid independently
passes those 76 tests, engine types, four spec references and scoped lint. It
excludes concurrent intake and education changes.

A separate reviewer reruns the four tests and six additional canonical controls.
Distinct 2017 and 2021 regular and AMT carry histories retain their original
amounts, current losses and once-only restoration; nonpersonal, competing,
unknown and duplicate statements reject. Inputs remain unchanged and the
investment-only loss origin stays zero.

Private evidence is under `nov14-form172-qpr`, with original RED/GREEN logs beside
that directory, and `nov14-form172-qpr-independent-review/REVIEW.json` (SHA-256
`b419c28fcb8cebd3411301c3e0de9bd211fea7000ae077b15b89be108ada8516`).
Professional review and final 2026 qualification remain open. Guided composition
retains its explicit guard until its own source and interaction checks pass.
This tax package remains local under the main push hold; earlier runtime and
combined results retain their exact source boundaries.
