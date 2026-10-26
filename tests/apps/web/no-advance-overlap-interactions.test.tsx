// @vitest-environment jsdom
// Spec: spec/federal/form-8962-no-advance-overlap.yaml.
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {SectionCredits} from '@/components/guided-interview/section-credits';
import {emptyCreditsData,type CreditsData} from '@/lib/guided-interview-flow';
import {buildPremiumTaxCreditInputs} from '@/lib/guided-premium-tax-credit-facts';
import {actualNoAdvanceOverlapData} from '../../fixtures/guided-no-advance-overlap';
import {completePersonalInfo} from '../../guided-interview/complete-facts';
it('captures actual monthly families and groups through the complete Marketplace panel',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 const source=actualNoAdvanceOverlapData();delete source.sharedPolicyAllocations!.noAdvanceCoverageFamilies;const originals=JSON.stringify(source.policies);
 let latest:CreditsData={...emptyCreditsData,premiumTaxCredit:source};
 function Harness(){const[data,setData]=useState(latest);return <SectionCredits data={data} hasDependents={false} filingStatus="single" taxYear={2025} personalData={completePersonalInfo} onDataChange={next=>{latest=next;setData(next);}}/>;}
 const control=(label:string)=>[...container.querySelectorAll('label')].find(e=>e.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');
 async function change(label:string,value:string){const c=control(label);if(!c)throw new Error(`Missing ${label}`);await act(async()=>{Object.getOwnPropertyDescriptor(c.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(c,value);c.dispatchEvent(new Event(c.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
 async function click(label:string){const b=[...container.querySelectorAll('button')].find(e=>e.textContent===label);if(!b)throw new Error(`Missing ${label}`);await act(async()=>b.click());}
 async function confirm(){for(const i of [1,2])await change(`Allocation policy ${i}: Benchmark sources checked after the last edit`,'true');await change('Complete coverage-family sources checked after the last edit','true');await change('Allocation sources checked after the last edit','true');}
 try{await act(async()=>root.render(<Harness/>));await click('Copy complete overlapping coverage families');expect(control('Complete coverage-family source year')?.value).toBe('2025');expect(control('Complete coverage-family sources checked after the last edit')?.value).toBe('');
 await change('Complete coverage-family worksheet reference','Actual all-family record');await change('All no-advance overlapping months are included','true');
 for(const [index,amount] of ['1200','600'].entries()){
  const prefix=`Month 1 family ${index+1}`;await change(`${prefix}: Coverage source reference`,`Actual family ${index+1}`);await change(`${prefix}: All eligible covered members are included`,'true');await change(`${prefix}: All policies covering this family are in the original ledger`,'true');await click(`${prefix}: Add actual location group`);
  const group=`${prefix} group 1`;expect(control(`${group}: Applicable benchmark`)?.value).toBe('');await change(`${group}: Source ID`,`${index+1}-actual-group`);await change(`${group}: Source reference`,'Actual Marketplace lookup');await change(`${group}: Rating area`,'WA-one');
  const checkbox=container.querySelector<HTMLInputElement>(`input[aria-label="${group}: Include covered person 1"]`);if(!checkbox)throw new Error('Missing actual family member');await act(async()=>checkbox.click());await change(`${group}: Applicable benchmark`,amount);await change(`${group}: These people share this rating area`,'true');
 }
 await confirm();await click('Calculate household amounts from allocation');expect(container.querySelector('[role="alert"]')).toBeNull();expect(latest.premiumTaxCredit!.monthlyReconciliation).toMatchObject([{month:'1',enrolleePremium:'1000',slcsp:'1200',advancePremiumTaxCredit:'0'}]);await confirm();await change('Marketplace sources checked after the last edit','true');expect(buildPremiumTaxCreditInputs(latest.premiumTaxCredit,2025,'single',completePersonalInfo).form8962?.monthlyReconciliation).toHaveLength(1);
 await change('Month 1 family 1 group 1: Applicable benchmark','');expect(latest.premiumTaxCredit!.sharedPolicyAllocations!.noAdvanceCoverageFamilies!.sourceFactsConfirmed).toBeNull();expect(latest.premiumTaxCredit!.sharedPolicyAllocations!.sourceFactsConfirmed).toBeNull();expect(latest.premiumTaxCredit!.sourceFactsConfirmed).toBeNull();expect(JSON.stringify(latest.premiumTaxCredit!.policies)).toBe(originals);
 }finally{await act(async()=>root.unmount());container.remove();}
});
