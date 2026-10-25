import { TaxYearInputSchema } from '@/models/inputs.js';
import { foreignTaxElectionFixture } from './foreign-tax-election.js';

export const carryFacts = () => ({sourceTaxYear:2025,sourceReference:'Actual prior ScheduleB and ordinary source worksheets',sourceFactsConfirmed:true,
  method:'ordinary_passive',filingHistory:'continuous_individual',filingHistoryConfirmed:true,
  noCarrybackOrRedeterminationAdjustmentsConfirmed:true,noForeignOrDomesticLossAccountsConfirmed:true,
  noOtherForeignIncomeConfirmed:true,allCurrentTaxesCreditEligibleConfirmed:true,passiveCategoryConfirmed:true,
  adjustedThroughTaxYear:2024,
  incomeSources:[{sourceId:'form1099Int:0',payerName:'Synthetic foreign bank',payerTin:'112233445',accountReference:'Synthetic account A',owner:'primary',foreignCountry:'Canada',reportedIncome:'5000',foreignIncome:'5000',sourceReference:'Actual foreign interest detail'}],
  carryovers:[{originTaxYear:2024,category:'passive',amount:'200',sourceReference:'Actual prior ScheduleB balance'}]});
export function carryFixture(changes:Record<string,unknown>={}) {
  const base=foreignTaxElectionFixture();
  const election=base.foreignTaxElection;if(!election?.sources?.[0])throw new Error('Missing source fixture');
  return TaxYearInputSchema.parse({...base,form1099R:[],form8960Sources:undefined,
    form1099Int:[{...base.form1099Int[0],payer:'Synthetic foreign bank',payerTin:'112233445',accountReference:'Synthetic account A',interestIncome:'5000',foreignTaxPaid:'600'}],
    foreignTaxElection:{...election,noUnusedCreditCarryoversConfirmed:false,deductionYearCarryover:carryFacts(),
      sources:[{...election.sources[0],payerName:'Synthetic foreign bank',payerTin:'112233445',accountReference:'Synthetic account A',reportedTaxAmount:'600',taxOnExcludedIncome:'0',investmentAllocableAmount:'0',payments:[{date:'2025-03-15',amountUsd:'600'}]}]},...changes});
}
