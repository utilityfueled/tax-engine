// @vitest-environment jsdom
// Spec: spec/federal/form-2210-schedule-ai.yaml special-rate-dom.
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {EstimatedTaxSourceDetails} from '@/components/guided-interview/estimated-tax-source-details';
import {emptyEstimatedTaxFacts,type EstimatedTaxFactsData} from '@/lib/guided-estimated-tax-facts';
it('retains every special original field after confirmation is revoked by edits',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);let latest:EstimatedTaxFactsData|undefined;
 function Harness(){const[value,setValue]=useState<EstimatedTaxFactsData>({...structuredClone(emptyEstimatedTaxFacts),calculationMethod:'annualized'});return <EstimatedTaxSourceDetails data={value} taxYear={2025} onChange={next=>{latest=next;if(next)setValue(next);}}/>;}
 const change=async(label:string,value:string)=>{const input=[...host.querySelectorAll('label')].find(x=>x.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');if(!input)throw new Error(label);await act(async()=>{Object.getOwnPropertyDescriptor(input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));});};
 const click=async(label:string)=>{const button=[...host.querySelectorAll('button')].find(x=>x.textContent===label);if(!button)throw new Error(label);await act(async()=>button.click());};
 try{await act(async()=>root.render(<Harness/>));await click('Add actual special-rate period worksheets');
 expect(latest?.annualizedIncomePeriods?.every(row=>row.rate28GainLoss===''&&row.unrecaptured1250BeforeLosses==='')).toBe(true);
 await change('Period 1: Signed 28% worksheet sum of lines 1 through 6, including capital losses','-123.45');
 expect(host.querySelectorAll('input').length).toBeGreaterThan(8);
 await change('Period 4: Unrecaptured section 1250 worksheet line 13 before capital losses','0');
 await change('All four special-rate original period worksheets checked after the last edit','true');
 expect(latest?.specialRatePeriodsConfirmed).toBe(true);
 await change('Period 1: Signed 28% worksheet sum of lines 1 through 6, including capital losses','-123.46');
 expect(latest?.specialRatePeriodsConfirmed).toBeNull();expect(latest?.sourceFactsConfirmed).toBeNull();
 await change('Period 4: Unrecaptured section 1250 worksheet line 13 before capital losses','0');
 expect(latest?.annualizedIncomePeriods?.[0]?.rate28GainLoss).toBe('-123.46');
 await change('Estimated-tax calculation method','regular');await change('Estimated-tax calculation method','annualized');
 expect(latest?.annualizedIncomePeriods?.[0]?.rate28GainLoss).toBe('-123.46');expect(latest?.specialRatePeriodsConfirmed).toBeNull();
 await click('Remove special-rate period worksheets');expect(latest?.annualizedIncomePeriods?.every(row=>row.rate28GainLoss===undefined&&row.unrecaptured1250BeforeLosses===undefined)).toBe(true);
 }finally{await act(async()=>root.unmount());host.remove();}
});
