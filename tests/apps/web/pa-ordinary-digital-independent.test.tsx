// @vitest-environment jsdom
// Spec: spec/state/pa-ordinary-digital-independent.yaml. Real native controls, no handler mocks.
import React,{useState} from 'react';
import {expect,it} from 'vitest';
import {SectionStateReturn} from '@/components/guided-interview/section-state-return';
import type {StateReturnData} from '@/lib/guided-interview-flow';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {calculatePAOrdinaryReturnFacts} from '@/engine/state/pa-ordinary-return-facts';
import {confirmGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {paOrdinaryDigitalFixture} from '../../fixtures/pa-ordinary-digital-sources';
import {mountGuidedPanel} from './guided-panel-dom';

async function setup(f:ReturnType<typeof paOrdinaryDigitalFixture>){
 let latest:StateReturnData={stateEstimatedPayments:[],additionalStateWithholding:'',paResidencySources:f.residency};
 function Harness(){const[data,setData]=useState(latest);return <SectionStateReturn stateCode="PA" taxYear={2025} originalInput={f.input} data={data} guidedPreview={null} onDataChange={next=>{latest=next;setData(next);}}/>;}
 const dom=await mountGuidedPanel(<Harness/>);return {dom,current:()=>latest};
}
it('independent blank source year stays unknown and explicit confirm cannot invent it',async()=>{
 const f=paOrdinaryDigitalFixture(),h=await setup(f);try{
  const original=JSON.stringify(f.input.form1099DA);
  await h.dom.change('PA digital source tax year','');await h.dom.click('Confirm actual PA digital sources after the last edit');
  expect(h.current().paResidencySources?.digitalSources?.sourceTaxYear).toBeNull();
  expect(h.current().paResidencySources?.digitalSources?.sourceFactsConfirmed).toBeNull();
  expect(h.dom.container.querySelector('[role="alert"]')?.textContent).toContain('2025');
  expect(JSON.stringify(f.input.form1099DA)).toBe(original);
 }finally{await h.dom.dispose();}
});
it('independent payment edit revokes row class and parent without changing retained original',async()=>{
 const f=paOrdinaryDigitalFixture(),h=await setup(f);try{
  const original=JSON.stringify(f.digital.statements[0].original);
  await h.dom.change('PA digital 1 actual withholding was paid to Pennsylvania','');
  expect(h.current().paResidencySources?.digitalSources?.statements[0].actualPaymentToPAConfirmed).toBeNull();
  expect(h.current().paResidencySources?.digitalSources?.statements[0].sourceFactsConfirmed).toBeNull();
  expect(h.current().paResidencySources?.digitalSources?.sourceFactsConfirmed).toBeNull();
  expect(h.current().paResidencySources?.sourceFactsConfirmed).toBeNull();
  expect(JSON.stringify(h.current().paResidencySources?.digitalSources?.statements[0].original)).toBe(original);
 }finally{await h.dom.dispose();}
});
it('independent original replacement remains stale until each explicit layer is reviewed',async()=>{
 const f=paOrdinaryDigitalFixture();f.input.form1099DA[0].accountReference='Independent revised equal-money original';
 const saved=JSON.stringify(f.digital.statements[0].original),h=await setup(f);try{
  expect(JSON.stringify(h.current().paResidencySources?.digitalSources?.statements[0].original)).toBe(saved);
  expect(()=>calculatePAOrdinaryReturnFacts(f.input,f.facts)).toThrow();
  await h.dom.click('Confirm actual PA digital sources after the last edit');
  const current=h.current().paResidencySources;expect(current).toBeDefined();if(!current)throw new Error('Missing private residency source');
  expect(current.digitalSources?.sourceFactsConfirmed).toBe(true);
  expect(current.digitalSources?.statements[0].original).toEqual(f.input.form1099DA[0]);
  expect(current.sourceFactsConfirmed).toBeNull();expect(JSON.stringify(f.digital.statements[0].original)).toBe(saved);
  Object.assign(f.input,{paResidencySources:confirmGuidedPAResidencySources(f.input,current)});
  expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/original/);
 }finally{await h.dom.dispose();}
});
it('independent removing a digital classification never removes its actual original statement',async()=>{
 const f=paOrdinaryDigitalFixture(),h=await setup(f),before=JSON.stringify(f.input.form1099DA);try{
  await h.dom.click('Remove PA digital capital sources');
  expect(h.current().paResidencySources?.digitalSources).toBeUndefined();
  expect(h.current().paResidencySources?.sourceFactsConfirmed).toBeNull();
  expect(JSON.stringify(f.input.form1099DA)).toBe(before);
 }finally{await h.dom.dispose();}
});
