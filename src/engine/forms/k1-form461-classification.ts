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
  capitalGainOrLoss: Decimal;
  deductibleSETax: Decimal;
  seHealthInsurance: Decimal;
  seRetirementContributions: Decimal;
}, constants: YearConstants) {
  const source=input.qbiLossSources?.form461Classification;
  if(source===undefined) return undefined;
  if(source.sourceTaxYear!==input.taxpayer.taxYear||source.sourceTaxYear!==constants.taxYear
    ||!source.sourceReference?.trim()||source.sourceFactsConfirmed!==true||source.method!=='ordinary_k1_only'
    ||source.allNonEmployeeBusinessSourcesIncluded!==true||source.capitalIncomeIsNonbusiness!==true) {
    throw new Error('K1 Form461 classification requires actual current-year complete ordinary business and nonbusiness capital sources');
  }
  for(const key of ['otherBusinessIncome','otherBusinessDeductions'] as const) {
    if(typeof source[key]!=='string'||!/^\d+(\.\d+)?$/.test(source[key])||!d(source[key]).isZero()) {
      throw new Error('K1 Form461 ordinary classification requires explicit zero other business sources');
    }
  }
  if(input.form461) throw new Error('K1 Form461 calculated classification and a separate entered Form461 cannot be used simultaneously');
  if(input.scheduleC||input.scheduleF||input.form4797||(input.form8824?.length??0)>0||input.rentalProperties.length>0
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
  const deductions=sum(context.deductibleSETax,context.seHealthInsurance,context.seRetirementContributions);
  const form461=calculateForm461({
    totalWages:d(0),scheduleCNetProfit:d(0),scheduleFNetProfit:d(0),form4797OrdinaryGainOrLoss:d(0),
    nonpassiveK1Income:context.scheduleE.totalNonpassiveIncome,nonpassiveK1Loss:context.scheduleE.totalNonpassiveLoss,
    sourceFactsConfirmed:true,atRiskAndPassiveLimitationsApplied:true,
    capitalGainOrLoss:context.capitalGainOrLoss,tradeOrBusinessCapitalGainNetIncome:d(0),scheduleESupplementalIncome,
    noncapitalNonbusinessIncome:d(0),noncapitalNonbusinessLoss:d(0),
    noncapitalBusinessNet:roundDollar(scheduleESupplementalIncome).minus(roundDollar(deductions)),
    otherBusinessIncome:d(source.otherBusinessIncome),otherBusinessDeductions:d(source.otherBusinessDeductions),
    deductibleSETax:context.deductibleSETax,seHealthInsurance:context.seHealthInsurance,
    seRetirementContributions:context.seRetirementContributions,priorYearEBLNol:d(input.priorYear?.excessBusinessLossNOL),
  },input.taxpayer.filingStatus,constants);
  return {passive,scheduleESupplementalIncome,form461};
}
