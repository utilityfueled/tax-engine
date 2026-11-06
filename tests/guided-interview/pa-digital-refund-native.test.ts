// Spec: spec/state/pa-digital-refund-native.yaml
import {expect,it}from 'vitest';
import {emptyGuidedPADigitalTaxRefundSources,updateGuidedPADigitalTaxRefundSources,draftGuidedPADigitalTaxRefundSources,assertGuidedPADigitalTaxRefundPair,confirmGuidedPADigitalTaxRefundSources,buildGuidedPADigitalTaxRefundSources}from '@/lib/guided-pa-digital-tax-refund-sources';
import {buildGuidedPAOrdinaryReturnCompletionSources,confirmGuidedPAOrdinaryReturnCompletionSources}from '@/lib/guided-pa-ordinary-return-completion';
import {PAOrdinaryReturnCompletionSourcesSchema}from '@/models/pa-ordinary-return-completion';
import {nativeRefundFixture}from '../fixtures/pa-digital-refund-native';
it('starts a retained refund draft with unknown facts',()=>{
 const d=emptyGuidedPADigitalTaxRefundSources();expect(d.sourceTaxYear).toBeNull();expect(d.sourceFactsConfirmed).toBeNull();expect(d.completeThroughDate).toBe('');expect(d.owner).toEqual({firstName:'',lastName:'',ssn:''});expect(d.statements).toEqual([]);
 expect(d.specialApplicationStatus).toBe('unknown');expect(d.filedReturn.state).toBe('');expect(d.filedReturn.sourceTaxYear).toBeNull();expect(d.refund.amount).toBe('');expect(d.refund.actuallyReceivedConfirmed).toBeNull();expect(d.originalFederalSources).toBeUndefined();
});
it('requires an exact current confirmed refund draft pair before stripping',()=>{
 const f=nativeRefundFixture(),d=draftGuidedPADigitalTaxRefundSources(f.records),before=JSON.stringify(f);
 expect(assertGuidedPADigitalTaxRefundPair(f.input,f.facts,d,f.records)).toEqual(d);
 const parent={...f.completion,otherStateTaxes:{...f.completion.otherStateTaxes,refundedDigitalDraft:d}};
 const canonical=buildGuidedPAOrdinaryReturnCompletionSources(f.input,parent,f.facts);expect(PAOrdinaryReturnCompletionSourcesSchema.safeParse(canonical).success).toBe(true);expect(Reflect.has(canonical.otherStateTaxes,'refundedDigitalDraft')).toBe(false);expect(canonical.otherStateTaxes.refundedDigitalSources).toEqual(f.records);
 for(const kind of ['pending','unequal','missing','stale','missingChoice']as const){
  const draft=structuredClone(d),input=structuredClone(f.input);let packet:typeof f.records|undefined=structuredClone(f.records);
  if(kind==='missingChoice')Reflect.deleteProperty(draft,'specialApplicationStatus');if(kind==='pending')draft.sourceFactsConfirmed=null;if(kind==='unequal')draft.refund.confirmationNumber+=' changed';if(kind==='missing')packet=undefined;if(kind==='stale')input.form1099DA[2].accountReference+=' changed';
  expect(()=>assertGuidedPADigitalTaxRefundPair(input,f.facts,draft,packet),kind).toThrow();
 }
 expect(JSON.stringify(f)).toBe(before);
});
it('preserves actual application records until explicitly reconciled',()=>{
 const f=nativeRefundFixture(),draft=draftGuidedPADigitalTaxRefundSources(f.records);
 for(const status of ['unknown','none']as const){const d=updateGuidedPADigitalTaxRefundSources(draft,{specialApplicationStatus:status});expect(()=>confirmGuidedPADigitalTaxRefundSources(f.input,f.facts,d),status).toThrow();expect(d.specialWrittenApplication.applicationId).toBe(f.records.specialWrittenApplication?.applicationId);}
 const g=nativeRefundFixture('1.30'),none=draftGuidedPADigitalTaxRefundSources(g.records);expect(none.specialApplicationStatus).toBe('none');expect(confirmGuidedPADigitalTaxRefundSources(g.input,g.facts,none).specialWrittenApplication).toBeNull();
 const sub=structuredClone(none);sub.sourceTaxYear=2025;expect(()=>confirmGuidedPADigitalTaxRefundSources(f.input,f.facts,sub)).toThrow();
 const actualSub=structuredClone(draft);actualSub.specialApplicationStatus='none';actualSub.specialWrittenApplication=emptyGuidedPADigitalTaxRefundSources().specialWrittenApplication;expect(()=>confirmGuidedPADigitalTaxRefundSources(f.input,f.facts,actualSub)).toThrow('actual sub-dollar refund requires its special written taxpayer application');
 const unknownOwner=structuredClone(draft);unknownOwner.owner={firstName:'',lastName:'',ssn:''};expect(()=>confirmGuidedPADigitalTaxRefundSources(f.input,f.facts,unknownOwner)).toThrow();
});
it('rejects zero edited and duplicate original receipts without changing saved sources',()=>{
 const f=nativeRefundFixture(),before=JSON.stringify(f);
 for(const kind of ['zero','duplicate','unknownYear','unknownReceived','pending']as const){const d=draftGuidedPADigitalTaxRefundSources(f.records);if(kind==='zero')d.refund.amount='0';if(kind==='duplicate')d.statements.push(structuredClone(d.statements[0]));if(kind==='unknownYear')d.sourceTaxYear=null;if(kind==='unknownReceived')d.refund.actuallyReceivedConfirmed=null;if(kind==='pending')d.sourceFactsConfirmed=null;
  expect(()=>buildGuidedPADigitalTaxRefundSources(f.input,f.facts,d),kind).toThrow();
 }
 const changed=updateGuidedPADigitalTaxRefundSources(draftGuidedPADigitalTaxRefundSources(f.records),{sourceReference:'Actual edited source'});expect(changed.sourceFactsConfirmed).toBeNull();expect(()=>confirmGuidedPAOrdinaryReturnCompletionSources(f.input,{...f.completion,otherStateTaxes:{...f.completion.otherStateTaxes,refundedDigitalDraft:changed}},f.facts)).toThrow();expect(JSON.stringify(f)).toBe(before);
});
