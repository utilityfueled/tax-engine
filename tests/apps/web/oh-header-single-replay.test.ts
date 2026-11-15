/** Spec: state/oh-return-header-sources.yaml; actual qualified originals, not a synthetic trusted context. */
import {afterEach,expect,test,vi} from 'vitest';
import type {TaxYearInput} from '@/models/inputs';
import type {GuidedFlowState} from '../../../apps/web/src/lib/guided-interview-flow';
import * as residency from '../../../apps/web/src/lib/guided-ohio-residency-facts';
import {buildGuidedOhioPaymentFacts} from '../../../apps/web/src/lib/guided-ohio-payment-facts';
import {buildGuidedOhioResidentCreditSources} from '../../../apps/web/src/lib/guided-ohio-resident-credit-sources';
import {buildGuidedOhioSchoolDistrictFacts} from '../../../apps/web/src/lib/guided-ohio-school-district-facts';
import {buildGuidedOhioReturnHeaderSources,confirmGuidedOhioReturnHeaderSources} from '../../../apps/web/src/lib/guided-ohio-return-header-sources';
import {buildGuidedStateOriginals} from '../../../apps/web/src/lib/guided-state-engine-inputs';
import {julyCases,julyHeaderPacket,julyEnteredHeader,julyRequired} from '../../fixtures/oh-business-part-year-header';
function actual(){
 const f=julyHeaderPacket(julyRequired(julyCases[1]));
 const state=structuredClone(f.state);
 julyRequired(state.sectionData['state-return']).ohioReturnHeaderSources=confirmGuidedOhioReturnHeaderSources(f.input,julyEnteredHeader(),f.residency,f.payments);
 return{...f,state};
}
// Preserved original composition: regression comparison only, never an alternate admission path.
function original(input:TaxYearInput,state:GuidedFlowState){
 const data=julyRequired(state.sectionData['state-return']);
 let facts=residency.buildGuidedOhioResidencyFacts(data.ohioResidency,input);
 const paid=buildGuidedOhioPaymentFacts(data.ohioPayments,input);
 if(data.ohioResidency?.residentCreditSources)facts=buildGuidedOhioResidentCreditSources(input,data.ohioResidency.residentCreditSources,facts,paid);
 const district=facts.schoolDistrictStatus==='actual_district_sources_required'||data.ohioSchoolDistrict||input.ohioSchoolDistrict?buildGuidedOhioSchoolDistrictFacts(input,data.ohioSchoolDistrict,data.ohioResidency,data.ohioPayments):undefined;
 const header=data.ohioReturnHeaderSources?buildGuidedOhioReturnHeaderSources(input,data.ohioReturnHeaderSources,data.ohioResidency,data.ohioPayments,data.ohioSchoolDistrict):undefined;
 return{...input,ohioResidency:facts,ohioPayments:paid,...(district?{ohioSchoolDistrict:district}:{}),...(header?{ohioReturnHeaderSources:header}:{})};
}
function outcome(run:()=>unknown){try{return{value:run()};}catch(error){return{error:error instanceof Error?error.message:String(error)};}}
afterEach(()=>vi.restoreAllMocks());
test('Ohio header validates the actual current parent once per state replay',()=>{
 const f=actual(),before=structuredClone(f),spy=vi.spyOn(residency,'buildGuidedOhioResidencyFacts');
 expect(buildGuidedStateOriginals(f.input,f.state)).toEqual(f.withHeader);
 expect(spy).toHaveBeenCalledTimes(1);
 expect(buildGuidedStateOriginals(f.input,f.state)).toEqual(f.withHeader);
 expect(spy).toHaveBeenCalledTimes(2);
 expect(f).toEqual(before);
});
test('Ohio header single replay preserves original output and source rejection parity',()=>{
 const changes:Array<(f:ReturnType<typeof actual>)=>void>=[
  ()=>{},f=>{f.input.ohioPayments=structuredClone(f.paid);},
  f=>{f.input.ohioResidency=structuredClone(f.facts);},
  f=>{f.input.ohioReturnHeaderSources=structuredClone(f.header);},
  f=>{f.input.taxpayer.primary.lastName='Changed';},f=>{f.input.taxpayer.taxYear=2026;},
  f=>{julyRequired(f.state.sectionData['state-return']).ohioResidency=undefined;},
  f=>{julyRequired(f.state.sectionData['state-return']).ohioPayments=undefined;},
  f=>{julyRequired(julyRequired(f.state.sectionData['state-return']).ohioResidency).sourceFactsConfirmed=null;},
  f=>{julyRequired(julyRequired(f.state.sectionData['state-return']).ohioPayments).sourceFactsConfirmed=null;},
  f=>{julyRequired(julyRequired(f.state.sectionData['state-return']).ohioReturnHeaderSources).confirmedHeaderSources=undefined;},
  f=>{julyRequired(julyRequired(f.state.sectionData['state-return']).ohioReturnHeaderSources).sourceReference='SAME-MONEY-EDIT';},
  f=>{julyRequired(julyRequired(julyRequired(f.state.sectionData['state-return']).ohioResidency).businessSources).sourceReference='CHANGED-BUSINESS';},
 ];
 for(const change of changes){const f=actual();change(f);const before=structuredClone(f);const expected=outcome(()=>original(f.input,f.state));expect(outcome(()=>buildGuidedStateOriginals(f.input,f.state))).toEqual(expected);expect(f).toEqual(before);}
});
test('Ohio header independent wrapper revalidates actual originals on every call',()=>{
 const f=actual(),data=julyRequired(f.state.sectionData['state-return']),spy=vi.spyOn(residency,'buildGuidedOhioResidencyFacts');
 expect(buildGuidedOhioReturnHeaderSources(f.input,data.ohioReturnHeaderSources,data.ohioResidency,data.ohioPayments)).toEqual(f.header);
 expect(spy).toHaveBeenCalledTimes(1);
 julyRequired(data.ohioResidency).sourceFactsConfirmed=null;
 expect(()=>buildGuidedOhioReturnHeaderSources(f.input,data.ohioReturnHeaderSources,data.ohioResidency,data.ohioPayments)).toThrow();
 expect(spy).toHaveBeenCalledTimes(2);
});
test('Ohio header absent path retains its single current parent replay',()=>{
 const f=actual(),data=julyRequired(f.state.sectionData['state-return']);delete data.ohioReturnHeaderSources;
 const spy=vi.spyOn(residency,'buildGuidedOhioResidencyFacts');expect(buildGuidedStateOriginals(f.input,f.state)).toEqual(f.canonical);expect(spy).toHaveBeenCalledTimes(1);
});
