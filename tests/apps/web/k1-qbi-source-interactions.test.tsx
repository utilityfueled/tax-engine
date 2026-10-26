// @vitest-environment jsdom
// Spec: spec/federal/guided-k1-qbi-sources.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { K1LossSourceDetails } from '@/components/guided-interview/k1-loss-source-details';
import type { K1LossSourcesData } from '@/lib/guided-qbi-loss-data';
it('edits original K1 records and independently confirmed histories', async()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const element=document.createElement('div');document.body.appendChild(element);const root=createRoot(element);
  let latest:K1LossSourcesData|undefined;
  function Harness(){const[data,set]=useState(latest);return <K1LossSourceDetails data={data} onChange={next=>{latest=next;set(next);}}/>;}
  async function click(text:string){const button=[...element.querySelectorAll('button')].find(row=>row.textContent===text);if(!button)throw new Error(text);await act(async()=>button.click());}
  async function change(label:string,value:string){
    const input=[...element.querySelectorAll('label')].find(row=>row.querySelector('.guided-field-label')?.textContent===label)?.querySelector('input,select') as HTMLInputElement|HTMLSelectElement|null;
    if(!input)throw new Error(label);await act(async()=>{Object.getOwnPropertyDescriptor(input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set?.call(input,value);input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));});
  }
  try{
    await act(async()=>root.render(<Harness/>));await click('Add K-1 and qualified loss sources');expect(latest).toEqual({});
    await click('Add original K-1');expect(latest?.activities?.[0].statement).toBeUndefined();
    await change('K-1 1 entity type','partnership');await change('K-1 1 source year','2025');
    await change('K-1 1 ordinary income or loss','-100000.10');
    await change('K-1 1 specified service business','false');expect(latest?.activities?.[0].statement?.section199AIsSST).toBe(false);
    await click('Add K-1 1 prior passive history');expect(latest?.activities?.[0].passiveHistory?.vintages).toBeUndefined();
    await click('Record no K-1 1 prior passive vintages');expect(latest?.activities?.[0].passiveHistory?.vintages).toEqual([]);
    await change('K-1 1 prior passive history checked after the last edit','true');
    await change('K-1 packet checked after the last edit','true');expect(latest?.sourceFactsConfirmed).toBe(true);
    await change('K-1 1 ordinary income or loss','-100000.20');
    expect(latest?.sourceFactsConfirmed).toBeNull();expect(latest?.activities?.[0].passiveHistory?.sourceFactsConfirmed).toBeNull();
    expect(latest?.activities?.[0].statement?.ordinaryIncome).toBe('-100000.20');
    expect(element.textContent).not.toContain('Enter current allowable loss');
    await change('K-1 1 ordinary income or loss','');expect(latest?.activities?.[0].statement?.ordinaryIncome).toBe('');
    await click('Record no original K-1s');expect(latest?.activities).toEqual([]);
  }finally{await act(async()=>root.unmount());element.remove();}
});
