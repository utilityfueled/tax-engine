// Spec: spec/state/guided-pa-royalty-sources.yaml.
import {it,expect} from 'vitest';
import {actualGuidedPARoyaltySources} from '../fixtures/guided-pa-royalty-sources';
import {startCompleteInterview,completeW2Entry} from './complete-facts';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {buildGuidedRoyaltySources,copyPARoyaltyOriginals,type RoyaltyPropertyData} from '@/lib/guided-royalty-sources';
import {updateSectionData,validateSection} from '@/lib/guided-interview-flow';
import {calculatePAReturn} from '@/engine/state/pa-orchestrator';
import {calculateFederalTax} from '@/engine/federal';
import {TaxYearInputSchema} from '@/models/inputs';
function stateFixture(){
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages','royalties'],lifeEvents:[],stateCode:'PA'});
 state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'200000'}]};
 state.sectionData['income-royalties']=actualGuidedPARoyaltySources();return state;
}
it('hands actual state classifications through the canonical royalty packet',()=>{
 const state=stateFixture(),before=JSON.stringify(state),sources=buildGuidedRoyaltySources(state);
 expect(sources.royaltyPropertySources?.properties?.[0].paTreatment).toMatchObject({sourceTaxYear:2025,sourceFactsConfirmed:true,ownerFullYearPAResident:true});
 const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
 expect(calculatePAReturn(input).pa40.netRentalIncome.toFixed()).toBe('11000');
 expect(calculateFederalTax(input).agi.toFixed()).toBe('211000.5');
 expect(validateSection(state,'income-royalties').status).toBe('complete');expect(JSON.stringify(state)).toBe(before);
});
it('preserves unknown PA facts and actual false without inferring state eligibility',()=>{
 const state=stateFixture(),data=actualGuidedPARoyaltySources();
 Object.assign(data.properties[0].paTreatment,{sourceFactsConfirmed:null,ownerFullYearPAResident:null});
 state.sectionData['income-royalties']=data;
 const p=buildGuidedRoyaltySources(state).royaltyPropertySources?.properties?.[0].paTreatment;
 expect(p?.ownerFullYearPAResident).toBeUndefined();expect(p?.expenses?.[0].surfaceRights).toBe(false);
 expect(validateSection(state,'income-royalties').status).toBe('partial');
 const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
 expect(calculateFederalTax(input).agi.toFixed()).toBe('211000.5');expect(()=>calculatePAReturn(input)).toThrow(/confirmed|resident|source/i);
});
it('revokes state confirmation while retaining the original copied receipts',()=>{
 const state=stateFixture(),changed=actualGuidedPARoyaltySources();changed.properties[0].expenses[0].amountPaid='49.26';
 const next=updateSectionData(state,'income-royalties',changed),p=next.sectionData['income-royalties']?.properties?.[0];
 expect(p?.paTreatment?.sourceFactsConfirmed).toBeNull();expect(p?.paTreatment?.expenses?.[0].amountPaid).toBe('49.25');
 const personal=state.sectionData['personal-info'];if(!personal)throw Error('Missing actual personal records');
 const owner=updateSectionData(state,'personal-info',{...personal,stateResidency:'part-year'});
 expect(owner.sectionData['income-royalties']?.properties?.[0].paTreatment?.sourceFactsConfirmed).toBeNull();
 expect(owner.sectionData['income-royalties']?.properties?.[0].paTreatment?.ownerFullYearPAResident).toBe(true);
});

it('copies only actual state originals while preserving zero and unknown ledgers',()=>{
 const property:RoyaltyPropertyData={accountHolder:'primary',propertyType:'copyright',expenses:[]};
 const empty=copyPARoyaltyOriginals(property,'2025');
 expect(empty.expenses).toEqual([]);expect(empty.sourceTaxYear).toBe('2025');
 expect(empty.ownerFullYearPAResident).toBeUndefined();expect(empty.paIncomeClass).toBeUndefined();expect(empty.sourceFactsConfirmed).toBeNull();
 const unknown=copyPARoyaltyOriginals({...property,expenses:undefined},undefined);
 expect(unknown.expenses).toBeUndefined();expect(unknown.sourceTaxYear).toBeUndefined();
 const zero=copyPARoyaltyOriginals({...property,expenses:[{sourceId:'receipt-zero',paidDate:'2025-12-01',amountPaid:'0',category:'insurance'}]},'2024');
 expect(zero.expenses?.[0]).toEqual({sourceId:'receipt-zero',paidDate:'2025-12-01',amountPaid:'0',category:'insurance'});
 expect(zero.sourceTaxYear).toBe('2024');expect(zero.expenses?.[0].netIncomeTax).toBeUndefined();
});
