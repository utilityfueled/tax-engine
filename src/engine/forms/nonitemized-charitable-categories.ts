/** Actual selected ordinary category ledger. Spec: nonitemized-charitable-categories.yaml. */
import type Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CharitableContributionWorksheetInput } from './charitable-contribution-worksheet.js';
import type { CharitableCarryoverResult } from './charitable-carryover.js';
import { calculateCharitableCategoryUse, type CharitableCategoryUseResult } from './charitable-category-use.js';
import { d } from '@/utils/decimal.js';

export interface NonitemizedCharitableCategoriesResult extends CharitableCarryoverResult, CharitableCategoryUseResult {
  method: '2026_nonitemized_ordinary_categories';
  deductionMethod: 'standard' | 'nonitemized';
}

/** Actual nonitemization uses the same original percentage ledger without the itemized floor. */
export function calculateNonitemizedCharitableCategories(input: TaxYearInput, context: {
  contributionBase: Decimal; current: CharitableContributionWorksheetInput['amounts'];
}): NonitemizedCharitableCategoriesResult {
  if (input.deductionElection !== 'standard' && input.deductionElection !== 'nonitemized') {
    throw new Error('Nonitemized ordinary category carry requires an explicit standard or nonitemized selection');
  }
  const use = calculateCharitableCategoryUse(input, context), zero = d('0');
  return { ...use, method: '2026_nonitemized_ordinary_categories', deductionMethod: input.deductionElection,
    currentCash: zero, currentNoncash: zero, priorDeduction: zero, priorCashDeduction: zero, priorNoncashDeduction: zero,
    totalDeduction: zero };
}
