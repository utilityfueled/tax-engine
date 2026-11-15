import {guidedInvestmentElectionFixture} from './guided-schedule-ai-investment-election';
import {investmentHouseholdFixture} from './form-2210-investment-household';
function required<T,>(v:T|null|undefined):T{if(v==null)throw Error('Actual fixture required');return v;}
export function guidedInvestmentHouseholdFixture(){
 const base=guidedInvestmentElectionFixture(),canonical=investmentHouseholdFixture(),state=base.state;
 state.segmentation.filingStatus='mfj';
 Object.assign(required(state.sectionData['personal-info']),{...canonical.taxpayer.primary,spouse:{...canonical.taxpayer.spouse,usResidencyMonths:'12',employmentValidSsnIssuedByDueDate:true,tinIssuedByDueDate:true},state:'MA',city:'Boston',zip:'02108'});
 const div=required(canonical.form1099Div[0]);Object.assign(required(required(state.sectionData['income-investments']).dividendEntries[0]),{payer:div.payer,payerTin:div.payerTin,sourceTaxYear:'2025',accountHolder:'primary',accountReference:div.accountReference});
 Object.assign(required(state.sectionData.deductions),{realEstateTaxes:'40000'});
 const facts=required(required(state.sectionData.payments).estimatedTaxFacts),core=canonical.form2210.investmentElectionSources;
 const household={...structuredClone(core.household),sourceTaxYear:'2025',dividendSources:core.household.dividendSources.map(row=>({...structuredClone(row),sourceIndex:String(row.sourceIndex),sourceTaxYear:'2025'}))};
 const packet=Object.assign(base.packet,{household,periods:core.periods.map(row=>{const {sourceFactsComplete,...actual}=row.form4952;void sourceFactsComplete;return {...row,form4952:{...actual,sourceTaxYear:'2025'}};})});
 Object.assign(facts,{bothSpousesSelfEmployed:false,investmentElectionSources:packet,annualizedIncomePeriods:canonical.form2210.annualizedIncomePeriods.map(row=>({...row,schedule1AAdjustment:'0'}))});
 return{state,facts,packet,household,canonical};
}
