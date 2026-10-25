import type { CharitableCarryoverData } from '@/lib/guided-charitable-carryover';

/** Complete fictional records for tests. Application controls start unknown. */
export function actualGuidedCharitableCarryover(): CharitableCarryoverData {
  return {
    sourceTaxYear: '2025', sourceReference: 'Actual filed charitable packet', sourceFactsConfirmed: true,
    allCarryoversIncluded: true, calendarYearTaxpayer: true, returnMembership: 'continuous_individual', membershipUnchangedConfirmed: true,
    primaryName: 'Jordan Example', primaryTaxpayerIdLast4: '3333',
    vintages: [{ sourceId: 'Original charitable source-A', contributionYear: '2023', sourceReference: 'Actual 2023 contribution worksheet',
      category: 'cash_60', medium: 'cash', originalExcess: '72000', originNolReduction: '500', openingCarryforward: '70000',
      adjustedThroughTaxYear: '2024', allHistoryIncluded: true, ordinaryPercentageMethodConfirmed: true,
      history: [{ taxYear: '2024', treatedAsPaid: '1400', nolReduction: '100', sourceReference: 'Actual 2024 return and carry worksheet' }],
    }],
  };
}
