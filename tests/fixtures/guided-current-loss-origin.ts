import type { CurrentLossOriginData } from '@/lib/guided-current-loss-origin';

/** Explicit fictional evidence for tests only; application controls start blank. */
export const actualCurrentLossOrigin: CurrentLossOriginData = {
  sourceTaxYear: '2025', sourceReference: 'Actual current-year income and expense packet', sourceFactsConfirmed: true,
  allCurrentYearSourcesIncluded: true, farmingLossIncluded: false, cancelledDebtIncluded: false, estateOrTrustLossIncluded: false,
  businessSources: [{ sourceId: 'scheduleC', accountHolder: 'primary', businessName: 'Actual active sole proprietorship',
    sourceReference: 'Actual current participation and at-risk records', sourceFactsConfirmed: true,
    materiallyParticipated: true, allInvestmentAtRisk: true, financialTradingBusiness: false }],
  alternativeTax: { sourceReference: 'Independent current AMT basis and depreciation worksheet', sourceFactsConfirmed: true,
    currentYearAdjustmentsCompleteConfirmed: true, regularBasisAndLossLimitsSameAsAlternativeConfirmed: true,
    regularDepreciationSameAsAlternativeConfirmed: true },
};
