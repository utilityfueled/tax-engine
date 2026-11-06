import type { NetOperatingLossData } from '@/lib/guided-net-operating-loss';
export const actualGuidedNolSources: NetOperatingLossData = {
  sourceTaxYear: '2025', sourceReference: 'Actual filed regular carry packet', sourceFactsConfirmed: true,
  allCarryoversIncluded: true, calendarYearTaxpayer: true, returnMembership: 'continuous_individual', membershipUnchangedConfirmed: true,
  primaryName: 'Jordan Example', primaryTaxpayerIdLast4: '3333',
  vintages: [{ sourceId: 'regular2021', lossTaxYear: '2021', sourceReference: 'Original filed 2021 NOL worksheet', originKind: 'individual_nol',
    originalLoss: '60000', openingCarryforward: '54000', carrybackTreatment: 'not_required', adjustedThroughTaxYear: '2024',
    historySourceReference: 'Actual filed uses and reductions through 2024', allHistoryIncluded: true, farmingLossIncluded: false,
    history: [{ taxYear: '2022', nolUsed: '5000', attributeReduction: '1000', sourceReference: 'Actual 2022 use and attribute reduction' }], section1411OriginalLoss: '18000' }],
  alternativeTax: { sourceReference: 'Independent actual AMT worksheets', sourceFactsConfirmed: true, allCarryoversIncluded: true,
    specialDisasterCarryIncluded: false, currentYearAdjustmentsCompleteConfirmed: true, regularBasisAndLossLimitsSameAsAlternativeConfirmed: true,
    vintages: [{ sourceId: 'amt2021', lossTaxYear: '2021', sourceReference: 'Original filed AMT loss worksheet', originKind: 'individual_nol',
      originalLoss: '40000', openingCarryforward: '40000', carrybackTreatment: 'not_required', adjustedThroughTaxYear: '2024',
      historySourceReference: 'Actual no prior AMT use or reduction worksheet', allHistoryIncluded: true, farmingLossIncluded: false, history: [] }] },
};
