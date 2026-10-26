import { actualGuidedK1Charity } from './guided-k1-charitable-sources';
/** Fictional actual source records; these are never interview defaults. */
export function actualGuidedK1CashDistribution(scorp = false) {
  const packet = actualGuidedK1Charity(), s = packet.statements?.[0];
  if (!s?.original?.form6198 || !s.basis || !s.atRisk || !s.receipts?.[0]) throw new Error('Missing fictional original');
  s.original.distributions = '31.00'; s.original.form6198.gainLossFromDispositions = '1.00';
  s.original.form6198.currentYearDecreases = '31.00'; s.atRisk.currentYearDecreases = '31.00';
  if (scorp) {
    Object.assign(s.original, { entityType: 's_corporation', beginningDebtBasis: '100', additionalLoansToScorp: '0', priorDebtBasisReduction: '0', election1367: false });
    s.basis.entityType = 's_corporation'; s.receipts[0].originalBox = '12';
  }
  s.cashDistribution = {
    sourceTaxYear: '2025', sourceReference: 'Fictional original cash distribution statement', sourceFactsConfirmed: true,
    originalBox: scorp ? '16' : '19', originalCode: scorp ? 'D' : 'A', cashAmount: '31.00', distributionDate: '2025-12-31', acquisitionDate: '2023-01-01',
    acquisitionMethod: 'cash_purchase', singleUnchangedBlockConfirmed: true, uniformPerShareBasisConfirmed: true,
    allAnnualDistributionsIncludedConfirmed: true, cashOnlyConfirmed: true, nonliquidatingConfirmed: true, noOtherReportingConfirmed: true,
    noSpecialHoldingOrGainElectionConfirmed: true, allIncomePrecedesDistributionConfirmed: true,
    activityCharacter: 'portfolio_investments_only', usIndividualTaxTreatmentConfirmed: true,
    sameSingleAtRiskActivityConfirmed: true, atRiskSourceReference: s.atRisk.sourceReference, atRiskGainItemSourceReference: 'Fictional original Form6198 gain item',
    noHotAssetExchangeConfirmed: true, noDisguisedSaleOrDebtPaymentConfirmed: true, noRetirementOrSuccessorPaymentConfirmed: true,
    noMarketableSecuritiesOrLiabilityMoneyConfirmed: true, notApplicablePartnershipInterestConfirmed: true,
    noAccumulatedEarningsAndProfitsConfirmed: true, noRedemptionOrDebtRepaymentConfirmed: true,
  };
  return packet;
}
