import { charitableNolInput } from './charitable-nol.js';
import { alternativeCharitableNolInput } from './alternative-charitable-nol.js';
import { syntheticPublicCashHistory } from './charitable-carryover.js';

export type SingleCharitableCategory = 'A' | 'B-cash' | 'B-property' | 'C' | 'D';
export function singleCategoryCharitableNolInput(category: SingleCharitableCategory = 'C', year = 2025, alternativeOnly = false) {
  const input = alternativeOnly ? alternativeCharitableNolInput(year) : charitableNolInput('100000', '60000', year);
  const alternative = input.netOperatingLoss?.alternativeTax;
  if (!alternative) throw new Error('Missing synthetic independent loss facts');
  alternative.charitableCarryoverHistory = {
    sourceTaxYear: year - 1, sourceReference: 'Synthetic separate regular and AMT charity records',
    sourceFactsConfirmed: true, allCarryoversIncluded: true, priorRegularCarryovers: [], priorAlternativeCarryovers: [],
  };
  input.charitableCarryoverSources = { ...syntheticPublicCashHistory([]), sourceTaxYear: year };
  const donation = input.donations[0];
  donation.organization = 'Synthetic actual single-category recipient';
  donation.recipientCategory = category.startsWith('B') || category === 'D' ? 'other-thirty-percent' : 'fifty-percent';
  donation.isPrivateFoundation = undefined;
  if (category !== 'B-cash') {
    donation.type = category === 'C' || category === 'D' ? 'appreciated_stock' : 'property';
    donation.isLongTermCapitalGain = category === 'C' || category === 'D';
    donation.costBasis = category === 'C' || category === 'D' ? '20000' : '60000';
  }
  input.deductionElection = 'itemized';
  return input;
}
