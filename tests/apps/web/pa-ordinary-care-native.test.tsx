// @vitest-environment jsdom
// Spec: spec/state/pa-ordinary-care-native.yaml.
import React,{useState} from 'react';
import {expect,it} from 'vitest';
import {PAOrdinaryReturnCompletionDetails} from '@/components/guided-interview/pa-ordinary-return-completion-details';
import type {GuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {paOrdinaryCareFixture} from '../../fixtures/pa-ordinary-care-sources';
import {mountGuidedPanel} from './guided-panel-dom';
async function mount(initial:GuidedPAOrdinaryReturnCompletionSources){
 const f=paOrdinaryCareFixture();let latest=initial,changes=0;
 function Harness(){const[d,set]=useState(initial);return <PAOrdinaryReturnCompletionDetails originalInput={f.input} ordinaryFacts={f.facts} data={d} onChange={next=>{if(!next)throw Error('Actual source draft must remain');changes++;latest=next;set(next);}}/>;}
 const panel=await mountGuidedPanel(<Harness/>);return{f,panel,draft:()=>latest,changes:()=>changes};
}
it('native PA care receipts originate actual sources and preserve reopened originals',async()=>{
 const f=paOrdinaryCareFixture(),{careSources,...care}=f.sources.care;
 const h=await mount({...f.sources,sourceFactsConfirmed:null,care:{...care,originalCarePayments:[]}});
 try{
  await h.panel.click('Add care payment original document');
  const m=f.sources.care.originalCarePayments[0],meta='Care payment original 1 ';
  for(const[label,value]of [['original reference',m.sourceReference],['document name',m.documentName],['actual issuer name',m.issuerName],['actual printed tax year','2025'],['actual printed recipient name',m.recipientName],['actual printed recipient TIN',m.recipientTin],['actual printed record date',m.recordDate],['actual original document available and checked','true']])await h.panel.change(meta+label,value);
  await h.panel.click('Add actual PA current care source records');
  expect((h.panel.control('PA care source tax year')as HTMLInputElement).value).toBe('');
  await h.panel.change('PA care source tax year','2025');await h.panel.change('PA care collection original source reference',careSources.sourceReference);
  await h.panel.change('Actual federal care originals reviewed for this source collection','true');await h.panel.click('Capture reviewed current federal care originals');
  await h.panel.click('Add actual current care payment');const p=careSources.payments[0],o=p.originalReceipt,pre='Care receipt 1 ';
  for(const[label,value]of [['actual source reference',p.sourceReference],['actual provider','0'],['actual qualifying person','0'],['actual paid date',p.paidOn],['actual service from',p.serviceFrom],['actual service through',p.serviceThrough],['actual amount',p.amount],['original receipt number',o.receiptNumber],['original receipt date',o.date],['original receipt amount',o.amount],['original provider name',o.providerName],['original provider TIN',o.providerTin],['original qualifying person name',o.qualifyingPersonName],['original qualifying person TIN',o.qualifyingPersonTin],['actual original available and checked','true'],['actual employment-related expense checked','true'],['actual expense not claimed on another return checked','true']])await h.panel.change(pre+label,value);
  await h.panel.click('Confirm actual PA care payment records after the last edit');expect(h.draft().care.careSources?.sourceFactsConfirmed).toBe(true);expect(h.draft().sourceFactsConfirmed).toBeNull();
  await h.panel.click('Confirm actual PA completion sources after the last edit');expect(h.draft().sourceFactsConfirmed).toBe(true);
  const result=calculatePAOrdinaryReturn(h.f.input,h.f.facts,h.draft());expect(result.pa40.otherCredits.toString()).toBe('600');expect(result.pa40.netOverpayment.toString()).toBe('600');
  expect(h.draft().care.careSources).toEqual(careSources);expect(h.panel.container.querySelector('textarea')).toBeNull();
  const saved=JSON.parse(JSON.stringify(h.draft())) as GuidedPAOrdinaryReturnCompletionSources,reopened=await mount(saved);
  try{expect(reopened.changes()).toBe(0);expect(reopened.draft()).toEqual(saved);expect(calculatePAOrdinaryReturn(reopened.f.input,reopened.f.facts,reopened.draft()).pa40.otherCredits.toString()).toBe('600');}finally{await reopened.panel.dispose();}
 }finally{await h.panel.dispose();}
});
it('native PA care source blanks zeros and edits retain their actual meaning',async()=>{
 const f=paOrdinaryCareFixture(),h=await mount(f.sources);
 try{
  await h.panel.change('Care receipt 1 actual amount','');expect(h.draft().care.careSources?.payments[0].amount).toBe('');expect(h.draft().care.careSources?.sourceFactsConfirmed).toBeNull();expect(h.draft().sourceFactsConfirmed).toBeNull();
  await h.panel.change('Care receipt 1 actual amount','0');expect(h.draft().care.careSources?.payments[0].amount).toBe('0');expect(()=>calculatePAOrdinaryReturn(h.f.input,h.f.facts,h.draft())).toThrow();
  expect(h.draft().care.careSources?.originalDependentCare).toEqual(f.sources.care.careSources.originalDependentCare);
 }finally{await h.panel.dispose();}
});
