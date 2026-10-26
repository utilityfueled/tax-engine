// @vitest-environment jsdom
// Spec: spec/federal/charitable-recipient-classification.yaml.
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {DeductionSourceDetails} from '@/components/guided-interview/deduction-source-details';
import {emptyDeductionData,emptyDonationEntry,type DeductionData} from '@/lib/guided-interview-flow';
import {buildDonationsInput} from '@/lib/guided-interview-bridge';
import {actualGuidedCharitableCarryover} from '../../fixtures/guided-charitable-carryover';
it('collects actual recipient classification without promoting the saved ambiguous flag',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const element=document.createElement('div');document.body.appendChild(element);const root=createRoot(element);
 let latest:DeductionData={...emptyDeductionData,method:'itemized',charitableContributions:'6000',charitableCarryoverSources:actualGuidedCharitableCarryover(),donationEntries:[{...emptyDonationEntry,organization:'Actual foundation',type:'cash',amount:'6000',date:'2025-05-01',qualifiedOrganization:true,isPrivateFoundation:true}]};
 function Harness(){const [data,setData]=useState(latest);return <DeductionSourceDetails includeMortgages={false} data={data} onChange={next=>{latest=next;setData(next);}}/>;}
 function control(label:string){const input=[...element.querySelectorAll('label')].find(row=>row.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');if(!input)throw new Error(`Missing ${label}`);return input;}
 async function change(label:string,value:string){const input=control(label);await act(async()=>{Object.getOwnPropertyDescriptor(input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set?.call(input,value);input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
 try{
  const before=JSON.stringify(latest);await act(async()=>root.render(<Harness/>));expect(JSON.stringify(latest)).toBe(before);
  expect(()=>buildDonationsInput(latest,2025)).toThrow(/classification|category/i);
  expect(control('Recipient tax category').value).toBe('');
  await change('Recipient tax category','fifty-percent');
  expect(buildDonationsInput(latest,2025)[0]).toMatchObject({recipientCategory:'fifty-percent',isPrivateFoundation:true});
  expect(latest.charitableCarryoverSources?.sourceFactsConfirmed).toBeNull();
  await change('Donation type','appreciated_stock');await change("Donated property's cost basis",'1000');await change('Long-term capital gain property','true');
  await change('Recipient tax category','private-nonoperating');expect(control('Gift is qualified appreciated stock').value).toBe('');
  await change('Recipient tax category','other-thirty-percent');expect(element.textContent).not.toContain('Gift is qualified appreciated stock');
  expect(buildDonationsInput(latest,2025)[0]).toMatchObject({recipientCategory:'other-thirty-percent',isPrivateFoundation:true});
  await change('Recipient tax category','');expect(()=>buildDonationsInput(latest,2025)).toThrow(/classification|category/i);
  expect(latest.donationEntries?.[0].isPrivateFoundation).toBe(true);
  const add=[...element.querySelectorAll('button')].find(row=>row.textContent==='Add donation');if(!add)throw new Error('Missing add button');await act(async()=>add.click());
  expect(latest.donationEntries?.[1].recipientCategory).toBeUndefined();
 }finally{await act(async()=>root.unmount());element.remove();}
});
