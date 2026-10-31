# Repaid earlier-year income

Repaying unemployment compensation that was taxed in an earlier year was rejected. This package applies Publication 525 to Form 1099-G repayments.

## Rule

A repayment of $3,000 or less is not deductible. Above that, the return runs both methods and keeps the lower tax: a Schedule A line 16 deduction, or a Schedule 3 line 13b credit equal to the earlier tax shown less that tax refigured without the repaid income. A tie uses the deduction.

## Limits

- The earlier-return figures are entered. The engine does not recalculate an earlier year.
- Each repayment row is tested against $3,000 alone.
- Marketplace worksheets and all state paths reject.
- Only Form 1099-G repayments are covered. Repaid wages, Social Security and other repayments are separate.
- Whether Form 2210 refundable credits include this credit was not confirmed. The comparison assumes they do not.
- The internal comparison stage uses a symbol-keyed field, so parsed original data cannot set it.

## Checks

Spec and hand-derived values came first: base tax 16,914, Method 1 tax 15,820, and credit results on both sides of the choice. The first run failed on a fixture revision value, not on tax logic. This is not human tax qualification.
