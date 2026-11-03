// @vitest-environment jsdom
// Spec: spec/state/pa-digital-refund-native-independent.yaml. Native React controls; no handler or data mocks.
import React,{useState} from 'react';
import {expect,it} from 'vitest';
import {PAOrdinaryReturnCompletionDetails} from '@/components/guided-interview/pa-ordinary-return-completion-details';
import {buildGuidedPAOrdinaryReturnCompletionSources,type GuidedPAOrdinaryReturnCompletionSources as Sources} from '@/lib/guided-pa-ordinary-return-completion';
import {nativeRefundFixture,completionWithoutRefund} from '../../fixtures/pa-digital-refund-native';
import {mountGuidedPanel} from './guided-panel-dom';
type F=ReturnType<typeof nativeRefundFixture>;
async function mount(f:F,initial:Sources=f.completion){let latest=initial,calls=0;
 function Harness(){const[data,set]=useState(initial);return <PAOrdinaryReturnCompletionDetails originalInput={f.input} ordinaryFacts={f.facts} data={data} onChange={next=>{if(!next)throw Error('Independent source completion required');calls++;latest=next;set(next);}}/>;}
 const dom=await mountGuidedPanel(<Harness/>);return{dom,data:()=>latest,calls:()=>calls,Harness};
}
it('independent native add preserves unknowns and minimizes private source rendering',async()=>{
 const f=nativeRefundFixture(),p=await mount(f,completionWithoutRefund(f));try{await p.dom.click('Add actual VA digital refund sources');await p.dom.click('Add actual VA remittance original');const d=p.data().otherStateTaxes.refundedDigitalDraft;if(!d)throw Error('Independent new draft required');expect(d.sourceTaxYear).toBeNull();expect(d.owner).toEqual({firstName:'',lastName:'',ssn:''});expect(d.specialApplicationStatus).toBe('unknown');expect(d.statements[0]).toMatchObject({originalIndex:null,sourceFactsConfirmed:null,withholdingOriginal:{sourceTaxYear:null,accountName:'',accountSsn:'',state:'',date:'',amount:'',confirmationNumber:''}});expect(d.refund.amount).toBe('');
  const panel=p.dom.container.querySelector('section[aria-label="Actual VA digital tax refund sources"]');if(!panel)throw Error('Independent native panel required');expect(panel.querySelector('textarea')).toBeNull();expect(panel.querySelector('input[type="hidden"]')).toBeNull();expect(panel.textContent).not.toContain(f.input.taxpayer.primary.ssn);expect(panel.textContent).not.toContain(JSON.stringify(f.records));
  expect(p.dom.control('Refund source tax year').value).toBe('');await p.dom.change('VA received refund actual received amount','0');expect(p.data().otherStateTaxes.refundedDigitalDraft?.refund.amount).toBe('0');expect(p.data().otherStateTaxes.refundedDigitalDraft?.account.unpaidTaxReported).toBe('');
 }finally{await p.dom.dispose();}
});
it('independent native remittance edit invalidates child and parent and retains originals',async()=>{
 const f=nativeRefundFixture(),p=await mount(f),before=structuredClone(f.completion);try{await p.dom.change('VA remittance 1 actual confirmation number','Independent changed exact-cents remittance');const d=p.data();expect(d.sourceFactsConfirmed).toBeNull();expect(d.otherStateTaxes.refundedDigitalDraft?.sourceFactsConfirmed).toBeNull();expect(d.otherStateTaxes.refundedDigitalSources?.sourceFactsConfirmed).toBeNull();expect(d.otherStateTaxes.refundedDigitalSources?.statements[0].withholdingOriginal.confirmationNumber).toBe(before.otherStateTaxes.refundedDigitalSources?.statements[0].withholdingOriginal.confirmationNumber);expect(d.otherStateTaxes.refundedDigitalSources?.originalFederalSources).toEqual(f.records.originalFederalSources);expect(d.otherStateTaxes.jurisdictions).toEqual(before.otherStateTaxes.jurisdictions);expect(d.restrictedCredits).toEqual(before.restrictedCredits);expect(()=>buildGuidedPAOrdinaryReturnCompletionSources(f.input,d,f.facts)).toThrow();}finally{await p.dom.dispose();}
});
it('independent native stale reads never call source mutation or repair snapshots',async()=>{
 const f=nativeRefundFixture(),p=await mount(f),before=structuredClone(p.data());try{expect(p.calls()).toBe(0);f.input.form1099DA[2].brokerName='Independent equal-dollar changed original broker';await p.dom.render(<p.Harness/>);expect(p.calls()).toBe(0);expect(p.data()).toEqual(before);expect(p.dom.container.textContent).toContain('Current actual originals changed');expect(()=>buildGuidedPAOrdinaryReturnCompletionSources(f.input,p.data(),f.facts)).toThrow();}finally{await p.dom.dispose();}
});
it('independent native pending receipt cannot be promoted by award or parent confirmation',async()=>{
 const f=nativeRefundFixture(),p=await mount(f);try{await p.dom.change('VA received refund actually received','');const before=structuredClone(p.data().otherStateTaxes.refundedDigitalDraft);await p.dom.click('Confirm actual VA digital refund originals after the last edit');expect(p.data().otherStateTaxes.refundedDigitalDraft).toEqual(before);expect(p.data().otherStateTaxes.refundedDigitalSources?.sourceFactsConfirmed).toBeNull();expect(p.data().otherStateTaxes.refundedDigitalDraft?.refund.actuallyReceivedConfirmed).toBeNull();expect(p.dom.container.textContent).toContain('actual full refund must be posted and received');await p.dom.click('Confirm actual PA completion sources after the last edit');expect(p.data().sourceFactsConfirmed).toBeNull();expect(()=>buildGuidedPAOrdinaryReturnCompletionSources(f.input,p.data(),f.facts)).toThrow();}finally{await p.dom.dispose();}
});
it('independent native removal retains foreign history and unrelated originals',async()=>{
 const f=nativeRefundFixture(),p=await mount(f),before=structuredClone(f.completion);try{await p.dom.click('Remove VA digital refund sources');expect(p.data().sourceFactsConfirmed).toBeNull();expect(p.data().otherStateTaxes.refundedDigitalDraft).toBeUndefined();expect(p.data().otherStateTaxes.refundedDigitalSources).toBeUndefined();expect(p.data().otherStateTaxes.jurisdictions).toEqual(before.otherStateTaxes.jurisdictions);expect(p.data().otherStateTaxes.jurisdictions[0].incomeTaxWithheld).toBe('0.30');expect(p.data().care).toEqual(before.care);expect(p.data().local).toEqual(before.local);expect(p.data().nrk1).toEqual(before.nrk1);}finally{await p.dom.dispose();}
});
