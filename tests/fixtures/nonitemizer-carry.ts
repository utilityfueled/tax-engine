import { TaxYearInputSchema } from '@/models/inputs.js';
import { nonitemizedCharityFixture } from './nonitemized-charity.js';

/** Fictional complete source records, including actual zero intervening use. */
export function nonitemizerCarryFixture(current = '9000', entries: { taxYear: number; amount: string }[] = []) {
  const input = nonitemizedCharityFixture();
  input.w2s[0].wages = '10000'; input.w2s[0].federalWithheld = '1000'; input.donations[0].amount = current;
  return TaxYearInputSchema.parse({ ...input, charitableCarryoverSources: {
    sourceTaxYear: 2026, sourceReference: 'Synthetic completed cash history', sourceFactsConfirmed: true,
    allCarryoversIncluded: true, calendarYearTaxpayer: true, returnMembership: 'continuous_individual',
    membershipUnchangedConfirmed: true, primaryName: 'Jane Doe', primaryTaxpayerIdLast4: '6789',
    vintages: entries.map(row => ({ sourceId: `actual-cash-${row.taxYear}`, contributionYear: row.taxYear,
      category: 'cash_60', medium: 'cash', sourceReference: 'Synthetic original percentage worksheet',
      originalExcess: row.amount, originNolReduction: '0', openingCarryforward: row.amount,
      adjustedThroughTaxYear: 2025, allHistoryIncluded: true, ordinaryPercentageMethodConfirmed: true,
      history: Array.from({ length: 2025 - row.taxYear }, (_, i) => ({ taxYear: row.taxYear + i + 1,
        treatedAsPaid: '0', nolReduction: '0', sourceReference: 'Synthetic intervening return with actual zero use' })),
    })),
  } });
}
