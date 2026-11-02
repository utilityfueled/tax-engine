/** Source-bound ordinary K-1 Form461 classification after actual loss limits.
 * Spec: spec/federal/k1-form461-classification.yaml.
 */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { YearConstants } from '@/models/constants.js';
import type { ScheduleEResult } from '@/engine/schedules/schedule-e.js';
import { calculateForm461 } from '@/engine/forms/form-461.js';
import { calculateK1OrdinaryPassiveSources } from '@/engine/forms/k1-ordinary-passive-sources.js';
import { d, roundDollar, sum } from '@/utils/decimal.js';

export function calculateK1Form461Classification(input: TaxYearInput, context: {
  scheduleE: ScheduleEResult;
  /** Actual federal ScheduleC net after all canonical adjustments. */
  scheduleCNetProfit?: Decimal;
  capitalGainOrLoss: Decimal;
  deductibleSETax: Decimal;
  seHealthInsurance: Decimal;
  seRetirementContributions: Decimal;
}, constants: YearConstants) {
  const source=input.qbiLossSources?.form461Classification;
  if(source===undefined) return undefined;
  if(source.sourceTaxYear!==input.taxpayer.taxYear||source.sourceTaxYear!==constants.taxYear
    ||!source.sourceReference?.trim()||source.sourceFactsConfirmed!==true
    ||(source.method!=='ordinary_k1_only'&&source.method!=='profitable_ordinary_c_and_k1')
    ||source.allNonEmployeeBusinessSourcesIncluded!==true||source.capitalIncomeIsNonbusiness!==true) {
    throw new Error('K1 Form461 classification requires actual current-year complete ordinary business and nonbusiness capital sources');
  }
  for(const key of ['otherBusinessIncome','otherBusinessDeductions'] as const) {
    if(typeof source[key]!=='string'||!/^\d+(\.\d+)?$/.test(source[key])||!d(source[key]).isZero()) {
      throw new Error('K1 Form461 ordinary classification requires explicit zero other business sources');
    }
  }
  const withC=source.method==='profitable_ordinary_c_and_k1';
  const c=input.scheduleC,proof=source.scheduleCSource;
  if(!withC&&proof!==undefined) throw new Error('K1-only classification cannot include a different ScheduleC source method');
  if(withC) {
    const person=proof?.accountHolder==='primary'?input.taxpayer.primary
      :proof?.accountHolder==='spouse'&&input.taxpayer.filingStatus==='married_filing_jointly'?input.taxpayer.spouse:undefined;
    const name=(value:string|undefined)=>value?.trim().replace(/\s+/g,' ').toLowerCase();
    const ein=(value:string|undefined)=>value?.replaceAll('-','').trim();
    if(!c||!proof||proof.sourceTaxYear!==input.taxpayer.taxYear||!proof.sourceReference?.trim()
      ||proof.sourceFactsConfirmed!==true||proof.allIncomeDomesticConfirmed!==true||proof.ordinaryBusinessOnlyConfirmed!==true
      ||proof.accountHolder!==c.accountHolder||!person||!/^\d{9}$/.test(person.ssn.replaceAll('-',''))
      ||!/^\d{4}$/.test(proof.recipientTaxpayerIdLast4??'')
      ||person.ssn.replaceAll('-','').slice(-4)!==proof.recipientTaxpayerIdLast4
      ||!proof.recipientName?.trim()||name(proof.recipientName)!==name(`${person.firstName} ${person.lastName}`)) {
      throw new Error('Profitable C/K1 classification requires actual current ordinary domestic ScheduleC owner identity and confirmed source proof');
    }
    const nameMatches=proof.businessNameStatus==='reported'
      ?Boolean(proof.businessName?.trim()&&c.businessName?.trim()&&proof.businessName.trim()===c.businessName.trim())
      :proof.businessNameStatus==='blank_original'&&!proof.businessName?.trim()&&!c.businessName?.trim();
    const einMatches=proof.businessEINStatus==='reported'
      ?/^\d{9}$/.test(ein(proof.businessEIN)??'')&&ein(proof.businessEIN)===ein(c.ein)
      :proof.businessEINStatus==='not_issued'&&!proof.businessEIN?.trim()&&!c.ein?.trim();
    if(!nameMatches||!einMatches) throw new Error('ScheduleC classification original business name or EIN status conflicts with actual source identity');
    if(!context.scheduleCNetProfit?.isFinite()||context.scheduleCNetProfit.lt(0)
      ||input.scheduleK1.some(row=>row.entityType!=='partnership'||d(row.ordinaryIncome).lt(0))
      ||input.form2555!==undefined) {
      throw new Error('Profitable ordinary C/K1 classification requires nonnegative canonical current domestic sources; foreign or loss compositions need their separate method');
    }
  }
  const cNet=withC?context.scheduleCNetProfit??d(0):d(0);
  if(input.form461) throw new Error('K1 Form461 calculated classification and a separate entered Form461 cannot be used simultaneously');
  if((input.scheduleC&&!withC)||input.scheduleF||input.form4797||(input.form8824?.length??0)>0||input.rentalProperties.length>0
    ||input.form1099Nec.some(row=>!d(row.nonemployeeCompensation).isZero())
    ||(input.scheduleK1Form1041?.length??0)>0||input.cryptoIncome?.isMiningBusiness||input.cryptoIncome?.isStakingBusiness
    ||input.cryptoIncome?.nftTransactions.some(row=>row.isBusiness)
    ||(input.priorYear?.suspendedBusinessInterest?.length??0)>0||(input.priorYear?.suspendedPTPLosses?.length??0)>0) {
    throw new Error('K1 Form461 ordinary-only classification requires a separate method for other business sources');
  }
  const {passive,scheduleESupplementalIncome,capital}=calculateK1OrdinaryPassiveSources(input,context.scheduleE);
  if(capital?.rows.some(row=>row.hasPassiveCapital)) {
    throw new Error('Actual passive business capital requires its separate Form461 classification; it cannot assert ordinary-only nonbusiness capital.');
  }
  if(withC&&(scheduleESupplementalIncome.lt(0)||context.scheduleE.totalNonpassiveLoss.lt(0))) {
    throw new Error('Profitable C/K1 classification requires nonnegative post-limitation ordinary partnership sources');
  }
  const deductions=sum(context.deductibleSETax,context.seHealthInsurance,context.seRetirementContributions);
  const form461=calculateForm461({
    totalWages:d(0),scheduleCNetProfit:cNet,scheduleFNetProfit:d(0),form4797OrdinaryGainOrLoss:d(0),
    nonpassiveK1Income:context.scheduleE.totalNonpassiveIncome,nonpassiveK1Loss:context.scheduleE.totalNonpassiveLoss,
    sourceFactsConfirmed:true,atRiskAndPassiveLimitationsApplied:true,
    capitalGainOrLoss:context.capitalGainOrLoss,tradeOrBusinessCapitalGainNetIncome:d(0),scheduleESupplementalIncome,
    noncapitalNonbusinessIncome:d(0),noncapitalNonbusinessLoss:d(0),
    noncapitalBusinessNet:roundDollar(cNet).plus(roundDollar(scheduleESupplementalIncome)).minus(roundDollar(deductions)),
    otherBusinessIncome:d(source.otherBusinessIncome),otherBusinessDeductions:d(source.otherBusinessDeductions),
    deductibleSETax:context.deductibleSETax,seHealthInsurance:context.seHealthInsurance,
    seRetirementContributions:context.seRetirementContributions,priorYearEBLNol:d(input.priorYear?.excessBusinessLossNOL),
  },input.taxpayer.filingStatus,constants);
  if(withC&&form461.applies) throw new Error('Current C/K1 excess-business-loss allocation requires its separate source method');
  return {passive,scheduleESupplementalIncome,form461};
}
