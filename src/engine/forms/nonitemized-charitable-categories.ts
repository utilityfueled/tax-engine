/** Actual selected ordinary category ledger. Spec: nonitemized-charitable-categories.yaml. */
import type Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CharitableContributionWorksheetInput } from './charitable-contribution-worksheet.js';
import type { CharitableCarryoverResult } from './charitable-carryover.js';
import type { CharitableCategoryUseResult } from './charitable-category-use.js';
import { calculateCharitableDeterminedFloor } from './charitable-determined-floor.js';
import { d } from '@/utils/decimal.js';
import type { CharitableNolOriginLimit } from '@/utils/charitable-nol-origins.js';

export interface NonitemizedCharitableCategoriesResult extends CharitableCarryoverResult, CharitableCategoryUseResult {
  method: '2026_nonitemized_ordinary_categories';
  deductionMethod: 'standard' | 'nonitemized';
}

/** Actual nonitemization uses the same otherwise-allowable original ledger including a proven current floor. */
export function calculateNonitemizedCharitableCategories(input: TaxYearInput, context: {
  contributionBase: Decimal; current: CharitableContributionWorksheetInput['amounts'];
  nolOriginLimit?: CharitableNolOriginLimit;
}): NonitemizedCharitableCategoriesResult {
  if (input.deductionElection !== 'standard' && input.deductionElection !== 'nonitemized') {
    throw new Error('Nonitemized ordinary category carry requires an explicit standard or nonitemized selection');
  }
  const use = calculateCharitableDeterminedFloor(input, context), zero = d('0');
  return { method: '2026_nonitemized_ordinary_categories', deductionMethod: input.deductionElection,
    contributionBase: use.contributionBase, currentCashPaid: use.currentCashPaid,
    currentReceiptAmounts: use.currentReceiptAmounts, currentWithinPercentageLimit: use.currentWithinPercentageLimit,
    priorTreatedAsPaid: use.priorTreatedAsPaid, carryforwards: use.carryforwards, expired: use.expired, lines: use.lines,
    currentCash: zero, currentNoncash: zero, priorDeduction: zero, priorCashDeduction: zero, priorNoncashDeduction: zero,
    detail: use.detail.map(row => ({ ...row, amountUsed: zero })), totalDeduction: zero };
}
