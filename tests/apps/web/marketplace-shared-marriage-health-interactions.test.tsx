// @vitest-environment jsdom
// Spec: spec/federal/marketplace-shared-marriage-health.yaml.
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {GuidedInterviewShell} from '@/components/guided-interview/guided-interview-shell';
import {buildSectionRoute,getGuidedFlowStorageKey,saveGuidedFlowState,validateSection,type GuidedFlowState} from '@/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {createWorkspaceRecord} from '@/lib/workspace-storage';
import {calculateFederalTax} from '@/engine/federal';
import {TaxYearInputSchema} from '@/models/inputs';
import {guidedSharedMarriageHealthState} from '../../fixtures/guided-marketplace-shared-marriage-health';

it('edits actual counterparty relationship in the full marriage health shell',async()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const state=guidedSharedMarriageHealthState();
  state.currentSectionIndex=buildSectionRoute(state.segmentation).findIndex(row=>row.id==='adjustments');
  const workspace=createWorkspaceRecord('actual-shared-marriage-health');workspace.returnSummary.targetTaxYear=2025;
  saveGuidedFlowState(localStorage,workspace.id,state);
  vi.stubGlobal('ResizeObserver',class{observe(){} unobserve(){} disconnect(){}});
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
  const scroll=vi.spyOn(window,'scrollTo').mockImplementation(()=>{}),previous=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollTo');
  Object.defineProperty(HTMLElement.prototype,'scrollTo',{value:vi.fn(),configurable:true});
  const saved=()=>JSON.parse(localStorage.getItem(getGuidedFlowStorageKey(workspace.id))??'{}') as GuidedFlowState;
  const control=(label:string)=>{
    const element=[...host.querySelectorAll('label')].find(row=>row.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');
    if(!element)throw new Error(`Missing actual ${label}`);return element;
  };
  const change=async(label:string,value:string)=>{
    const element=control(label),setter=Object.getOwnPropertyDescriptor(element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set;
    if(!setter)throw new Error('Missing native control setter');
    await act(async()=>{setter.call(element,value);element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));});
  };
  try{
    await act(async()=>root.render(<GuidedInterviewShell workspace={workspace} onExitGuided={()=>{}}/>));
    expect(host.textContent).toContain('For self-employed health insurance, enter both the original marriage records and the actual health-plan payments.');
    expect(control('Actual marriage date (YYYY-MM-DD)').value).toBe('2025-07-15');
    expect(control('Plan 1 payment 1: Original premium').value).toBe('2000');
    expect(control('Allocation policy 1: Other taxpayer was not married to either filer during this year').value).toBe('true');
    expect(host.textContent).not.toContain('Allocation policy 1: No marriage or divorce occurred this year');
    await change('Allocation policy 1: Other taxpayer relationship source reference','Edited actual relationship history');
    expect(saved().sectionData.adjustments!.healthInsuranceFacts!.sourceFactsConfirmed).toBeNull();
    expect(saved().sectionData.credits!.premiumTaxCredit!.sourceFactsConfirmed).toBeNull();
    expect(validateSection(saved(),'adjustments').status).toBe('partial');
    await change('Health insurance sources checked after the last edit','true');
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
    for(let month=1;month<=7;month++)await change(`Primary month ${month}: Benchmark source checked after the last edit`,'true');
    await change('Marriage sources checked after the last edit','true');
    await change('Allocation sources checked after the last edit','true');
    await change('Plan 1 shared health: Person links checked after the last edit','true');
    await change('Marketplace sources checked after the last edit','true');
    expect(validateSection(saved(),'adjustments').status).toBe('complete');
    const result=calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(saved())));
    expect([result.schedule1!.seHealthInsurance.toFixed(),result.form8962!.ptcAllowed.toFixed()]).toEqual(['6338','5149']);
    await change('Primary month 1: Corrected alternative SLCSP premium','');
    expect(saved().sectionData.credits!.premiumTaxCredit!.marriageSources!.benchmarks[0].slcsp).toBe('');
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
  }finally{
    await act(async()=>root.unmount());host.remove();localStorage.removeItem(getGuidedFlowStorageKey(workspace.id));scroll.mockRestore();vi.unstubAllGlobals();
    if(previous)Object.defineProperty(HTMLElement.prototype,'scrollTo',previous);else Reflect.deleteProperty(HTMLElement.prototype,'scrollTo');
  }
});
