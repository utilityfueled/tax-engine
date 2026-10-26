// @vitest-environment jsdom
// Spec: spec/federal/guided-royalty-sources.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SectionRoyaltyIncome } from '@/components/guided-interview/section-royalty-income';
import type { RoyaltyIncomeData } from '@/lib/guided-royalty-sources';
import { GuidedInterviewShell } from '@/components/guided-interview/guided-interview-shell';
import { buildSectionRoute, getGuidedFlowStorageKey, saveGuidedFlowState, validateSection } from '@/lib/guided-interview-flow';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { actualGuidedRoyaltySources } from '../../fixtures/guided-royalty-sources';
import { completeW2Entry, startCompleteInterview } from '../../guided-interview/complete-facts';

it('collects original royalty properties and preserves unknown answers',async()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const element=document.createElement('div');document.body.appendChild(element);const root=createRoot(element);
  let latest:RoyaltyIncomeData|undefined;
  function Harness(){const[data,setData]=useState(latest);return <SectionRoyaltyIncome data={data} taxYear={2025} onDataChange={next=>{latest=next;setData(next);}}/>;}
  async function click(label:string){const button=[...element.querySelectorAll('button')].find(node=>node.textContent===label);if(!button)throw new Error(`Missing ${label}`);await act(async()=>button.click());}
  async function change(label:string,value:string){const node=[...element.querySelectorAll('label')].find(item=>item.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');if(!node)throw new Error(`Missing ${label}`);await act(async()=>{Object.getOwnPropertyDescriptor(node.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set?.call(node,value);node.dispatchEvent(new Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
  try{
    await act(async()=>root.render(<Harness/>));await click('Add royalty source records');expect(latest).toEqual({});
    await click('Add original royalty statement');expect(latest?.statements?.[0]?.royalties).toBeUndefined();
    await change('Royalty statement 1 source ID','private-royalty-source');
    await change('Royalty statement 1 Original Form 1099-MISC Box 2 royalties','100.10');
    await change('Royalty statement 1 Original Form 1099-MISC Box 3 other income','0');
    await change('Royalty statement 1 direct sales checkbox','false');
    expect(latest?.statements?.[0]).toMatchObject({royalties:'100.10',otherIncome:'0',directSales:false});
    expect(latest?.statements?.[0]?.rents).toBeUndefined();
    await click('Add royalty property');expect(latest?.properties?.[0]?.expenses).toBeUndefined();
    await click('Add property 1 original income link');
    await change('Property 1 income link 1 original statement','private-royalty-source');
    await click('Copy property 1 income link 1 original');
    expect(latest?.properties?.[0]?.incomeSources?.[0]?.original).toMatchObject({royalties:'100.10'});
    expect(latest?.properties?.[0]?.incomeSources?.[0]?.allocatedGross).toBeUndefined();
    await click('Record no property 1 expenses');expect(latest?.properties?.[0]?.expenses).toEqual([]);
    await change('Property 1 Is this royalty property part of a trade or business?','false');
    await change('Royalty statement 1 checked after the last edit','true');await change('Royalty packet checked after the last edit','true');
    expect(latest?.sourceFactsConfirmed).toBe(true);
    await change('Royalty statement 1 Original Form 1099-MISC Box 2 royalties','100.11');
    expect(latest?.sourceFactsConfirmed).toBeNull();expect(latest?.statements?.[0]?.sourceFactsConfirmed).toBeNull();
    expect(latest?.properties?.[0]?.incomeSources?.[0]?.original?.royalties).toBe('100.10');
    await change('Property 1 Is this royalty property part of a trade or business?','');
    expect(latest?.properties?.[0]?.tradeOrBusiness).toBeNull();
    expect(element.querySelector('input[type="number"]')).toBeNull();
  }finally{await act(async()=>root.unmount());element.remove();}
});

it('reaches royalty records from the actual interview and revokes changed year confirmations',async()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const element=document.createElement('div');document.body.appendChild(element);const root=createRoot(element);
  const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages','royalties'],lifeEvents:[],stateCode:null});
  state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'200000'}]};
  state.currentSectionIndex=buildSectionRoute(state.segmentation).findIndex(section=>section.id==='income-royalties');
  state.completedSections=['personal-info','income-w2'];
  expect(validateSection(state,'income-royalties')).toMatchObject({allowSkip:false});
  const workspace=createWorkspaceRecord('royalty-source-reachability');workspace.returnSummary.targetTaxYear=2025;
  saveGuidedFlowState(localStorage,workspace.id,state);
  vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
  const scroll=vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  const oldScroll=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollTo');Object.defineProperty(HTMLElement.prototype,'scrollTo',{value:vi.fn(),configurable:true});
  try{
    await act(async()=>root.render(<GuidedInterviewShell workspace={workspace} onExitGuided={()=>{}}/>));
    expect([...element.querySelectorAll('button')].some(node=>node.textContent==='Add royalty source records')).toBe(true);
    state.sectionData['income-royalties']=actualGuidedRoyaltySources();saveGuidedFlowState(localStorage,workspace.id,state);
    await act(async()=>root.render(<GuidedInterviewShell key="actual" workspace={workspace} onExitGuided={()=>{}}/>));
    const select=[...element.querySelectorAll('label')].find(node=>node.querySelector('.guided-field-label')?.textContent==='Tax year for this interview')?.querySelector('select');
    if(!select)throw new Error('Missing interview year');
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')?.set?.call(select,'2026');select.dispatchEvent(new Event('change',{bubbles:true}));});
    const saved=JSON.parse(localStorage.getItem(getGuidedFlowStorageKey(workspace.id))??'{}').sectionData['income-royalties'];
    expect(saved.sourceFactsConfirmed).toBeNull();expect(saved.statements[0].sourceFactsConfirmed).toBeNull();expect(saved.sourceTaxYear).toBe('2025');expect(saved.properties[0].tradeOrBusiness).toBe(false);
  }finally{await act(async()=>root.unmount());element.remove();scroll.mockRestore();vi.unstubAllGlobals();if(oldScroll)Object.defineProperty(HTMLElement.prototype,'scrollTo',oldScroll);else Reflect.deleteProperty(HTMLElement.prototype,'scrollTo');localStorage.removeItem(getGuidedFlowStorageKey(workspace.id));}
});
