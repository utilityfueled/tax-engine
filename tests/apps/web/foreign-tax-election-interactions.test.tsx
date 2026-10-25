// @vitest-environment jsdom
// Spec: spec/federal/guided-foreign-tax-election.yaml.
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {ForeignTaxElectionDetails} from '@/components/guided-interview/foreign-tax-election-details';
import {buildGuidedForeignTaxElection,type ForeignTaxElectionData} from '@/lib/guided-foreign-tax-election';
import {completeInterestEntry} from '../../guided-interview/complete-facts';
it('collects an actual foreign-tax election from an empty worksheet',async()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  let latest:ForeignTaxElectionData|undefined;
  const investment={interestEntries:[{...completeInterestEntry,payer:'Synthetic foreign bank',payerTin:'112233445',accountReference:'Actual account A',foreignTaxPaid:'600.75',foreignCountry:'Canada'}],dividendEntries:[],brokerageEntries:[]};
  function Harness(){const[data,setData]=useState<ForeignTaxElectionData>();return <ForeignTaxElectionDetails data={data} investment={investment} onChange={next=>{latest=next;setData(next);}}/>;}
  async function click(label:string){const button=[...container.querySelectorAll('button')].find(item=>item.textContent===label);if(!button)throw new Error(`Missing ${label}`);await act(async()=>button.click());}
  async function change(label:string,value:string){const field=[...container.querySelectorAll('label')].find(item=>item.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');if(!field)throw new Error(`Missing ${label}`);const setter=Object.getOwnPropertyDescriptor(field.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set;if(!setter)throw new Error('Missing setter');await act(async()=>{setter.call(field,value);field.dispatchEvent(new Event(field.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
  try{
    await act(async()=>root.render(<Harness/>));await click('Add annual foreign-tax election');
    expect(latest?.election).toBeUndefined();expect(latest?.sourceFactsConfirmed).toBeUndefined();
    await change('Foreign-tax election year','2025');await change('Annual foreign-tax choice','deduction');await change('Annual election source reference','Actual election');
    await change('Foreign-tax accounting method','paid');await change('An accrued-credit election was made in an earlier year','false');
    await change('All qualified foreign taxes for the year are included here','true');await change('No unused foreign-tax credit carryovers enter this year','true');await change('No foreign-tax redetermination affects these sources','true');
    await click('Add foreign-tax statement');expect(latest?.sources?.[0].taxOnExcludedIncome).toBeUndefined();
    await change('Foreign-tax statement 1','form1099Int:0');expect(latest?.sources?.[0]).toMatchObject({accountReference:'Actual account A',reportedTaxAmount:'600.75'});
    await change('Source 1 jurisdiction','foreign_country');await change('Source 1 is a qualified foreign income tax','true');
    await change('Source 1 tax on excluded income','0.25');await change('Source 1 tax deducted elsewhere','0');await change('Source 1 investment tax allocation','400.50');
    await change('Source 1 allocation method','Actual included investment-income allocation');await change('Source 1 tax record reference','Actual statement and remittance');
    await click('Add payment for source 1');expect(latest?.sources?.[0].payments?.[0].date).toBe('');
    await change('Source 1 payment 1 date','2025-03-15');await change('Source 1 payment 1 USD amount','600.75');
    await change('Foreign-tax election sources checked after the last edit','true');
    expect(buildGuidedForeignTaxElection(latest,investment,2025,'single')?.sources?.[0].investmentAllocableAmount).toBe('400.5');
    await change('Source 1 investment tax allocation','9007199254740993.03');expect(latest?.sources?.[0].investmentAllocableAmount).toBe('9007199254740993.03');expect(latest?.sourceFactsConfirmed).toBeNull();
    await click('Remove annual foreign-tax election');expect(latest).toBeUndefined();
  }finally{await act(async()=>root.unmount());container.remove();}
});
