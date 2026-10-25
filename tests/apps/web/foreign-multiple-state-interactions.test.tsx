// @vitest-environment jsdom
// Spec: spec/federal/foreign-tax-multiple-state.yaml.
import React, {act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {ForeignTaxElectionDetails} from '@/components/guided-interview/foreign-tax-election-details';
import {buildGuidedForeignTaxElection,type ForeignTaxElectionData} from '@/lib/guided-foreign-tax-election';
import {guidedCarryoverFixture} from '../../fixtures/guided-foreign-tax-carryover';

it('enters an actual no-tax jurisdiction and revokes the source confirmations',async()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container),fixture=guidedCarryoverFixture();
  let latest:ForeignTaxElectionData|undefined={...fixture.facts,deductionYearCarryover:{...fixture.facts.deductionYearCarryover,itemizedAllocation:{
    sourceReference:'Actual itemized deductions',incomeOrSalesTaxes:'6000',homeRealPropertyTaxes:'0',personalPropertyTaxes:'0',
    stateIncomeTaxes:[{stateCode:'NY',deductibleAmount:'6000',stateTaxableIncome:'90000',foreignIncomeSpecificallyExempt:false,sourceReference:'Actual NY worksheet'}],
  }}};
  function Harness(){const [data,setData]=useState(latest);return <ForeignTaxElectionDetails data={data} investment={fixture.investment} onChange={value=>{latest=value;setData(value);}}/>;}
  async function click(label:string){const control=[...container.querySelectorAll('button')].find(node=>node.textContent===label);if(!control)throw new Error(`Missing ${label}`);await act(async()=>control.click());}
  async function change(label:string,value:string){
    const control=[...container.querySelectorAll('label')].find(node=>node.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');
    if(!control)throw new Error(`Missing ${label}`);
    const setter=Object.getOwnPropertyDescriptor(control.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set;if(!setter)throw new Error('Missing setter');
    await act(async()=>{setter.call(control,value);control.dispatchEvent(new Event(control.tagName==='SELECT'?'change':'input',{bubbles:true}));});
  }
  const allocation=()=>latest?.deductionYearCarryover?.itemizedAllocation;
  try{
    await act(async()=>root.render(<Harness/>));
    await change('Actual state income-tax allocation method','ordinary_presumption');
    expect(allocation()?.stateAllocation?.noTaxStateIncome).toBeUndefined();
    await change('State jurisdiction worksheet source reference','Actual complete state worksheet');
    for(const label of ['State allocation method history checked','All taxing and no-tax state sources are included','State source income does not overlap'])await change(label,'true');
    await click('Add no-tax state income source');
    expect(allocation()?.stateAllocation?.noTaxStateIncome?.[0]).toEqual({});
    await change('No-tax state 1 code','TX');await change('No-tax state 1 U.S. taxable income','1000.01');
    await change('No-tax state 1 source reference','Actual reasonable source attribution');
    for(const label of ['State jurisdiction sources checked after the last edit','Itemized allocation sources checked after the last edit','Carryover worksheet sources checked after the last edit','Foreign-tax election sources checked after the last edit'])await change(label,'true');
    expect(buildGuidedForeignTaxElection(latest,fixture.investment,2025,'single')?.deductionYearCarryover?.itemizedAllocation?.stateAllocation?.noTaxStateIncome?.[0].usTaxableIncome).toBe('1000.01');
    await change('No-tax state 1 U.S. taxable income','1000.02');
    expect(allocation()?.stateAllocation?.sourceFactsConfirmed).toBeUndefined();expect(allocation()?.sourceFactsConfirmed).toBeUndefined();
    expect(latest?.deductionYearCarryover?.sourceFactsConfirmed).toBeUndefined();expect(latest?.sourceFactsConfirmed).toBeNull();
    await change('State jurisdiction sources checked after the last edit','true');
    await change('State allocation 1 actual taxable income','90000.01');expect(allocation()?.stateAllocation?.sourceFactsConfirmed).toBeUndefined();
    await change('State jurisdiction sources checked after the last edit','true');
    await change('Income 1 actual foreign ordinary amount','4999');expect(allocation()?.stateAllocation?.sourceFactsConfirmed).toBeUndefined();
    await click('Remove no-tax state 1');expect(allocation()?.stateAllocation?.noTaxStateIncome).toEqual([]);
  }finally{await act(async()=>root.unmount());container.remove();}
});
