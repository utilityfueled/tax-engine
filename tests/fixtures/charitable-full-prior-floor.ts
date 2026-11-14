import type { TaxYearInput } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { nonitemizedCategoryFixture, nonitemizedCategoryContext } from './nonitemized-charitable-categories.js';

/** Fictional completed original receipts and filed worksheets; not calculated current-use inputs. */
export function fullPriorFloorFixture(first = '200', second = '300', currentCash = '0',
  election: TaxYearInput['deductionElection'] = 'itemized'): TaxYearInput {
  const input = nonitemizedCategoryFixture(currentCash, '0', '0', '0', '0', [
    { taxYear: 2024, category: 'capital_gain_30', amount: first },
    { taxYear: 2025, category: 'capital_gain_30', amount: second },
  ]);
  input.deductionElection = election;
  if (!input.charitableCarryoverSources || !input.standardDeductionFacts) throw Error('Missing fictional complete sources');
  input.charitableCarryoverSources.sourceReference = 'Fictional completed ordinary public-stock original worksheets and actual annual histories, same owner, no NOL or other gifts';
  for (const row of input.charitableCarryoverSources.vintages ?? []) {
    row.sourceReference = `Fictional${row.contributionYear} long-term public investment-stock receipt${d(row.originalExcess).plus('30000').toFixed()}/basis10000 and ordinary filed worksheet, base100000, allowed30000, excess${row.originalExcess}, no special election or NOL`;
  }
  input.taxpayer.filingStatus = 'single';
  input.standardDeductionFacts.spouseItemizes = false;
  if (election === 'nonitemized') {
    input.taxpayer.filingStatus = 'married_filing_separately';
    input.standardDeductionFacts.spouseItemizes = true;
  }
  return input;
}
export function fullPriorFloorContext(currentCash = '0') {
  return nonitemizedCategoryContext(currentCash, '0', '0', '0', '0');
}
