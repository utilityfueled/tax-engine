import { carryFixture } from './foreign-tax-carryover';
import { completeInterestEntry,completeW2Entry,startCompleteInterview } from '../guided-interview/complete-facts';
import type { ForeignTaxElectionData } from '@/lib/guided-foreign-tax-election';

export function guidedCarryoverFixture() {
  const source=carryFixture();const election=source.foreignTaxElection;
  if(!election?.deductionYearCarryover)throw new Error('Missing fixture');
  const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages','investments'],lifeEvents:[],stateCode:null});
  state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'95000',federalWithheld:'100000',stateTaxWithheld:'0'}]};
  const investment={interestEntries:[{...completeInterestEntry,payer:'Synthetic foreign bank',payerTin:'112233445',accountReference:'Synthetic account A',accountHolder:'primary' as const,foreignCountry:'Canada',interestIncome:'5000',foreignTaxPaid:'600'}],dividendEntries:[],brokerageEntries:[]};
  const facts:ForeignTaxElectionData={...election,taxYear:'2025',deductionYearCarryover:{...election.deductionYearCarryover,sourceTaxYear:'2025',adjustedThroughTaxYear:'2024',carryovers:[{originTaxYear:'2024',category:'passive',amount:'200',sourceReference:'Actual prior balance'}]}};
  state.sectionData['income-investments']=investment;state.sectionData['other-taxes']={foreignTaxElection:facts};
  return{state,investment,facts};
}
