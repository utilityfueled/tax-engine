import type { CharitableCategory } from '@/engine/forms/charitable-contribution-worksheet.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { currentCategoryFixture, currentCategoryContext } from './current-charitable-categories.js';
export { currentCategoryContext as nonitemizedCategoryContext };
type Prior = { taxYear: number; category: CharitableCategory; amount: string; medium?: 'cash' | 'noncash' };
/** Fictional completed receipts and original annual histories, never inferred source defaults. */
export function attachCategoryHistory(input: TaxYearInput, entries: Prior[]): TaxYearInput {
  if (!input.charitableCarryoverSources) throw Error('Missing synthetic complete history packet');
  input.charitableCarryoverSources.vintages = entries.map((row, index) => ({
    sourceId: `synthetic-vintage-${index + 1}`, contributionYear: row.taxYear, category: row.category,
    medium: row.medium ?? (row.category === 'cash_60' || row.category === 'other_30' ? 'cash' : 'noncash'),
    sourceReference: 'Synthetic completed original worksheet', originalExcess: row.amount,
    originNolReduction: '0', openingCarryforward: row.amount, adjustedThroughTaxYear: 2025,
    allHistoryIncluded: true, ordinaryPercentageMethodConfirmed: true,
    history: Array.from({ length: 2025 - row.taxYear }, (_, i) => ({ taxYear: row.taxYear + i + 1,
      treatedAsPaid: '0', nolReduction: '0', sourceReference: 'Synthetic intervening return: actual zero use' })),
  }));
  return input;
}
export function nonitemizedCategoryFixture(g='10000', a='5000', b='10000', c='20000', other='15000', entries: Prior[] = [
  { taxYear: 2025, category: 'cash_60', amount: '10000' },
  { taxYear: 2024, category: 'noncash_50', amount: '5000' },
  { taxYear: 2023, category: 'capital_gain_30', amount: '10000' },
  { taxYear: 2025, category: 'other_30', amount: '10000' },
  { taxYear: 2022, category: 'capital_gain_20', amount: '8000' },
]) {
  const input = attachCategoryHistory(currentCategoryFixture(g,a,b,c,other),entries);
  input.w2s[0].wages='100000'; input.w2s[0].federalWithheld='30000';
  return input;
}
