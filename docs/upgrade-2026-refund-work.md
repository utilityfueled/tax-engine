# Actual state and local income-tax refunds

## Sales-election prerequisite

The existing refund worksheet now retains an optional actual prior Schedule A
income-versus-sales-tax election. When an itemizer actually elected general
sales taxes, an income-tax refund has no taxable transfer. The original refund
and itemization facts remain unchanged. Missing historical election stays
missing; this adds no default election and does not change the existing
alternative-sales-tax limitation for income-tax itemizers.

Source refreshed October 25, 2026:
[IRS Form 1040 instructions, Schedule 1 line 1](https://www.irs.gov/instructions/i1040gi).
The instructions expressly exclude a refund when the taxpayer elected general
sales taxes instead of income taxes. [Publication 525](https://www.irs.gov/publications/p525)
continues to govern recovery source years and special tax-benefit methods.

Spec-first tests reproduced both the discarded election and the incorrect
positive canonical income. The corrected six-file source/canonical/PDF cohort
passes 101 cases. Exact isolated tree `bfb41a2` passes the same 101 cases, root
types and all 4,718 spec references. Parent independently reran the three new
cases and reviewed the source/schema/order with no actionable finding
(`parent-refund-sales-review.log`). This is bounded agent review, not human tax
qualification. Metadata version 2025.77 / 2026.73 preserves the existing qualification
and filing gates.

## Guided collection in progress

The next separate slice collects original Form 1099-G Box 2/3 and the actual
paid/deducted year, a matched historical return and the ordinary tax-benefit
worksheet. It will preserve known zero versus missing sources and reject
unsupported mixed-year, joint-ownership-change and special tax-benefit methods.
Neither this prerequisite nor source collection qualifies a return for filing.
