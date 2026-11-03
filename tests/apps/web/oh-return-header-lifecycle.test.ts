/** Spec: state/oh-return-header-lifecycle.yaml; independently authored integration controls. */
import {expect,it} from 'vitest';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {updateSectionData} from '@/lib/guided-interview-flow';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine';
import {prepareOhioResidencyReview,resolveOhioResidencyReview} from '@/engine/state/oh-residency-source';
import {currentHeaderDraft,enteredOhioHeaderDraft,ohioReturnHeaderFixture,requiredHeader} from '../../fixtures/oh-return-header-sources';
function prepared(){
 const f=ohioReturnHeaderFixture(),state=structuredClone(f.native.state),data=requiredHeader(state.sectionData['state-return']);
 Reflect.set(data,'ohioReturnHeaderSources',currentHeaderDraft());return{f,state,data};
}
it('Ohio header integration preserves full native sources and current677',()=>{
 const {f,state}=prepared(),before=structuredClone(state),current=buildGuidedStateOriginals(f.native.input,state);
 expect(Reflect.get(current,'ohioReturnHeaderSources')).toEqual(f.header);
 expect(current.ohioResidency).toEqual(f.facts);expect(current.ohioPayments).toEqual(f.payments);
 const ohio=calculateOhioResidentReturnFromFederal({taxInput:current,federalResult:calculateFederalTax(current)});
 expect(ohio.it1040.line8c_totalTax.toString()).toBe('2323');expect(requiredHeader(ohio.residentCredit).line7_residentCredit.toString()).toBe('1000');expect(ohio.it1040.line26_refund.toString()).toBe('677');expect(state).toEqual(before);
});
it('Ohio header integration rejects retained canonical originals without native packet',()=>{
 const f=ohioReturnHeaderFixture(),input={...f.native.input,ohioReturnHeaderSources:f.header},before=structuredClone(input);
 expect(()=>buildGuidedStateOriginals(input,f.native.state)).toThrow(/header/i);expect(input).toEqual(before);
});
it.each(['own source','parent source','payment source','resident credit source'] as const)('Ohio header integration invalidates actual %s without replacing old captures',kind=>{
 const {state,data}=prepared(),incoming=structuredClone(data),old=currentHeaderDraft(),h=structuredClone(old);
 if(kind==='own source')h.finderOriginal.sourceReference='PRIVATE-SAME-CELLS-NEW-HEADER-ORIGINAL';
 if(kind==='parent source')requiredHeader(incoming.ohioResidency).sourceReference='PRIVATE-SAME-CASH-NEW-PARENT-ORIGINAL';
 if(kind==='payment source')requiredHeader(incoming.ohioPayments).sourceReference='PRIVATE-SAME-CASH-NEW-PAYMENT-ORIGINAL';
 if(kind==='resident credit source')requiredHeader(requiredHeader(incoming.ohioResidency).residentCreditSources).sourceReference='PRIVATE-SAME-CASH-NEW-CREDIT-ORIGINAL';
 Reflect.set(incoming,'ohioReturnHeaderSources',h);const before=structuredClone({state,incoming});const next=requiredHeader(updateSectionData(state,'state-return',incoming).sectionData['state-return']);
 const actual=Reflect.get(next,'ohioReturnHeaderSources') as ReturnType<typeof currentHeaderDraft>;
 expect(actual.sourceFactsConfirmed).not.toBe(true);for(const key of ['originalFederalSources','originalOhioResidencySources','originalOhioPaymentSources','confirmedHeaderSources'] as const)expect(actual[key]).toEqual(old[key]);
 if(kind==='own source'){expect(next.ohioResidency).toEqual(data.ohioResidency);expect(next.ohioPayments).toEqual(data.ohioPayments);}
 expect({state,incoming}).toEqual(before);
});
it('Ohio header integration accepts explicit confirmation without invalidating parents',()=>{
 const {state,data}=prepared();Reflect.set(data,'ohioReturnHeaderSources',enteredOhioHeaderDraft());const incoming=structuredClone(data);Reflect.set(incoming,'ohioReturnHeaderSources',currentHeaderDraft());
 const next=requiredHeader(updateSectionData(state,'state-return',incoming).sectionData['state-return']);expect(Reflect.get(next,'ohioReturnHeaderSources')).toEqual(currentHeaderDraft());expect(next.ohioResidency).toEqual(data.ohioResidency);expect(next.ohioPayments).toEqual(data.ohioPayments);
});
it('Ohio header integration binds whole private header in opaque review',()=>{
 const f=ohioReturnHeaderFixture(),input={...f.input,ohioReturnHeaderSources:f.header},federal=calculateFederalTax(input),token=prepareOhioResidencyReview(input),changed=structuredClone(input);
 expect(resolveOhioResidencyReview(input,federal,token)).toEqual(input);changed.ohioReturnHeaderSources.finderOriginal.sourceReference='PRIVATE-SAME-CELLS-DIFFERENT-PREPARED-ORIGINAL';expect(()=>resolveOhioResidencyReview(changed,federal,token)).toThrow(/originals differ/);
});
it('Ohio header integration invalidates actual upstream identity without replacing captures',()=>{
 const {state}=prepared(),personal=structuredClone(requiredHeader(state.sectionData['personal-info'])),old=currentHeaderDraft();personal.lastName='Changed same-income actual owner';
 const before=structuredClone({state,personal}),next=requiredHeader(updateSectionData(state,'personal-info',personal).sectionData['state-return']);
 const actual=Reflect.get(next,'ohioReturnHeaderSources') as ReturnType<typeof currentHeaderDraft>;expect(actual.sourceFactsConfirmed).not.toBe(true);
 for(const key of ['originalFederalSources','originalOhioResidencySources','originalOhioPaymentSources','confirmedHeaderSources'] as const)expect(actual[key]).toEqual(old[key]);expect({state,personal}).toEqual(before);
});
