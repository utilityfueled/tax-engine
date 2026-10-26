import { currentOriginInput } from './form-172-origin.js';
import { singleCategoryCharitableNolInput, type SingleCharitableCategory } from './charitable-single-category-nol.js';

/** Complete fictional original sources; no computed deduction is an input. */
export function currentCharitableOriginInput(category: 'G' | SingleCharitableCategory = 'G', year = 2025) {
  const source = singleCategoryCharitableNolInput(category === 'G' ? 'B-cash' : category, year);
  const gift = source.donations[0];
  if (!gift) throw new Error('Missing fictional actual gift');
  gift.amount = '20000';
  if (category === 'G') gift.recipientCategory = 'fifty-percent';
  if (category === 'A') gift.costBasis = '4000';
  const input = currentOriginInput('40000', {
    form1099Int: [{ payer: 'Synthetic current-origin bank', interestIncome: '30000', federalWithheld: '0' }],
    scheduleA: { realEstateTaxes: '20000' }, donations: [gift], deductionElection: 'itemized',
    charitableCarryoverSources: source.charitableCarryoverSources,
  });
  const alternative = input.netOperatingLoss?.alternativeTax;
  if (!alternative) throw new Error('Missing fictional independent AMT records');
  alternative.charitableCarryoverHistory = source.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory;
  if (!input.form172 || !input.netOperatingLoss) throw new Error('Missing fictional current-origin packet');
  input.taxpayer.taxYear = year;
  input.form172.sourceTaxYear = year;
  input.netOperatingLoss.sourceTaxYear = year;
  if (year === 2026) {
    for (const wages of input.w2s) {
      wages.accountHolder = 'primary';
      wages.socialSecurityWages = wages.wages;
      wages.socialSecurityTips = '0';
    }
  }
  return input;
}
