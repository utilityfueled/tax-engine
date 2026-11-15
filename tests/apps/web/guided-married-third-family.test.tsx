// @vitest-environment jsdom
// Spec: spec/federal/guided-married-third-family.yaml.
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {PremiumTaxCreditSourceDetails} from '@/components/guided-interview/premium-tax-credit-source-details';
import {updateSectionData} from '@/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {calculateFederalTax} from '@/engine/federal';
import {TaxYearInputSchema} from '@/models/inputs';
import {guidedThirdFamilyState,worksheetEVisibleEntries} from '../../fixtures/guided-married-third-family';
function required<T>(value:T|null|undefined):T{if(value==null)throw Error('Missing actual source');return value;}
it('collects actual WorksheetE originals and invalidates edited confirmations',async()=>{
 (globalThis as{IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const element=document.createElement('div');document.body.appendChild(element);const root=createRoot(element);let latest=guidedThirdFamilyState();delete required(latest.sectionData.credits?.premiumTaxCredit?.sharedPolicyAllocations).marriedThirdFamily;
 function Harness(){const[state,setState]=useState(latest);return <PremiumTaxCreditSourceDetails data={required(state.sectionData.credits?.premiumTaxCredit)} personal={state.sectionData['personal-info']} filingStatus="mfs" taxYear={2025} onChange={premiumTaxCredit=>{latest=updateSectionData(state,'credits',{...state.sectionData.credits,premiumTaxCredit});setState(latest);}}/>;}
 const proof=()=>required(latest.sectionData.credits?.premiumTaxCredit?.sharedPolicyAllocations?.marriedThirdFamily);
 function field(label:string){return required([...element.querySelectorAll('label')].find(node=>node.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select'));}
 async function change(label:string,value:string){const input=field(label);await act(async()=>{Object.getOwnPropertyDescriptor(input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set?.call(input,value);input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
 async function click(label:string){const button=required([...element.querySelectorAll('button')].find(node=>node.textContent===label));await act(async()=>button.click());}
 async function confirm(){await click('Worksheet E: Confirm complete current originals');expect(proof().sourceFactsConfirmed).toBe(true);await change('Allocation sources checked after the last edit','true');await change('Marketplace sources checked after the last edit','true');}
 try{await act(async()=>root.render(<Harness/>));await click('Add Worksheet E three-family originals');expect(proof()).toEqual({});expect(field('Worksheet E: Original source year').value).toBe('');
  for(let i=0;i<3;i++)await click('Worksheet E: Add actual tax family');await click('Worksheet E family 1: Record no claimed dependents');await click('Worksheet E family 2: Record no claimed dependents');for(let i=0;i<3;i++)await click('Worksheet E family 3: Add actual dependent');for(let i=0;i<5;i++)await click('Worksheet E: Add actual covered assignment');await click('Worksheet E: Add actual covered month');
  for(const[label,value]of worksheetEVisibleEntries())await change(label,value);await confirm();const input=required(buildTaxInputFromGuidedData(latest));expect(calculateFederalTax(TaxYearInputSchema.parse(input)).form8962?.advancePTCTotal.toFixed()).toBe('34');
  await change('Worksheet E family 1: All tax family members included','false');expect(proof().families?.[0]?.allTaxFamilyMembersIncludedConfirmed).toBe(false);expect(proof().sourceFactsConfirmed).toBeNull();await click('Worksheet E family 1: Mark dependents unknown');expect(proof().families?.[0]?.dependents).toBeUndefined();await click('Worksheet E family 1: Record no claimed dependents');await change('Worksheet E family 1: All tax family members included','true');await confirm();
  await change('Worksheet E month 1: primary benchmark amount','0');expect(proof().monthlySources?.[0]?.primaryBenchmark).toBe('0');expect(proof().sourceFactsConfirmed).toBeNull();await change('Worksheet E month 1: primary benchmark amount','');expect(proof().monthlySources?.[0]?.primaryBenchmark).toBe('');await change('Worksheet E month 1: primary benchmark amount','450');await confirm();
  await change('Worksheet E month 1: spouse agreement source reference','Edited private agreement');expect(proof().sourceFactsConfirmed).toBeNull();expect(buildTaxInputFromGuidedData(latest)).toBeNull();expect(element.textContent).toContain('both independent benchmark sources');await click('Remove Worksheet E originals');expect(latest.sectionData.credits?.premiumTaxCredit?.sharedPolicyAllocations?.marriedThirdFamily).toBeUndefined();
 }finally{await act(async()=>root.unmount());element.remove();}
});
