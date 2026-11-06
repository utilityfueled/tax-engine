// @vitest-environment jsdom
// Spec: spec/state/guided-zero-income-misc-sources.yaml. Existing native panel is the preproduct behavior boundary.
import React,{useState} from 'react';
import {expect,it} from 'vitest';
import {SectionStateReturn} from '@/components/guided-interview/section-state-return';
import {type StateReturnData} from '@/lib/guided-interview-flow';
import {fictionalMiscFlow,fictionalMiscOriginal,miscRows} from '../../fixtures/guided-zero-income-misc';
import {mountGuidedPanel} from './guided-panel-dom';

async function panel(existing=false){
 const flow=fictionalMiscFlow(existing?undefined:[]);let latest=flow;
 function Harness(){const[data,set]=useState(flow.sectionData['state-return']);return <SectionStateReturn stateCode="PA" taxYear={2025} filingStatus="single" data={data} guidedPreview={null} originalInput={null} onDataChange={(next:StateReturnData)=>{latest={...flow,sectionData:{...flow.sectionData,'state-return':next}};set(next);}}/>;}
 const dom=await mountGuidedPanel(<Harness/>);return{dom,rows:()=>miscRows(latest)};
}
it('native zero-income MISC source starts unknown without copying taxpayer facts',async()=>{
 const p=await panel();try{
  await p.dom.click('Add actual zero-income MISC original');expect(p.rows()).toHaveLength(1);const row=p.rows()[0];
  expect(row).toMatchObject({sourceTaxYear:'',recipientFirstName:'',recipientLastName:'',recipientSsn:'',accountHolder:'',state:'',stateWithheld:'',rents:'',otherIncome:'',sourceFactsConfirmed:null,currentOriginalConfirmed:null});expect(row.confirmedOriginal).toBeUndefined();
  await p.dom.change('MISC 1 Box 1 rents','0');expect(p.rows()[0].rents).toBe('0');expect(p.rows()[0].royalties).toBe('');
  await p.dom.click('Confirm actual zero-income MISC original 1');expect(p.rows()[0].sourceFactsConfirmed).toBeNull();expect(p.rows()[0].confirmedOriginal).toBeUndefined();
  expect(p.dom.container.querySelector('textarea')).toBeNull();expect(p.dom.container.textContent).not.toContain('111-22-3333');expect(p.dom.container.textContent).not.toContain('Fictional private source account A');
 }finally{await p.dom.dispose();}
});
it('native MISC source confirms explicitly and edits retain old originals',async()=>{
 const p=await panel(true);try{
  const before=structuredClone(p.rows()[0]);expect(before.sourceFactsConfirmed).toBe(true);
  await p.dom.change('MISC 1 payer name','Changed fictional payer');expect(p.rows()[0].sourceFactsConfirmed).toBeNull();expect(p.rows()[0].confirmedOriginal).toEqual(before.confirmedOriginal);
  await p.dom.click('Confirm actual zero-income MISC original 1');expect(p.rows()[0].sourceFactsConfirmed).toBe(true);expect(p.rows()[0].confirmedOriginal).toMatchObject({payer:'Changed fictional payer'});
  expect(p.dom.container.querySelector('textarea')).toBeNull();expect(p.dom.container.textContent).not.toContain(JSON.stringify(fictionalMiscOriginal()));
 }finally{await p.dom.dispose();}
});
