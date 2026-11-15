// @vitest-environment jsdom
// Spec: spec/federal/guided-foreign-capital-originals.yaml.
import React,{act,useState} from 'react';import {createRoot} from 'react-dom/client';import {expect,it} from 'vitest';
import {ForeignIncomeDetails} from '@/components/guided-interview/foreign-income-details';
import {capitalFieldLabel,foreignCapitalTitles,foreignCapitalFields,capitalFieldKind} from '@/lib/guided-foreign-capital-originals';
import {updateSectionData} from '@/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {calculateFederalTax} from '@/engine/federal';
import {TaxYearInputSchema} from '@/models/inputs';
import {buildForeignIncomeInput} from '@/lib/guided-foreign-income';
import {guidedForeignCapitalFixture} from '../../fixtures/guided-foreign-capital-originals';
function required<T>(x:T|null|undefined):T{if(x==null)throw Error('Missing fictional source');return x;}
it('originates both finite capital source methods and revokes edited confirmations',async()=>{
 (globalThis as{IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 for(const method of['mixedCapitalServices','allForeignCapitalLoss']as const){const f=guidedForeignCapitalFixture(method),original=structuredClone(f.proof);Reflect.deleteProperty(f.row,method);let latest=f.data,latestState=f.state;const el=document.createElement('div');document.body.appendChild(el);const root=createRoot(el);
 function Harness(){const[state,setState]=useState(latestState);return <ForeignIncomeDetails data={state.sectionData.adjustments?.foreignIncome} onChange={value=>{latestState=updateSectionData(state,'adjustments',{...state.sectionData.adjustments,foreignIncome:value});latest=required(latestState.sectionData.adjustments?.foreignIncome);setState(latestState);}}/>;}
 const prefix=`${foreignCapitalTitles[method]} 1`,draft=()=>required(latest.sources[0]?.[method]);
 const field=(label:string)=>required([...el.querySelectorAll('label')].find(node=>node.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select'));
 const change=async(label:string,value:string)=>{const node=field(label);await act(async()=>{Object.getOwnPropertyDescriptor(node.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set?.call(node,value);node.dispatchEvent(new Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));});};
 const click=async(label:string)=>{const button=required([...el.querySelectorAll('button')].find(node=>node.textContent===label));await act(async()=>button.click());};
 try{await act(async()=>root.render(<Harness/>));await click(`Add ${method==='mixedCapitalServices'?'mixed-location capital service':'all-foreign capital-loss'} originals 1`);expect(draft()).toEqual({});
  for(const key of foreignCapitalFields[method]){const value=Reflect.get(original,key);expect(field(`${prefix}: ${capitalFieldLabel(key)}`).value).toBe('');await change(`${prefix}: ${capitalFieldLabel(key)}`,String(value));}
  await click(`Confirm ${prefix}`);expect(draft().sourceFactsConfirmed).toBe(true);await change('Foreign sources checked after the last edit','true');expect(Reflect.get(buildForeignIncomeInput(latest,f.state)?.sourceMapping?.rows?.[0]??{},method)).toEqual({...original,taxYear:2025});expect(calculateFederalTax(TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(latestState)))).form2555?.netExclusion.toFixed()).toBe(method==='mixedCapitalServices'?'634':'-13713');
  const boolean=foreignCapitalFields[method].find(key=>capitalFieldKind(key)==='boolean');if(!boolean)throw Error('Missing boolean source');await change(`${prefix}: ${capitalFieldLabel(boolean)}`,'false');expect(Reflect.get(draft(),boolean)).toBe(false);expect(draft().sourceFactsConfirmed).toBeNull();expect(()=>buildForeignIncomeInput(latest,f.state)).toThrow();await change(`${prefix}: ${capitalFieldLabel(boolean)}`,'true');
  const zeroKey=method==='mixedCapitalServices'?'unallocatedBusinessExpenses':'priorQbiLoss';await change(`${prefix}: ${capitalFieldLabel(zeroKey)}`,'');expect(Reflect.get(draft(),zeroKey)).toBe('');await change(`${prefix}: ${capitalFieldLabel(zeroKey)}`,'0');await click(`Confirm ${prefix}`);await change('Foreign sources checked after the last edit','true');expect(()=>buildForeignIncomeInput(latest,f.state)).not.toThrow();
  await change('Original foreign source reference 1','Edited private foreign book');expect(draft().sourceFactsConfirmed).toBeNull();await click(`Remove ${prefix}`);expect(latest.sources[0]?.[method]).toBeUndefined();
 }finally{await act(async()=>root.unmount());el.remove();}}
});
