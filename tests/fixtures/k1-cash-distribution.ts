import { TaxYearInputSchema } from '@/models/inputs.js';
import { k1CharitableReturnFixture, charitableStatement } from './k1-charitable-return.js';
/** Entirely fictional original investment-only entity and cash distribution. */
export function k1CashDistributionFixture(year = 2025, scorp = false) {
  const input = k1CharitableReturnFixture(year), k1 = input.scheduleK1[0], source = charitableStatement(input);
  k1.distributions = '31';
  k1.form6198!.gainLossFromDispositions = '1';
  if (scorp) {
    k1.entityType = 's_corporation';
    k1.beginningDebtBasis = '100'; k1.additionalLoansToScorp = '0'; k1.priorDebtBasisReduction = '0';
    source.basis!.entityType = 's_corporation'; source.receipts![0].originalBox = '12';
  }
  source.cashDistribution = {
    sourceTaxYear: year, sourceReference: 'Fictional actual annual cash distribution attachment', sourceFactsConfirmed: true,
    originalBox: scorp ? '16' : '19', originalCode: scorp ? 'D' : 'A', cashAmount: '31', distributionDate: `${year}-12-31`, acquisitionDate: `${year - 2}-01-01`,
    acquisitionMethod: 'cash_purchase', singleUnchangedBlockConfirmed: true, uniformPerShareBasisConfirmed: true,
    allAnnualDistributionsIncludedConfirmed: true, cashOnlyConfirmed: true, nonliquidatingConfirmed: true, noOtherReportingConfirmed: true,
    noSpecialHoldingOrGainElectionConfirmed: true, allIncomePrecedesDistributionConfirmed: true,
    activityCharacter: 'portfolio_investments_only', usIndividualTaxTreatmentConfirmed: true,
    sameSingleAtRiskActivityConfirmed: true, atRiskSourceReference: source.atRisk!.sourceReference,
    atRiskGainItemSourceReference: 'Fictional original same-activity gain item statement',
    noHotAssetExchangeConfirmed: true, noDisguisedSaleOrDebtPaymentConfirmed: true, noRetirementOrSuccessorPaymentConfirmed: true,
    noMarketableSecuritiesOrLiabilityMoneyConfirmed: true, notApplicablePartnershipInterestConfirmed: true,
    noAccumulatedEarningsAndProfitsConfirmed: true, noRedemptionOrDebtRepaymentConfirmed: true,
  };
  // Original complete amount-at-risk record includes the actual distribution.
  k1.form6198!.currentYearDecreases = '31'; source.atRisk!.currentYearDecreases = '31';
  return TaxYearInputSchema.parse(input);
}
export function cashDistributionSource(input: ReturnType<typeof k1CashDistributionFixture>) {
  const source = charitableStatement(input).cashDistribution;
  if (!source) throw Error('Missing fictional distribution attachment');
  return source;
}
