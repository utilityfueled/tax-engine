// @vitest-environment jsdom
// Spec: spec/federal/guided-shared-policy.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionCredits } from '@/components/guided-interview/section-credits';
import { emptyCreditsData, type CreditsData } from '@/lib/guided-interview-flow';
import { actualSharedPolicyData } from '../../fixtures/guided-shared-policy';
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
