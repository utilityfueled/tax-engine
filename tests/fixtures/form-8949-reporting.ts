import type { CapitalTransaction, TaxYearInput } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';

type ReportedTransaction = CapitalTransaction & { sourceDocumentType: '1099-b' | '1099-da' | 'not-reported' };

/** Literal controls derived from original form boxes, not engine output. */
export function reportingCategoriesInput(overflow = false): TaxYearInput {
  const definitions = [
    ['A', 'short', '1099-b', true, false, '100.10', '80.05', '0'],
    ['B', 'short', '1099-b', false, false, '200.20', '230.30', '5.05'],
    ['C', 'short', 'not-reported', false, false, '300.30', '100.10', '0'],
    ['G', 'short', '1099-da', true, true, '400.40', '300.20', '0'],
    ['H', 'short', '1099-da', false, true, '500.50', '600.60', '0'],
    ['I', 'short', 'not-reported', false, true, '600.60', '500.50', '0'],
    ['D', 'long', '1099-b', true, false, '1000.10', '800.05', '0'],
    ['E', 'long', '1099-b', false, false, '2000.20', '2300.30', '50.05'],
    ['F', 'long', 'not-reported', false, false, '3000.30', '1000.10', '0'],
    ['J', 'long', '1099-da', true, true, '4000.40', '3000.20', '0'],
    ['K', 'long', '1099-da', false, true, '5000.50', '6000.60', '0'],
    ['L', 'long', 'not-reported', false, true, '6000.60', '5000.50', '0'],
  ] as const;
  const transactions: ReportedTransaction[] = definitions.map(([box, holdingPeriod, sourceDocumentType, basisReportedToIRS, digitalAsset, proceeds, costBasis, adjustments]) => ({
    description: `Original ${box} disposition`, holdingPeriod, sourceDocumentType, basisReportedToIRS, digitalAsset,
    proceeds, costBasis, adjustments, dateAcquired: holdingPeriod === 'short' ? '2025-01-02' : '2023-01-02',
    dateSold: '2025-06-30', washSale: false, washSaleDisallowed: '0',
  }));
  if (overflow) {
    const original = transactions.find(row => row.description === 'Original G disposition');
    if (!original) throw new Error('Missing literal G fixture');
    for (let row = 2; row <= 12; row++) transactions.push({ ...original, description: `Original G disposition ${row}` });
  }
  return { ...structuredClone(simpleW2Fixture), form1099B: [{ broker: 'Synthetic original normalized sources', transactions }] };
}
