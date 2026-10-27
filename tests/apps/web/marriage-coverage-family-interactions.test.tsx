// @vitest-environment jsdom
// Spec: spec/federal/marketplace-marriage-coverage-family.yaml.
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {GuidedInterviewShell} from '@/components/guided-interview/guided-interview-shell';
import {buildSectionRoute,getGuidedFlowStorageKey,saveGuidedFlowState,validateSection,type GuidedFlowState} from '@/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {createWorkspaceRecord} from '@/lib/workspace-storage';
import {calculateFederalTax} from '@/engine/federal';
import {TaxYearInputSchema} from '@/models/inputs';
import {guidedMarriageCoverageFamilyState} from '../../fixtures/guided-marriage-coverage-family';

it('copies and reconfirms actual monthly marriage groups in the full shell',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),state=guidedMarriageCoverageFamilyState();
 state.currentSectionIndex=buildSectionRoute(state.segmentation).findIndex(row=>row.id==='adjustments');
 const workspace=createWorkspaceRecord('actual-monthly-marriage-health');workspace.returnSummary.targetTaxYear=2025;saveGuidedFlowState(localStorage,workspace.id,state);
 vi.stubGlobal('ResizeObserver',class{observe(){} unobserve(){} disconnect(){}});vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
 const scroll=vi.spyOn(window,'scrollTo').mockImplementation(()=>{}),previous=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollTo');Object.defineProperty(HTMLElement.prototype,'scrollTo',{value:vi.fn(),configurable:true});
 const saved=()=>JSON.parse(localStorage.getItem(getGuidedFlowStorageKey(workspace.id))??'{}') as GuidedFlowState;
 const control=(label:string)=>{const element=[...host.querySelectorAll('label')].find(row=>row.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');if(!element)throw new Error(`Missing actual ${label}`);return element;};
 const change=async(label:string,value:string)=>{const element=control(label),setter=Object.getOwnPropertyDescriptor(element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set;if(!setter)throw new Error('Missing native setter');await act(async()=>{setter.call(element,value);element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));});};
 try{
  await act(async()=>root.render(<GuidedInterviewShell workspace={workspace} onExitGuided={()=>{}}/>));
  const copy=[...host.querySelectorAll('button')].find(button=>button.textContent==='Copy alternative benchmark coverage groups');expect(copy).toBeDefined();await act(async()=>copy!.click());
  const rows=saved().sectionData.credits!.premiumTaxCredit!.marriageSources!.benchmarks;
  expect(rows.map(row=>row.month)).toEqual(['2','3','4','5','6','7']);expect(rows[0].coveredIndividualSsns).toEqual([]);expect(rows.every(row=>row.slcsp===''&&row.sourceFactsConfirmed===null)).toBe(true);
  expect(buildTaxInputFromGuidedData(saved())).toBeNull();
  for(let month=2;month<=7;month++){await change(`Primary month ${month}: Corrected alternative SLCSP premium`,month===2?'0':'800');await change(`Primary month ${month}: Benchmark source reference`,`Actual corrected alternative source ${month}`);}
  for(let month=2;month<=7;month++)await change(`Primary month ${month}: Benchmark source checked after the last edit`,'true');
  await change('Marriage sources checked after the last edit','true');
  await change('Plan 1 coverage family: Sources checked after the last edit','true');
  await change('Health insurance sources checked after the last edit','true');await change('Marketplace sources checked after the last edit','true');
  expect(validateSection(saved(),'adjustments')).toMatchObject({status:'complete'});
  const result=calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(saved())));expect([result.schedule1!.seHealthInsurance,result.form8962!.ptcAllowed].map(value=>value.toFixed())).toEqual(['7855','3853']);
  await change('Primary month 2: Corrected alternative SLCSP premium','');expect(buildTaxInputFromGuidedData(saved())).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();localStorage.removeItem(getGuidedFlowStorageKey(workspace.id));scroll.mockRestore();vi.unstubAllGlobals();if(previous)Object.defineProperty(HTMLElement.prototype,'scrollTo',previous);else Reflect.deleteProperty(HTMLElement.prototype,'scrollTo');}
});
