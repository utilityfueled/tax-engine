// @vitest-environment jsdom
// Spec: spec/federal/guided-marriage-policy.yaml.
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {SectionCredits} from '@/components/guided-interview/section-credits';
import {emptyCreditsData,type CreditsData} from '@/lib/guided-interview-flow';
import {buildPremiumTaxCreditInputs} from '@/lib/guided-premium-tax-credit-facts';
import {actualMarriagePersonal,actualMarriagePolicyData} from '../../fixtures/guided-marriage-policy';

function present<T>(value:T|null|undefined):T{if(value===null||value===undefined)throw new Error('Missing actual fixture source');return value;}

it('reaches marriage controls and preserves unknown source answers',async()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  let latest:CreditsData={...emptyCreditsData,premiumTaxCredit:actualMarriagePolicyData()};
  const coverage=()=>present(latest.premiumTaxCredit),marriage=()=>present(coverage().marriageSources);
  function Harness(){const [data,setData]=useState(latest);return <SectionCredits data={data} hasDependents filingStatus="mfj" taxYear={2025} personalData={actualMarriagePersonal()} onDataChange={next=>{latest=next;setData(next)}}/>;}
  function field(label:string){const control=[...container.querySelectorAll('label')].find(row=>row.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');if(!control)throw new Error(`Missing ${label}`);return control;}
  async function change(label:string,value:string){const control=field(label);await act(async()=>{const setter=Object.getOwnPropertyDescriptor(control.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set;if(!setter)throw new Error('Missing DOM value setter');setter.call(control,value);control.dispatchEvent(new Event(control.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
  async function click(label:string){const button=[...container.querySelectorAll('button')].find(row=>row.textContent===label);if(!button)throw new Error(`Missing ${label}`);await act(async()=>button.click());}
  try{
    await act(async()=>root.render(<Harness/>));expect(field('Policy 1: Original recipient SSN').value).toBe('111-22-3333');expect(field('Actual marriage date (YYYY-MM-DD)').value).toBe('2025-07-15');
    await change('Marriage worksheet reference','Changed actual source reference');
    expect(coverage().sourceFactsConfirmed).toBeNull();expect(marriage().sourceFactsConfirmed).toBeNull();expect(marriage().benchmarks.every(row=>row.sourceFactsConfirmed===null)).toBe(true);
    await change('Primary month 1: Corrected alternative SLCSP premium','0');expect(present(marriage().benchmarks[0]).slcsp).toBe('0');
    await change('Primary month 1: Corrected alternative SLCSP premium','');expect(present(marriage().benchmarks[0]).slcsp).toBe('');
    await change('Primary month 1: Corrected alternative SLCSP premium','433');
    for(const owner of ['Primary','Spouse'])for(let month=1;month<=7;month++)await change(`${owner} month ${month}: Benchmark source checked after the last edit`,'true');
    await change('Marriage sources checked after the last edit','true');await change('Marketplace sources checked after the last edit','true');
    expect(buildPremiumTaxCreditInputs(latest.premiumTaxCredit,2025,'mfj',actualMarriagePersonal()).form8962?.marriageSources?.benchmarks).toHaveLength(14);
    await change('Primary taxpayer was unmarried on January 1','false');expect(marriage().primaryUnmarriedOnJanuary1).toBe(false);
    await click('Copy marriage household and original policies');const packet=marriage();
    expect(packet.marriageDate).toBe('');expect(packet.primaryUnmarriedOnJanuary1).toBeNull();expect(present(packet.dependents[0]).alternativeFamilyOwner).toBe('');expect(present(present(packet.policies[0]).original.monthlyPremiums[0]).enrolleePremium).toBe('500');
    await click('Copy alternative benchmark coverage groups');expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/marriage date/i);
  }finally{await act(async()=>root.unmount());container.remove();}
});

// Spec: spec/federal/form-8962-marriage-first-day.yaml.
it('recopies first-day marriage groups through June after an actual date edit',async()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  let latest:CreditsData={...emptyCreditsData,premiumTaxCredit:actualMarriagePolicyData()};
  const coverage=()=>present(latest.premiumTaxCredit),marriage=()=>present(coverage().marriageSources);
  function Harness(){const [data,setData]=useState(latest);return <SectionCredits data={data} hasDependents filingStatus="mfj" taxYear={2025} personalData={actualMarriagePersonal()} onDataChange={next=>{latest=next;setData(next)}}/>;}
  async function date(value:string){const control=[...container.querySelectorAll('label')].find(row=>row.querySelector('.guided-field-label')?.textContent==='Actual marriage date (YYYY-MM-DD)')?.querySelector('input');if(!control)throw new Error('Missing actual date control');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(control,value);control.dispatchEvent(new Event('input',{bubbles:true}));});}
  async function copy(){const button=[...container.querySelectorAll('button')].find(row=>row.textContent==='Copy alternative benchmark coverage groups');if(!button)throw new Error('Missing copy control');await act(async()=>button.click());}
  try{
    await act(async()=>root.render(<Harness/>));await date('2025-07-01');
    expect(coverage().sourceFactsConfirmed).toBeNull();expect(marriage().sourceFactsConfirmed).toBeNull();
    await copy();expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(marriage().marriageDate).toBe('2025-07-01');expect(marriage().benchmarks).toHaveLength(12);
    expect(marriage().benchmarks.every(row=>Number(row.month)<=6&&row.slcsp===''&&row.sourceFactsConfirmed===null)).toBe(true);
    expect(container.textContent).not.toContain('Marriage on the first day of a month,');
    await date('2025-01-01');await copy();expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/January 1.*not eligible|not eligible.*January 1/i);
  }finally{await act(async()=>root.unmount());container.remove();}
});
