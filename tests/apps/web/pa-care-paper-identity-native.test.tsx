// @vitest-environment jsdom
// Spec: state/pa-care-paper-identity.yaml. Actual native controls; no component mocks.
import React,{act,useState} from 'react';
import {expect,it} from 'vitest';
import {PAMarriedOrdinaryDetails} from '@/components/guided-interview/pa-married-ordinary-details';
import {buildGuidedPAMarriedOrdinarySources} from '@/lib/guided-pa-married-ordinary-sources';
import {calculatePAReturn} from '@/index';
import {paCarePaperIdentityFixture} from '../../fixtures/pa-care-paper-identity';
import {PACareSourcesDetails} from '@/components/guided-interview/pa-care-sources-details';
import {paMarriedDependentCareFixture} from '../../fixtures/pa-married-dependent-care';
import {mountGuidedPanel} from './guided-panel-dom';

it('native documentary collection starts unknown and cannot infer identifier kinds',async()=>{
  const f=paMarriedDependentCareFixture(),initial=f.sources.care?.careSources;
  if(!initial)throw Error('Actual care originals required');
  let latest=initial;
  function Harness(){const[data,setData]=useState(initial);return <PACareSourcesDetails originalInput={f.input} data={data} onChange={next=>{if(!next)throw Error('Retain actual draft');latest=next;setData(next);}}/>;}
  const panel=await mountGuidedPanel(<Harness/>);
  try{
    await panel.click('Add actual PA care documentary identity records');
    expect(latest).toMatchObject({sourceFactsConfirmed:null,paperIdentitySources:{sourceTaxYear:null,sourceReference:'',sourceFactsConfirmed:null,providers:[],qualifyingPersons:[]}});
    await panel.click('Add actual care provider identity record');
    expect(latest.paperIdentitySources?.providers[0]).toMatchObject({providerIndex:null,identifierKind:'unknown',originalAvailableConfirmed:null,originalProvider:{}});
    await panel.change('PA care provider identity 1 actual provider','0');
    expect(panel.control('PA care provider identity 1 documentary identifier kind').value).toBe('unknown');
    await panel.click('Confirm actual PA care identity records after the last edit');
    expect(latest.paperIdentitySources?.sourceFactsConfirmed).toBeNull();
    expect(panel.container.querySelector('textarea,input[type="hidden"]')).toBeNull();
  }finally{await panel.dispose();}
});


async function mountHousehold(documentary=true){
  const f=paMarriedDependentCareFixture(),initial=structuredClone(f.sources);
  if(!initial.care?.careSources)throw Error('Actual current care originals required');
  if(documentary)initial.care.careSources.paperIdentitySources=paCarePaperIdentityFixture(f.input,{providers:['fein'],persons:['ssn']});
  let latest=initial,writes=0;
  function Harness(){const[data,setData]=useState(initial);return <PAMarriedOrdinaryDetails originalInput={f.input} data={data} onChange={next=>{if(!next)throw Error('Retain actual source draft');latest=next;writes++;setData(next);}}/>;}
  const panel=await mountGuidedPanel(<Harness/>);
  return {f,panel,draft:()=>latest,writes:()=>writes,care:()=>{const care=latest.care?.careSources;if(!care)throw Error('Retain actual care source draft');return care;}};
}
const confirmHousehold='Confirm actual married PA household sources after the last edit';
const confirmIdentity='Confirm actual PA care identity records after the last edit';
const confirmCare='Confirm actual PA care payment records after the last edit';

it('native documentary entry reaches actual source composition after separate confirmations',async()=>{
  const h=await mountHousehold(false),before=structuredClone(h.f.input);
  try{
    await h.panel.click('Add actual PA care documentary identity records');
    await h.panel.change('PA care identity source tax year','2025');
    await h.panel.change('PA care identity collection original source reference','Fictional reviewed actual W9 and child identity packet');
    await h.panel.click('Add actual care provider identity record');
    await h.panel.change('PA care provider identity 1 actual provider','0');
    await h.panel.change('PA care provider identity 1 original documentary source reference','Fictional actual original provider W9');
    await h.panel.change('PA care provider identity 1 documentary identifier kind','fein');
    await h.panel.change('PA care provider identity 1 actual original available and checked','true');
    await h.panel.click('Add actual care qualifying person identity record');
    await h.panel.change('PA care person identity 1 actual qualifying person','0');
    await h.panel.change('PA care person identity 1 actual original dependent','0');
    await h.panel.change('PA care person identity 1 original documentary source reference','Fictional actual child identity original');
    await h.panel.change('PA care person identity 1 documentary identifier kind','ssn');
    await h.panel.change('PA care person identity 1 actual original available and checked','true');
    await h.panel.click(confirmIdentity);
    expect(h.care().paperIdentitySources?.sourceFactsConfirmed).toBeNull();
    expect(h.care().paperIdentitySources?.providers[0].originalProvider).toEqual({});
    await h.panel.change('Actual documentary identity originals reviewed for PA care','true');
    await h.panel.click('Capture reviewed PA care identity originals');
    expect(h.care().paperIdentitySources?.providers[0].originalProvider).toEqual(h.f.input.dependentCare?.providers?.[0]);
    expect(h.care().paperIdentitySources?.qualifyingPersons[0].originalFederalDependent).toEqual(h.f.input.taxpayer.dependents[0]);
    expect(h.care().paperIdentitySources?.sourceFactsConfirmed).toBeNull();
    await h.panel.click(confirmIdentity);
    expect(h.care().paperIdentitySources?.sourceFactsConfirmed).toBe(true);
    expect(h.care().sourceFactsConfirmed).toBeNull();
    expect(h.draft().sourceFactsConfirmed).toBeNull();
    await h.panel.click(confirmCare);
    expect(h.care().sourceFactsConfirmed).toBe(true);
    expect(h.draft().sourceFactsConfirmed).toBeNull();
    await h.panel.click(confirmHousehold);
    expect(h.draft().sourceFactsConfirmed).toBe(true);
    const sources=buildGuidedPAMarriedOrdinarySources(h.f.input,h.draft());
    const r:unknown=calculatePAReturn({...h.f.input,paMarriedOrdinarySources:sources});
    expect(r).toMatchObject({methodVersion:'pa-married-ordinary-return-v1',returns:[{accountHolder:'joint'}]});
    expect((r as {returns:Array<{pa40:{netOverpayment:{toFixed():string}}}>}).returns[0].pa40.netOverpayment.toFixed()).toBe('600');
    expect(h.f.input).toEqual(before);
    expect(h.panel.container.querySelector('textarea,input[type="hidden"]')).toBeNull();
  }finally{await h.panel.dispose();}
});

it.each([
  ['PA care provider identity 1 documentary identifier kind','itin'],
  ['PA care provider identity 1 original documentary source reference','Different actual W9 original'],
  ['PA care person identity 1 actual qualifying person',''],
  ['PA care person identity 1 actual original dependent',''],
  ['Care receipt 1 actual source reference','Different actual receipt source'],
] as const)('native material identity edits revoke both source confirmations and retain originals %s',async(label,value)=>{
  const h=await mountHousehold(),original=structuredClone(h.care().paperIdentitySources),federal=structuredClone(h.care().originalDependentCare);
  try{
    expect(h.writes()).toBe(0);
    await h.panel.change(label,value);
    expect(h.draft().sourceFactsConfirmed).toBeNull();
    expect(h.care().sourceFactsConfirmed).toBeNull();
    expect(h.care().paperIdentitySources?.sourceFactsConfirmed).toBeNull();
    expect(h.care().paperIdentitySources?.providers[0].originalProvider).toEqual(original?.providers[0].originalProvider);
    expect(h.care().paperIdentitySources?.qualifyingPersons[0].originalFederalDependent).toEqual(original?.qualifyingPersons[0].originalFederalDependent);
    expect(h.care().originalDependentCare).toEqual(federal);
    expect(()=>buildGuidedPAMarriedOrdinarySources(h.f.input,h.draft())).toThrow();
  }finally{await h.panel.dispose();}
});

it('native unchanged blur preserves identity confirmation and retained unknowns',async()=>{
  const h=await mountHousehold(),before=structuredClone(h.draft());
  try{
    const amount=h.panel.control('Care receipt 1 actual amount');
    await act(async()=>amount.dispatchEvent(new FocusEvent('focusin',{bubbles:true})));
    await act(async()=>amount.dispatchEvent(new FocusEvent('focusout',{bubbles:true})));
    expect(h.writes()).toBe(0);
    expect(h.draft()).toEqual(before);
    expect(h.panel.container.textContent).toContain('Retained provider original: Fictional Care Center');
    expect(JSON.parse(JSON.stringify(h.draft()))).toEqual(before);
  }finally{await h.panel.dispose();}
  const f=paMarriedDependentCareFixture(),care=f.sources.care?.careSources;
  if(!care)throw Error('Actual care required');
  care.paperIdentitySources=paCarePaperIdentityFixture(f.input,{providers:['fein'],persons:['ssn']});
  care.paperIdentitySources.providers[0].identifierKind='unknown';
  care.paperIdentitySources.sourceFactsConfirmed=null;
  const original=structuredClone(care),panel=await mountGuidedPanel(<PACareSourcesDetails originalInput={f.input} data={care} onChange={()=>{throw Error('Read must not write documentary facts');}}/>);
  try{
    expect(panel.control('PA care provider identity 1 documentary identifier kind').value).toBe('unknown');
    expect(care).toEqual(original);
  }finally{await panel.dispose();}
});

it('native federal recapture and explicit removal preserve earlier identity originals',async()=>{
  const h=await mountHousehold(),original=structuredClone(h.care().paperIdentitySources);
  try{
    await h.panel.change('Actual federal care originals reviewed for this source collection','true');
    await h.panel.click('Capture reviewed current federal care originals');
    expect(h.care().paperIdentitySources?.sourceFactsConfirmed).toBeNull();
    expect(h.care().paperIdentitySources?.providers).toEqual(original?.providers);
    expect(h.draft().sourceFactsConfirmed).toBeNull();
    await h.panel.click('Remove PA care documentary identity records');
    expect(h.care().paperIdentitySources).toBeUndefined();
    expect(h.care().sourceFactsConfirmed).toBeNull();
    expect(h.f.input.dependentCare?.providers?.[0].name).toBe('Fictional Care Center');
  }finally{await h.panel.dispose();}
});
