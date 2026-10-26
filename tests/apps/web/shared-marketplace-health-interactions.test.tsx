// @vitest-environment jsdom
// Spec: spec/federal/guided-shared-marketplace-health.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { HealthInsuranceSourceDetails } from '@/components/guided-interview/health-insurance-source-details';
import { type HealthInsuranceData } from '@/lib/guided-health-insurance-facts';
import { guidedSharedMarketplaceHealthState } from '../../fixtures/guided-shared-marketplace-health';
import { GuidedInterviewShell } from '@/components/guided-interview/guided-interview-shell';
import { buildSectionRoute, getGuidedFlowStorageKey, saveGuidedFlowState, validateSection, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
it('collects actual shared person links and revokes nested confirmation',async()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  let latest=guidedSharedMarketplaceHealthState().sectionData.adjustments!.healthInsuranceFacts!;
  delete latest.plans[0]!.sharedMarketplaceSources;latest.plans[0]!.payments=latest.plans[0]!.payments.slice(0,1);latest.plans[0]!.months=latest.plans[0]!.months.slice(0,1);
  const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No network'));
  function Harness(){const[data,set]=useState<HealthInsuranceData>(latest);return <HealthInsuranceSourceDetails data={data} onChange={next=>{latest=next;set(next);}}/>;}
  async function click(text:string){const b=[...host.querySelectorAll('button')].find(b=>b.textContent===text);if(!b)throw new Error(`Missing ${text}`);await act(async()=>b.click());}
  async function change(label:string,value:string){const c=[...host.querySelectorAll('label')].find(l=>l.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');if(!c)throw new Error(`Missing ${label}`);await act(async()=>{Object.getOwnPropertyDescriptor(c.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(c,value);c.dispatchEvent(new Event(c.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
  try{
    await act(async()=>root.render(<Harness/>));await click('Plan 1: Add shared-policy payment links');
    expect(latest.plans[0]!.sharedMarketplaceSources).toEqual({sourceTaxYear:'',sourceReference:'',sourceFactsConfirmed:null,allCoveredPersonsLinkedConfirmed:null,allThisReturnPersonsInCoverageFamilyConfirmed:null,persons:[]});
    await change('Plan 1 shared health: Source tax year','2025');await change('Plan 1 shared health: Source reference','Actual records');
    await change('Plan 1 shared health: Every original covered person is linked','true');await change('Plan 1 shared health: All this-return people are in its actual coverage family','false');
    expect(latest.plans[0]!.sharedMarketplaceSources!.allThisReturnPersonsInCoverageFamilyConfirmed).toBe(false);
    await click('Plan 1 shared health: Add person link');expect(latest.plans[0]!.sharedMarketplaceSources!.persons[0]).toEqual({personId:'',coveredIndividualSsn:''});
    await change('Plan 1 shared health person 1: Health worksheet person','primary');await change('Plan 1 shared health person 1: Original covered person SSN','111-22-3333');
    await change('Plan 1 shared health: Person links checked after the last edit','true');await change('Health insurance sources checked after the last edit','true');
    expect(latest.plans[0]!.sharedMarketplaceSources!.sourceFactsConfirmed).toBe(true);
    await change('Plan 1 payment 1: Other person\'s paid share','0');
    expect(latest.sourceFactsConfirmed).toBeNull();expect(latest.plans[0]!.sharedMarketplaceSources!.sourceFactsConfirmed).toBeNull();
    expect(latest.plans[0]!.payments[0]!.otherPersonPaid).toBe('0');expect(latest.plans[0]!.sharedMarketplaceSources!.persons[0]!.coveredIndividualSsn).toBe('111-22-3333');
    await change('Plan 1 shared health: Source tax year','');await click('Plan 1 shared health person 1: Remove link');expect(latest.plans[0]!.sharedMarketplaceSources!.persons).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  }finally{await act(async()=>root.unmount());host.remove();fetch.mockRestore();}
});

it('reaches independent Marketplace confirmations before health validation permits Continue',async()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const state=guidedSharedMarketplaceHealthState();state.segmentation.lifeEvents=['self-employed-health-insurance'];
  state.currentSectionIndex=buildSectionRoute(state.segmentation).findIndex(section=>section.id==='adjustments');
  state.completedSections=['personal-info','income-self-employment'];
  const workspace=createWorkspaceRecord('actual-shared-health-reachability');workspace.returnSummary.targetTaxYear=2025;
  saveGuidedFlowState(localStorage,workspace.id,state);
  vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
  const scroll=vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  const priorScroll=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollTo');Object.defineProperty(HTMLElement.prototype,'scrollTo',{value:vi.fn(),configurable:true});
  const saved=()=>JSON.parse(localStorage.getItem(getGuidedFlowStorageKey(workspace.id))??'{}') as GuidedFlowState;
  async function change(label:string,value:string){const control=[...host.querySelectorAll('label')].find(node=>node.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');if(!control)throw new Error(`Missing ${label}`);await act(async()=>{Object.getOwnPropertyDescriptor(control.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set?.call(control,value);control.dispatchEvent(new Event(control.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
  try{
    await act(async()=>root.render(<GuidedInterviewShell workspace={workspace} onExitGuided={()=>{}}/>));
    const credits=[...host.querySelectorAll<HTMLButtonElement>('.guided-progress-step')].find(node=>node.textContent==='Tax Credits');expect(credits?.disabled).toBe(true);
    await change('Plan 1 shared health: Source reference','Changed actual link reference');
    expect(saved().sectionData.credits?.premiumTaxCredit?.sourceFactsConfirmed).toBeNull();
    expect(saved().sectionData.credits?.premiumTaxCredit?.sharedPolicyAllocations?.sourceFactsConfirmed).toBeNull();
    expect(validateSection(saved(),'adjustments')).toMatchObject({status:'partial',allowSkip:false});
    await change('Plan 1 shared health: Person links checked after the last edit','true');
    await change('Health insurance sources checked after the last edit','true');
    await change('Allocation sources checked after the last edit','true');
    await change('Marketplace sources checked after the last edit','true');
    expect(validateSection(saved(),'adjustments').status).toBe('complete');
    expect(saved().sectionData.credits?.premiumTaxCredit?.policies[0].monthlyPremiums[0].enrolleePremium).toBe('1000');
    expect(saved().sectionData.adjustments?.healthInsuranceFacts?.plans[0].payments[0].otherPersonPaid).toBe('200');
  }finally{await act(async()=>root.unmount());host.remove();localStorage.removeItem(getGuidedFlowStorageKey(workspace.id));scroll.mockRestore();vi.unstubAllGlobals();if(priorScroll)Object.defineProperty(HTMLElement.prototype,'scrollTo',priorScroll);else Reflect.deleteProperty(HTMLElement.prototype,'scrollTo');}
});
