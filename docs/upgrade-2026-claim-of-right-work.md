# Repaid earlier-year income

Repaying unemployment compensation that was taxed in an earlier year was rejected. This package applies Publication 525 to Form 1099-G repayments.

## Rule

A repayment of $3,000 or less is not deductible. Above that, the return runs both methods and keeps the lower tax: a Schedule A line 16 deduction, or a Schedule 3 line 13b credit equal to the earlier tax shown less that tax refigured without the repaid income. A tie uses the deduction.

## Limits

- The earlier-return figures are entered. The engine does not recalculate an earlier year.
- The $3,000 test uses the total repaid on the return, and rows from one earlier year must share one set of figures.
- Marketplace worksheets, Schedule AI, Form 8814 and state paths reject.
- Only Form 1099-G repayments are covered. Repaid wages, Social Security and other repayments are separate.
- The comparison uses refund less amount owed. IRC 1341 speaks of tax imposed, so a human reviewer should confirm that measure.
- Form 2210 line 3 includes this credit.
- The internal comparison stage uses a symbol-keyed field, so parsed original data cannot set it.

## Checks

Spec and hand-derived values came first: base tax 16,914, Method 1 tax 15,820, and credit results on both sides of the choice. The first run failed on a fixture revision value, not on tax logic. This is not human tax qualification.

## Independent review

A separate agent found the first version tested $3,000 per row, against Pub 525's caution, so two $2,000 repayments lost a $1,200 credit. It also found the comparison could miss the Additional Child Tax Credit, Form 2210 left out the credit, and Illinois attachment did not stop. All are corrected. Report: `.local/upgrade-evidence/ai-final-review/report.md`. These corrections have not had their own re-review.
