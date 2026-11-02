import {it,expect} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter.js';
import {calculateOhioResidentReturn} from '@/engine/state/oh-return.js';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {confirmGuidedOhioResidencyFacts} from '@/lib/guided-ohio-residency-facts';
import {confirmGuidedOhioPaymentFacts} from '@/lib/guided-ohio-payment-facts';
import {updateSectionData} from '@/lib/guided-interview-flow';
import {ohioPaymentFixture} from '../fixtures/oh-payments.js';
import {guidedPACompleteOriginals} from '../fixtures/guided-pa-complete-originals';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {startCompleteInterview} from './complete-facts';
function ohio(status:'full_year_resident'|'part_year_resident'|'nonresident'){
 const actual=ohioPaymentFixture(status);const {ohioResidency,ohioPayments,...original}=actual;
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:'OH'});
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',
  ohioResidency:{...ohioResidency,taxYear:'2025'},ohioPayments:{...ohioPayments,taxYear:'2025',specialFacts:{farmingFishingIncome:'known_none',militaryDisasterRelief:'known_none'}}};
 const current=TaxYearInputSchema.parse(original),draft=state.sectionData['state-return'];
 if(!draft)throw Error('Synthetic Ohio integration fixture requires saved state source facts');
 draft.ohioResidency=confirmGuidedOhioResidencyFacts(current,draft.ohioResidency);
 draft.ohioPayments=confirmGuidedOhioPaymentFacts(current,draft.ohioPayments);
 return {original:current,state};
}
// Spec: state/guided-state-originals-integration.yaml#source-packets
it('guided state originals retain actual packets for all Ohio residency categories',()=>{
 for(const [status,tax,penalty] of [['full_year_resident','2323','105'],['part_year_resident','929','41'],['nonresident','465','0']] as const){
  const {original,state}=ohio(status);const current=buildGuidedStateOriginals(original,state);
  const expectedOriginal=structuredClone(original);
  expect(current.ohioResidency?.originalFederalSources).toEqual(expectedOriginal);expect(current.ohioPayments?.originalFederalSources).toEqual(expectedOriginal);
  const federal=calculateFederalTax(current);const result=calculateOhioResidentReturn(buildOhioResidentReturnInput(current,federal));
  expect(result.it1040.line10_taxAfterCredits.toString()).toBe(tax);expect(result.it1040.line11_underpaymentPenalty.toString()).toBe(penalty);
  expect(state.sectionData['state-return']?.ohioPayments?.specialFacts).toEqual({farmingFishingIncome:'known_none',militaryDisasterRelief:'known_none'});
 }
});
it('guided state originals reject unknown special facts and absent owner records',()=>{
 const {original,state}=ohio('part_year_resident');
 const data=state.sectionData['state-return'];
 if(!data?.ohioPayments)throw Error('Synthetic Ohio integration fixture requires actual payment facts');
 data.ohioPayments.specialFacts.farmingFishingIncome='';expect(()=>buildGuidedStateOriginals(original,state)).toThrow(/farming|actual|source/i);
 delete data.ohioResidency;expect(()=>buildGuidedStateOriginals(original,state)).toThrow(/residency|owner|actual/i);
});
it('guided state originals replay confirmed actual PA periods without manufacturing confirmation',()=>{
 for(const status of ['resident','part_year','nonresident'] as const){const state=guidedPACompleteOriginals(status),raw=buildTaxInputFromGuidedData(state);if(!raw)throw Error('Complete actual federal source missing');const input=TaxYearInputSchema.parse(raw),sources=state.sectionData['state-return']?.paResidencySources;if(!sources)throw Error('Actual residency source missing');expect(buildGuidedStateOriginals(input,state).paResidencySources).toEqual(sources);sources.sourceFactsConfirmed=null;expect(()=>buildGuidedStateOriginals(input,state)).toThrow(/actual|confirm|source/i);}
});
// Spec: state/guided-state-originals-integration.yaml#invalidation
it('guided state source edits clear confirmation while retaining originals',()=>{
 const {state}=ohio('part_year_resident');const previous=structuredClone(state.sectionData['state-return']);
 const personal=state.sectionData['personal-info'];
 if(!personal)throw Error('Synthetic Ohio integration fixture requires personal information');
 const next=updateSectionData(state,'personal-info',{...personal,lastName:'Changed'});
 expect(next.sectionData['state-return']?.ohioResidency?.sourceFactsConfirmed).toBeNull();expect(next.sectionData['state-return']?.ohioPayments?.sourceFactsConfirmed).toBeNull();expect(next.sectionData['state-return']?.ohioPayments?.specialFacts).toEqual(previous?.ohioPayments?.specialFacts);expect(next.sectionData['state-return']?.ohioResidency?.owners).toEqual(previous?.ohioResidency?.owners);
});
