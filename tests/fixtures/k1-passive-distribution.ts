import { TaxYearInputSchema } from '@/models/inputs.js';
import { k1CashDistributionFixture, cashDistributionSource } from './k1-cash-distribution.js';
import { charitableStatement } from './k1-charitable-return.js';
import { k1QbiLossSourceInput } from './k1-qbi-loss-sources.js';
/** Fictional complete single ordinary activity, valuation report and prior469/QBI ledger. */
export function k1PassiveDistributionFixture(prior = '1500', scorp = false) {
  const input = k1CashDistributionFixture(2025, scorp), k = input.scheduleK1[0], c = charitableStatement(input), dist = cashDistributionSource(input);
  Object.assign(k, { isPassiveActivity:true, qbiMateriallyParticipated:false, section199AIsSST:false,
    section199AW2Wages:'0', section199AUBIA:'0', beginningDebtBasis:'0', additionalLoansToScorp:'0', priorDebtBasisReduction:'0',
    charitableCash:'1', charitableCapitalGain30:'0', distributions:'1030' });
  Object.assign(c.basis!.currentContributions![0], {category:'cash_60', contributionShare:'1', adjustedBasisShare:'1'});
  Object.assign(c.receipts![0], {originalCode:'A'});
  Object.assign(dist, {cashAmount:'1030', activityCharacter:'single_passive_business'});
  Object.assign(k.form6198!, {gainLossFromDispositions:'1000',currentYearDecreases:'1030'});
  c.atRisk!.currentYearDecreases='1030';
  dist.passiveActivity = {
    sourceTaxYear:2025,sourceReference:'Fictional complete entity activity and valuation report',sourceFactsConfirmed:true,
    activityName:k.partnershipName,allActivitiesAndAssetsIncludedConfirmed:true,continuingActivityConfirmed:true,
    noMaterialParticipationTestMetConfirmed:true,combinedParticipationHours:'0',noTieredOrSpecialAllocationConfirmed:true,
    entitySelectedValuationDate:'distribution_date',valuationDate:'2025-12-31',allPreDistributionEventsIncludedConfirmed:true,
    beginningHolderInterestValue:'10000',appreciatedContributionsFmv:'0',depreciatedContributionsBasis:'0',
    activityEvents:[{sourceId:'activity-1',sourceReference:'Fictional complete annual activity event report',activityName:k.partnershipName,
      beginningActivityValue:'100000',activityInterestDisposedValue:'0',beginningPropertyValue:'100000',propertyDisposedValue:'0'}],
    assets:[{sourceId:'asset-1',sourceReference:'Fictional original business asset valuation',
      character:'ordinary_business_property',fairMarketValue:'100000',adjustedBasis:'60000',ownerBasisAdjustment:'0',
      acquiredDate:'2020-01-01',continuousPassiveUseConfirmed:true,noNonpassiveRecharacterizationConfirmed:true,noRecaptureOrSpecialCapitalGainConfirmed:true}],
  };
  const q = k1QbiLossSourceInput().qbiLossSources!;
  const a=q.activities![0];
  Object.assign(a, {entityName:k.partnershipName,entityEIN:k.partnershipEIN,entityType:k.entityType,recipientName:'Jane Doe',priorPassiveLoss:prior});
  Object.assign(a.statement!,{ordinaryIncome:'0',section199AQBI:'0',isPassiveActivity:true,qbiMateriallyParticipated:false});
  a.basis!.beginningBasis='30';
  Object.assign(a.atRisk!,{priorYearAmountAtRisk:'20000',currentYearDecreases:'1030'});
  input.qbiLossSources=q;
  input.priorYear={...input.priorYear,suspendedPassiveLosses:[{partnershipName:k.partnershipName,amount:prior,qbiLossTracking:{
    sourceTaxYear:2024,sourceReference:'Fictional preceding filed passive and QBI history',sourceFactsConfirmed:true,
    vintages:prior==='0'?[]:[{taxYear:2024,originalLoss:prior,qualifiedOriginalLoss:prior,remainingLoss:prior,qualifiedRemainingLoss:prior,materiallyParticipatedInCurrentYear:false}],
  }}]};
  return TaxYearInputSchema.parse(input);
}
export function passiveDistributionSource(input: ReturnType<typeof k1PassiveDistributionFixture>) {
  const source=cashDistributionSource(input).passiveActivity;
  if(!source) throw new Error('Missing fictional passive valuation source');
  return source;
}
