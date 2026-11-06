import type { TaxYearInput } from '@/models/inputs.js';
import { nonitemizedCategoryFixture, nonitemizedCategoryContext } from './nonitemized-charitable-categories.js';

/** Fictional original receipt and completed original-year worksheet, not current use inputs. */
export const priorFloorOriginal = {
  sourceId: 'public-stock-2025-original', contributionYear: 2025,
  receipt: { donated: '2025-06-03', acquired: '2020-01-02', fairMarketValue: '35000', adjustedBasis: '10000',
    recipient: 'Public charity', category: 'capital_gain_30', longTermCapitalGain: true, specialElection: false },
  originalContributionBase: '100000', originalOtherContributions: '0',
  completedOriginalWorksheet: { deduction: '30000', excess: '5000', nolReduction: '0' },
} as const;

export function priorFloorNoExcessFixture(capitalOther = '0', election: TaxYearInput['deductionElection'] = 'itemized'): TaxYearInput {
  const input = nonitemizedCategoryFixture('10000', '0', '0', '0', capitalOther, [
    { taxYear: 2025, category: 'capital_gain_30', amount: '5000' },
  ]);
  input.taxpayer.filingStatus = election === 'nonitemized' ? 'married_filing_separately' : 'single';
  input.deductionElection = election;
  if (!input.standardDeductionFacts || !input.charitableCarryoverSources?.vintages?.[0]) {
    throw new Error('Missing synthetic actual entitlement or original history');
  }
  input.standardDeductionFacts.spouseItemizes = election === 'nonitemized';
  const source = input.charitableCarryoverSources.vintages[0];
  source.sourceId = priorFloorOriginal.sourceId;
  source.sourceReference = 'Fictional 2025 public-stock receipt35000/basis10000 and filed ordinary worksheet: base100000, deductible30000, excess5000; same individual and filing status';
  input.charitableCarryoverSources.sourceReference = 'Fictional complete original and annual history; no other prior gifts, NOL reductions, special elections or ownership changes';
  // Each positive current property source is an actual long-term investment-stock receipt.
  input.donations[4].costBasis = capitalOther === '0' ? '0' : '100';
  return input;
}

export function priorFloorNoExcessContext(capitalOther = '0') {
  return nonitemizedCategoryContext('10000', '0', '0', '0', capitalOther);
}
