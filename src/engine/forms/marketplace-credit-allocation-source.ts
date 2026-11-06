/** Actual taxpayer method choice; marketplace-business-credit-method.yaml. */
import type { TaxYearInput } from '@/models/inputs.js';

export function readMarketplaceCreditAllocationSource(input: {
  form7206?: TaxYearInput['form7206']; taxpayer: Pick<TaxYearInput['taxpayer'], 'taxYear'>;
}) {
  const choice = input.form7206?.marketplaceCreditAllocation;
  if (choice === undefined) return undefined;
  if (![2025, 2026].includes(input.taxpayer.taxYear) || choice.sourceTaxYear !== input.taxpayer.taxYear
    || !choice.sourceReference?.trim() || choice.sourceFactsConfirmed !== true
    || choice.sameMethodForAllCalculationsConfirmed !== true || choice.method !== 'monthly_eligible_plan_enrollment') {
    throw new Error('Pub974 credit allocation requires the actual current-year method choice, source reference and consistent-use confirmation.');
  }
  return choice.method;
}
