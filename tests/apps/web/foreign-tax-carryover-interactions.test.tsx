// @vitest-environment jsdom
// Spec: spec/federal/guided-foreign-tax-carryover.yaml.
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {ForeignTaxElectionDetails} from '@/components/guided-interview/foreign-tax-election-details';
import {buildGuidedForeignTaxElection,type ForeignTaxElectionData} from '@/lib/guided-foreign-tax-election';
import {guidedCarryoverFixture} from '../../fixtures/guided-foreign-tax-carryover';
it('collects a carryover worksheet without manufacturing missing facts',async()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  const fixture=guidedCarryoverFixture();let latest:ForeignTaxElectionData|undefined={...fixture.facts,deductionYearCarryover:undefined};
  function Harness(){const[data,setData]=useState(latest);return <ForeignTaxElectionDetails data={data} investment={fixture.investment} onChange={next=>{latest=next;setData(next);}}/>;}
  async function click(label:string){const control=[...container.querySelectorAll('button')].find(node=>node.textContent===label);if(!control)throw new Error(`Missing ${label}`);await act(async()=>control.click());}
  async function change(label:string,value:string){const control=[...container.querySelectorAll('label')].find(node=>node.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');if(!control)throw new Error(`Missing ${label}`);const setter=Object.getOwnPropertyDescriptor(control.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set;if(!setter)throw new Error('Missing setter');await act(async()=>{setter.call(control,value);control.dispatchEvent(new Event(control.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
  try{
    await act(async()=>root.render(<Harness/>));await click('Add deduction-year carryover worksheet');
    expect(latest?.deductionYearCarryover).toEqual({});
    await change('Carryover worksheet tax year','2025');await change('Balances adjusted through tax year','2024');await change('Carryover worksheet source reference','Actual historical worksheets');
    await change('Carryover calculation method','ordinary_passive');await change('Actual carryover filing history','continuous_individual');
    for(const label of ['Filing history checked against actual returns','No unresolved carryback or redetermination adjustments','No foreign or domestic loss-account adjustments','All foreign ordinary income is recorded here','Current foreign taxes are eligible for credit','Income classification is ordinary passive'])await change(label,'true');
    await click('Add carryover income statement');await change('Carryover income statement 1','form1099Int:0');
    expect(latest?.deductionYearCarryover?.incomeSources?.[0].foreignIncome).toBeUndefined();
    await change('Income 1 actual foreign ordinary amount','5000');await change('Income 1 source reference','Actual foreign allocation');
    await click('Add prior credit balance');expect(latest?.deductionYearCarryover?.carryovers?.[0].originTaxYear).toBeUndefined();
    await change('Balance 1 origin tax year','2024');await change('Balance 1 actual category','passive');await change('Balance 1 adjusted amount','200');await change('Balance 1 source reference','Actual prior ScheduleB');
    await change('Carryover worksheet sources checked after the last edit','true');await change('Foreign-tax election sources checked after the last edit','true');
    expect(buildGuidedForeignTaxElection(latest,fixture.investment,2025,'single')?.deductionYearCarryover?.carryovers?.[0].amount).toBe('200');
    await change('Balance 1 adjusted amount','9007199254740993.03');expect(latest?.deductionYearCarryover?.carryovers?.[0].amount).toBe('9007199254740993.03');
    expect(latest?.deductionYearCarryover?.sourceFactsConfirmed).toBeUndefined();expect(latest?.sourceFactsConfirmed).toBeNull();
    await change('Annual foreign-tax choice','credit');expect(latest?.deductionYearCarryover?.carryovers?.[0].amount).toBe('9007199254740993.03');
    await click('Remove deduction-year carryover worksheet');expect(latest?.deductionYearCarryover).toBeUndefined();
  }finally{await act(async()=>root.unmount());container.remove();}
});
