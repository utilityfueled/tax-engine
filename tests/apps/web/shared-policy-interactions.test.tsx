// @vitest-environment jsdom
// Spec: spec/federal/guided-shared-policy.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionCredits } from '@/components/guided-interview/section-credits';
import { emptyCreditsData, type CreditsData } from '@/lib/guided-interview-flow';
import { actualSharedPolicyData } from '../../fixtures/guided-shared-policy';
import { actualNoAdvanceAllocationData } from '../../fixtures/guided-no-advance-allocation';
import { actualDefaultAllocationData } from '../../fixtures/guided-default-allocation';
import { completePersonalInfo } from '../../guided-interview/complete-facts';
import { buildPremiumTaxCreditInputs } from '@/lib/guided-premium-tax-credit-facts';

it('reaches actual allocation controls and revokes confirmation after edits', async () => {
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 let latest:CreditsData={...emptyCreditsData,premiumTaxCredit:actualSharedPolicyData()};delete latest.premiumTaxCredit!.sharedPolicyAllocations;
 function Harness(){const [data,setData]=useState(latest);return <SectionCredits data={data} hasDependents={false} filingStatus="single" taxYear={2025} personalData={completePersonalInfo} onDataChange={next=>{latest=next;setData(next)}}/>;}
 async function click(label:string){const b=[...container.querySelectorAll('button')].find(e=>e.textContent===label);if(!b)throw new Error(`Missing ${label}`);await act(async()=>b.click());}
 async function change(label:string,value:string){const c=[...container.querySelectorAll('label')].find(e=>e.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');if(!c)throw new Error(`Missing ${label}`);await act(async()=>{Object.getOwnPropertyDescriptor(c.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(c,value);c.dispatchEvent(new Event(c.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
 try{
  await act(async()=>root.render(<Harness/>));await click('Copy original policies and household');
  const packet=latest.premiumTaxCredit!.sharedPolicyAllocations!;expect(packet.primarySsn).toBe('111-22-3333');expect(packet.policies[0]!.monthlyAllocations[0]!.fraction).toBe('');expect(packet.policies[0]!.coveredFamilyAssignments[0]!.family).toBe('');
  await change('Allocation worksheet reference','Actual signed agreement');await change('All shared policies are included','true');
  await change('Allocation policy 1: Other taxpayer name','Robin Other');await change('Allocation policy 1: Other taxpayer SSN','444-55-6666');await change('Allocation policy 1: Allocation situation','other_two_tax_families');
  for(const label of ['No marriage or divorce occurred this year','Exactly two tax families share this policy','Every covered person is assigned','Original SLCSP amounts are correct','Both taxpayers agreed to these fractions'])await change(`Allocation policy 1: ${label}`,'true');
  await change('Allocation policy 1: Agreement reference','Actual monthly agreement');
  await change('Allocation policy 1: Covered person 1 tax family','this_return');await change('Allocation policy 1: Covered person 2 tax family','other_return');
  for(let m=1;m<=12;m++)await change(`Allocation policy 1: Month ${m} agreed fraction`,'0.50');
  await change('Allocation sources checked after the last edit','true');expect(latest.premiumTaxCredit!.sharedPolicyAllocations!.sourceFactsConfirmed).toBe(true);
  await click('Calculate household amounts from agreement');expect(container.querySelector('[role="alert"]')).toBeNull();expect(latest.premiumTaxCredit!.monthlyReconciliation[0]).toMatchObject({enrolleePremium:'500',slcsp:'450',advancePremiumTaxCredit:'250',coverageEligible:true,incomeBasedSepEnrollment:false});
  await change('Allocation sources checked after the last edit','true');await change('Marketplace sources checked after the last edit','true');
  expect(buildPremiumTaxCreditInputs(latest.premiumTaxCredit,2025,'single',completePersonalInfo).form8962?.allocationRequired).toBe(true);
  await change('Allocation policy 1: Month 1 agreed fraction','0');expect(latest.premiumTaxCredit!.sourceFactsConfirmed).toBeNull();expect(latest.premiumTaxCredit!.sharedPolicyAllocations!.sourceFactsConfirmed).toBeNull();
  await change('Policy 1: Original recipient SSN','');expect(latest.premiumTaxCredit!.policies[0]!.recipientSsn).toBe('');await click('Copy original policies and household');expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/recipient|SSN/i);
 }finally{await act(async()=>root.unmount());container.remove();}
});

it('reaches no-agreement enrollment controls without an entered allocation share', async () => {
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 const data=actualDefaultAllocationData();data.sharedPolicyAllocations!.policies[0]!.agreementConfirmed=true;delete data.sharedPolicyAllocations!.policies[0]!.defaultAllocation;
 data.sharedPolicyAllocations!.policies[0]!.monthlyAllocations.forEach(row=>row.fraction='.50');
 let latest:CreditsData={...emptyCreditsData,premiumTaxCredit:data};const originals=JSON.stringify(data.policies);
 function Harness(){const [value,setValue]=useState(latest);return <SectionCredits data={value} hasDependents={false} filingStatus="single" taxYear={2025} personalData={completePersonalInfo} onDataChange={next=>{latest=next;setValue(next)}}/>;}
 const control=(label:string)=>[...container.querySelectorAll('label')].find(e=>e.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');
 async function change(label:string,value:string){const c=control(label);if(!c)throw new Error(`Missing ${label}`);await act(async()=>{Object.getOwnPropertyDescriptor(c.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(c,value);c.dispatchEvent(new Event(c.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
 async function click(label:string){const button=[...container.querySelectorAll('button')].find(e=>e.textContent===label);if(!button)throw new Error(`Missing ${label}`);await act(async()=>button.click());}
 try{
  await act(async()=>root.render(<Harness/>));
  await change('Allocation policy 1: Both taxpayers agreed to these fractions','false');
  expect(control('Allocation policy 1: Month 1 agreed fraction')).toBeUndefined();
  expect(latest.premiumTaxCredit!.sharedPolicyAllocations!.policies[0]!.monthlyAllocations.every(row=>row.fraction==='')).toBe(true);
  expect(control('Allocation policy 1: Enrollment source reference')?.value).toBe('');
  expect(control('Allocation policy 1: This taxpayer enrolled every original covered person')?.value).toBe('');
  await change('Allocation sources checked after the last edit','true');await click('Calculate household amounts from allocation');
  expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/enrollment reference/i);
  await change('Allocation policy 1: Enrollment source reference','Actual original application');
  await change('Allocation policy 1: Enrolling taxpayer SSN','111-22-3333');
  await change('Allocation policy 1: This taxpayer enrolled every original covered person','true');
  await change('Allocation sources checked after the last edit','true');await click('Calculate household amounts from allocation');
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(latest.premiumTaxCredit!.monthlyReconciliation[0]).toMatchObject({enrolleePremium:'330',slcsp:'297',advancePremiumTaxCredit:'165',coverageEligible:true});
  await change('Allocation sources checked after the last edit','true');await change('Marketplace sources checked after the last edit','true');
  expect(buildPremiumTaxCreditInputs(latest.premiumTaxCredit,2025,'single',completePersonalInfo).form8962?.sharedPolicyAllocations?.policies?.[0]?.agreementConfirmed).toBe(false);
  await change('Allocation policy 1: Enrolling taxpayer SSN','');expect(latest.premiumTaxCredit!.sourceFactsConfirmed).toBeNull();expect(latest.premiumTaxCredit!.sharedPolicyAllocations!.sourceFactsConfirmed).toBeNull();
  expect(JSON.stringify(latest.premiumTaxCredit!.policies)).toBe(originals);
  await change('Allocation policy 1: Both taxpayers agreed to these fractions','true');expect(latest.premiumTaxCredit!.sharedPolicyAllocations!.policies[0]!.defaultAllocation).toBeUndefined();
 }finally{await act(async()=>root.unmount());container.remove();}
});


it('reaches no-advance benchmark controls without supplying a computed fraction',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 const source=actualNoAdvanceAllocationData();const policy=source.sharedPolicyAllocations!.policies[0]!;policy.situation='other_two_tax_families';policy.agreementConfirmed=true;policy.agreementReference='Prior agreement';delete policy.noAdvanceAllocation;policy.monthlyAllocations.forEach(row=>{row.fraction='.50';});
 let latest:CreditsData={...emptyCreditsData,premiumTaxCredit:source};const originals=JSON.stringify(source.policies);
 function Harness(){const [data,setData]=useState(latest);return <SectionCredits data={data} hasDependents={false} filingStatus="single" taxYear={2025} personalData={completePersonalInfo} onDataChange={next=>{latest=next;setData(next)}}/>;}
 const control=(label:string)=>[...container.querySelectorAll('label')].find(e=>e.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');
 async function change(label:string,value:string){const c=control(label);if(!c)throw new Error(`Missing ${label}`);await act(async()=>{Object.getOwnPropertyDescriptor(c.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(c,value);c.dispatchEvent(new Event(c.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
 async function click(label:string){const button=[...container.querySelectorAll('button')].find(e=>e.textContent===label);if(!button)throw new Error(`Missing ${label}`);await act(async()=>button.click());}
 try{
  await act(async()=>root.render(<Harness/>));expect(control('Policy 1 month 1: Original SLCSP box is printed blank')?.value).toBe('true');
  await change('Allocation policy 1: Allocation situation','no_advance_credit');expect(control('Allocation policy 1: Month 1 agreed fraction')).toBeUndefined();expect(control('Allocation policy 1: Both taxpayers agreed to these fractions')).toBeUndefined();
  expect(latest.premiumTaxCredit!.sharedPolicyAllocations!.policies[0]!.agreementReference).toBe('');expect(latest.premiumTaxCredit!.sharedPolicyAllocations!.policies[0]!.monthlyAllocations.every(row=>row.fraction==='')).toBe(true);
  await click('Allocation policy 1: Copy actual coverage-family months');expect(control('Allocation policy 1: Benchmark worksheet year')?.value).toBe('2025');expect(control('Allocation policy 1: Month 1 this-return benchmark')?.value).toBe('');
  await change('Allocation policy 1: Benchmark worksheet reference','Actual family benchmark lookup');await change('Allocation policy 1: All covered people belong to the two coverage families','true');
  for(let m=1;m<=12;m++){await change(`Allocation policy 1: Month ${m} this-return benchmark`,'1200');await change(`Allocation policy 1: Month ${m} other-return benchmark`,'600');await change(`Allocation policy 1: Month ${m} this-return benchmark reference`,'Actual own lookup');await change(`Allocation policy 1: Month ${m} other-return benchmark reference`,'Actual other lookup');}
  await change('Allocation policy 1: Benchmark sources checked after the last edit','true');await change('Allocation sources checked after the last edit','true');await click('Calculate household amounts from allocation');expect(container.querySelector('[role="alert"]')).toBeNull();expect(latest.premiumTaxCredit!.monthlyReconciliation[0]).toMatchObject({enrolleePremium:'1000',slcsp:'1200',advancePremiumTaxCredit:'0'});
  await change('Allocation policy 1: Benchmark sources checked after the last edit','true');await change('Allocation sources checked after the last edit','true');await change('Marketplace sources checked after the last edit','true');expect(buildPremiumTaxCreditInputs(latest.premiumTaxCredit,2025,'single',completePersonalInfo).form1095A?.[0]?.monthlyPremiums[0]?.slcsp).toBeNull();
  await change('Allocation policy 1: Month 1 other-return benchmark','');expect(latest.premiumTaxCredit!.sharedPolicyAllocations!.policies[0]!.noAdvanceAllocation!.sourceFactsConfirmed).toBeNull();expect(latest.premiumTaxCredit!.sourceFactsConfirmed).toBeNull();expect(JSON.stringify(latest.premiumTaxCredit!.policies)).toBe(originals);
 }finally{await act(async()=>root.unmount());container.remove();}
});
