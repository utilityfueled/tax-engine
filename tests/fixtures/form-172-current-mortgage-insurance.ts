/** Fictional actual-source records; spec/federal/form-172-current-mortgage-insurance.yaml. */
import { TaxYearInputSchema } from '@/models/inputs.js';
import { mortgageInsurancePrepaidReturnInput } from './mortgage-insurance-prepaid-return.js';
export function currentMortgageInsuranceOriginInput() {
  const mortgage = mortgageInsurancePrepaidReturnInput();
  const wage = mortgage.w2s[0];
  return TaxYearInputSchema.parse({ ...mortgage,
    w2s: [{ ...wage, wages:'20000', federalWithheld:'20000', socialSecurityWages:'20000', socialSecurityWithheld:'1240', medicareWages:'20000', medicareWithheld:'290' }],
    form1099Int:[{taxYear:2026,accountHolder:'primary',payer:'Fictional domestic bank',interestIncome:'20000',federalWithheld:'0'}],
    donations:[], priorYear:{},
    scheduleC:{businessName:'Actual active sole proprietorship',accountHolder:'primary',grossReceipts:'0',qbiMateriallyParticipated:true,allInvestmentAtRisk:true,expenses:{otherExpenses:'100000'},otherExpenseDescription:'Actual completed current-year operating expenses'},
    form172:{sourceTaxYear:2026,sourceReference:'Actual complete current income and expense sources',sourceFactsConfirmed:true,allCurrentYearSourcesIncluded:true,farmingLossIncluded:false,cancelledDebtIncluded:false,estateOrTrustLossIncluded:false,
      businessSources:[{sourceId:'scheduleC',accountHolder:'primary',businessName:'Actual active sole proprietorship',sourceReference:'Actual participation and at-risk records',sourceFactsConfirmed:true,materiallyParticipated:true,allInvestmentAtRisk:true,financialTradingBusiness:false}],
      alternativeTax:{sourceReference:'Independent current-year alternative-tax source worksheet',sourceFactsConfirmed:true,currentYearAdjustmentsCompleteConfirmed:true,regularBasisAndLossLimitsSameAsAlternativeConfirmed:true,regularDepreciationSameAsAlternativeConfirmed:true}},
    netOperatingLoss:{sourceTaxYear:2026,sourceReference:'Actual filed carry packet',sourceFactsConfirmed:true,allCarryoversIncluded:true,calendarYearTaxpayer:true,returnMembership:'continuous_individual',membershipUnchangedConfirmed:true,primaryName:'Fictional Policyholder',primaryTaxpayerIdLast4:'0001',vintages:[],
      alternativeTax:{sourceReference:'Actual independent AMT carry worksheet',sourceFactsConfirmed:true,allCarryoversIncluded:true,specialDisasterCarryIncluded:false,currentYearAdjustmentsCompleteConfirmed:true,regularBasisAndLossLimitsSameAsAlternativeConfirmed:true,vintages:[]}},
  });
}
