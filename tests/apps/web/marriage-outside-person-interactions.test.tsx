// @vitest-environment jsdom
// Spec: spec/federal/marketplace-marriage-outside-person.yaml, controls.
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {GuidedInterviewShell} from '@/components/guided-interview/guided-interview-shell';
import {buildSectionRoute,getGuidedFlowStorageKey,saveGuidedFlowState,validateSection,type GuidedFlowState} from '@/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {createWorkspaceRecord} from '@/lib/workspace-storage';
import {calculateFederalTax} from '@/engine/federal';
import {TaxYearInputSchema} from '@/models/inputs';
import {guidedMarriageOutsidePersonState} from '../../fixtures/guided-marriage-outside-person';

it('edits actual outside child relationship in the full marriage health shell',async()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host), state=guidedMarriageOutsidePersonState();
  state.currentSectionIndex=buildSectionRoute(state.segmentation).findIndex(row=>row.id==='adjustments');
  const workspace=createWorkspaceRecord('actual-marriage-child');workspace.returnSummary.targetTaxYear=2025;
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
  const prefix='Plan 1 person 2 child relationship';
  const reconfirm=async()=>{
    for(let month=1;month<=7;month++)await change(`Primary month ${month}: Benchmark source checked after the last edit`,'true');
    for(const label of [`${prefix}: Sources checked after the last edit`,'Plan 1 coverage family: Sources checked after the last edit',
      'Plan 1 shared health: Person links checked after the last edit','Health insurance sources checked after the last edit',
      'Allocation policy 1: Benchmark sources checked after the last edit','Allocation sources checked after the last edit',
      'Marriage sources checked after the last edit','Marketplace sources checked after the last edit'])await change(label,'true');
  };
  try{
    await act(async()=>root.render(<GuidedInterviewShell workspace={workspace} onExitGuided={()=>{}}/>));
    expect(control(`${prefix}: Relationship began on`).value).toBe('1999-01-02');
    expect(control(`${prefix}: Child relationship`).value).toBe('son_or_daughter');
    expect(control('Plan 1 coverage family other return 1: Actual Form 8962 line 24').value).toBe('0');
    expect(validateSection(saved(),'adjustments').status).toBe('complete');
    await change(`${prefix}: Relationship began on`,'');
    expect(control(`${prefix}: Sources checked after the last edit`).value).toBe('');
    await change('Health insurance sources checked after the last edit','true');
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
    await reconfirm();
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
    await change(`${prefix}: Relationship began on`,'1999-01-02');
    await reconfirm();
    expect(validateSection(saved(),'adjustments').status).toBe('complete');
    const result=calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(saved())));
    expect([result.schedule1!.seHealthInsurance,result.form8962!.ptcAllowed].map(v=>v.toFixed())).toEqual(['6875','5192']);
    expect(saved().sectionData.adjustments!.healthInsuranceFacts!.plans[0].payments[0]).toMatchObject({grossPremium:'3000.03',ownerOrBusinessPaid:'1100.01',otherPersonPaid:'1900.02'});
    const click=async(label:string)=>{const button=[...host.querySelectorAll('button')].find(row=>row.textContent===label);if(!button)throw new Error(`Missing ${label}`);await act(async()=>button.click());};
    await click(`${prefix}: Remove source record`);await click(`${prefix}: Add actual source record`);
    for(const label of ['Source tax year','Source reference','Business owner','Owner SSN','Child SSN on original policy','Child relationship','Relationship began on','Sources checked after the last edit'])expect(control(`${prefix}: ${label}`).value).toBe('');
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
  }finally{
    await act(async()=>root.unmount());host.remove();localStorage.removeItem(getGuidedFlowStorageKey(workspace.id));scroll.mockRestore();vi.unstubAllGlobals();
    if(previous)Object.defineProperty(HTMLElement.prototype,'scrollTo',previous);else Reflect.deleteProperty(HTMLElement.prototype,'scrollTo');
  }
});
