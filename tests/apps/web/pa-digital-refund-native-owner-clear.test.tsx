// @vitest-environment jsdom
// Spec: spec/state/pa-digital-refund-native-owner-clear.yaml, owner-cleared.
import React,{useState} from 'react';
import {expect,it} from 'vitest';
import {PAOrdinaryReturnCompletionDetails} from '@/components/guided-interview/pa-ordinary-return-completion-details';
import {buildGuidedPAOrdinaryReturnCompletionSources,type GuidedPAOrdinaryReturnCompletionSources as Sources} from '@/lib/guided-pa-ordinary-return-completion';
import {nativeRefundFixture} from '../../fixtures/pa-digital-refund-native';
import {mountGuidedPanel} from './guided-panel-dom';
it.each(['Refund packet actual owner','VA remittance 1 actual owner','VA filed return actual owner','Special refund application actual owner','VA agency award actual owner','VA received refund actual owner','VA complete account actual owner'])('native actual refund owner can return to unknown: %s',async label=>{
 const f=nativeRefundFixture(),original=structuredClone(f.completion);let latest:Sources=f.completion;
 function Harness(){const[data,setData]=useState(latest);return <PAOrdinaryReturnCompletionDetails originalInput={f.input} ordinaryFacts={f.facts} data={data} onChange={value=>{if(!value)throw Error('Actual completion records required');latest=value;setData(value);}}/>;}
 const dom=await mountGuidedPanel(<Harness/>);
 try{
  expect(()=>buildGuidedPAOrdinaryReturnCompletionSources(f.input,latest,f.facts)).not.toThrow();
  expect(dom.control(label).value).toBe('primary');await dom.change(label,'');
  expect(dom.control(label).value).toBe('');expect(latest.sourceFactsConfirmed).toBeNull();
  expect(latest.otherStateTaxes.refundedDigitalDraft?.sourceFactsConfirmed).toBeNull();
  expect(latest.otherStateTaxes.refundedDigitalSources?.sourceFactsConfirmed).toBeNull();
  expect(latest.otherStateTaxes.refundedDigitalSources?.owner).toEqual(original.otherStateTaxes.refundedDigitalSources?.owner);
  expect(latest.otherStateTaxes.refundedDigitalSources?.originalFederalSources).toEqual(original.otherStateTaxes.refundedDigitalSources?.originalFederalSources);
  expect(()=>buildGuidedPAOrdinaryReturnCompletionSources(f.input,latest,f.facts)).toThrow();
  await dom.click('Confirm actual VA digital refund originals after the last edit');
  expect(latest.otherStateTaxes.refundedDigitalDraft?.sourceFactsConfirmed).toBeNull();
  expect(dom.control(label).value).toBe('');
 }finally{await dom.dispose();}
});
