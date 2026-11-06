// @vitest-environment jsdom
// Spec: spec/federal/guided-tax-refund.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionUnemployment } from '@/components/guided-interview/section-unemployment';
import type { UnemploymentData } from '@/lib/guided-interview-flow';
import { actualRefundEntry } from '../../fixtures/guided-tax-refund';

it('collects actual refund history without defaults and invalidates edits', async()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const element=document.createElement('div'); document.body.appendChild(element); const root=createRoot(element);
  let latest:UnemploymentData={compensation:'',federalWithheld:'',entries:[actualRefundEntry()]};
  function Harness(){const [data,setData]=useState(latest);return <SectionUnemployment data={data} onDataChange={next=>{latest=next;setData(next);}}/>;}
  async function click(label:string){const button=[...element.querySelectorAll('button')].find(node=>node.textContent===label);if(!button)throw new Error(`Missing ${label}`);await act(async()=>button.click());}
  async function change(label:string,value:string){const input=[...element.querySelectorAll('label')].find(node=>node.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');if(!input)throw new Error(`Missing ${label}`);await act(async()=>{Object.getOwnPropertyDescriptor(input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set?.call(input,value);input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
  try{
    await act(async()=>root.render(<Harness/>));await click('Add historical refund worksheet');expect(latest.taxRefund).toEqual({});
    await click('Copy current refund records');expect(latest.taxRefund?.originalRefundSources?.[0].amount).toBe('1000.25');
    expect(latest.taxRefund?.priorTaxYear).toBeUndefined();
    await change('Did you itemize in the deduction year?','true');await change('Actual prior Schedule A tax election','sales');
    await change('Historical state and local property taxes paid','0');expect(latest.taxRefund?.priorYearPropertyTaxesPaid).toBe('0');
    await change('Refund worksheet checked after the last edit','true');expect(latest.taxRefund?.sourceFactsConfirmed).toBe(true);
    await change('Historical state and local property taxes paid','0.01');expect(latest.taxRefund?.sourceFactsConfirmed).toBeNull();
    await change('Actual prior Schedule A tax election','income');
    expect(latest.taxRefund?.priorRecoveriesBeforeReceiptYear).toBeUndefined();
    expect(latest.taxRefund?.priorYearNolCarryover).toBeUndefined();
    await change('Recoveries received before this receipt year for the historical deductions','0');
    await change('Historical NOL carryover affecting the recovery worksheet','0');
    expect(latest.taxRefund?.priorRecoveriesBeforeReceiptYear).toBe('0');
    expect(latest.taxRefund?.priorYearNolCarryover).toBe('0');
    await change('Actual year refunded taxes were paid and deducted','2023');expect(latest.entries?.[0].refundExpenseTaxYear).toBe('2023');
    expect(element.querySelector('input[type="number"]')).toBeNull();expect(latest.taxRefund).not.toHaveProperty('taxableRefund');
    await click('Remove historical refund worksheet');expect(latest.taxRefund).toBeUndefined();
  }finally{await act(async()=>root.unmount());element.remove();}
});
