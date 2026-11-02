// @vitest-environment jsdom
// Spec: spec/federal/form-1099-da-state-rows.yaml.
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {DigitalAssetSourceCards} from '@/components/guided-interview/digital-asset-source-details';
import type {DigitalAssetEntryData} from '@/lib/guided-digital-asset-facts';
import {actualGuidedDigitalAsset} from '../../fixtures/guided-digital-asset-sources';
it('collects two original rows and clears confirmation when either is edited',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 let latest:DigitalAssetEntryData[]=[];
 function Harness(){const [entries,setEntries]=useState([actualGuidedDigitalAsset()]);return <DigitalAssetSourceCards entries={entries} onChange={value=>{latest=value;setEntries(value);}}/>;}
 async function change(label:string,value:string){
 const field=[...container.querySelectorAll('label')].find(row=>row.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');
 if(!field)throw new Error(`Missing ${label}`);
 const setter=Object.getOwnPropertyDescriptor(field.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set;
 await act(async()=>{setter!.call(field,value);field.dispatchEvent(new Event(field.tagName==='SELECT'?'change':'input',{bubbles:true}));field.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));});
 }
 try{
 await act(async()=>root.render(<Harness/>));await change('DA statement 1 — Actual state reporting','multiple');
 expect(latest[0].stateWithholding).toBeUndefined();
 await change('DA statement 1 state row 1 — Box 14 state code','PA');
 await change('DA statement 1 state row 1 — Box 15 filer state ID','Private PA id');
 await change('DA statement 1 state row 1 — Box 16 state withholding','0.10');
 await change('DA statement 1 state row 2 — Box 14 state code','OH');
 await change('DA statement 1 state row 2 — Original Box 15 state ID is blank','true');
 await change('DA statement 1 state row 2 — Box 16 state withholding','0');
 await change('DA statement 1 — Sources checked after the last edit','true');
 expect(latest[0]).toMatchObject({sourceFactsConfirmed:true,stateWithholding:[{state:'PA',stateIdentificationNumber:'Private PA id',stateWithheld:'0.10'},{state:'OH',stateIdentificationNumberBlank:true,stateWithheld:'0'}]});
 await change('DA statement 1 state row 2 — Box 16 state withholding','0.20');
 expect(latest[0].sourceFactsConfirmed).toBeNull();
 expect(latest[0].stateWithholding?.[0].stateIdentificationNumber).toBe('Private PA id');
 }finally{await act(async()=>root.unmount());container.remove();}
});

it.each(['Retained actual state ID',''])('explicitly removes a retained single-state ID without changing original rows (%j)',async(stateIdentificationNumber)=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const original:DigitalAssetEntryData={...actualGuidedDigitalAsset(),stateTaxReporting:'single',stateIdentificationNumber,stateWithholding:[{state:'PA',stateIdentificationNumber:'Actual PA ID',stateWithheld:'0.10'},{state:'OH',stateIdentificationNumberBlank:true,stateWithheld:'0.20'}],sourceFactsConfirmed:true};
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);let latest=[original];
 function Harness(){const[entries,setEntries]=useState([original]);return <DigitalAssetSourceCards entries={entries} onChange={value=>{latest=value;setEntries(value);}}/>;}
 async function change(label:string,value:string){const field=[...container.querySelectorAll('label')].find(row=>row.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');if(!field)throw new Error(`Missing ${label}`);const setter=Object.getOwnPropertyDescriptor(field.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set;await act(async()=>{setter!.call(field,value);field.dispatchEvent(new Event(field.tagName==='SELECT'?'change':'input',{bubbles:true}));field.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));});}
 try{
  await act(async()=>root.render(<Harness/>));
  expect([...container.querySelectorAll('label')].find(row=>row.querySelector('.guided-field-label')?.textContent==='DA statement 1 — Original single-state Box 15 filer state ID')?.querySelector('input')?.value).toBe(stateIdentificationNumber);
  await change('DA statement 1 — Actual state reporting','multiple');expect(latest[0].stateIdentificationNumber).toBe(stateIdentificationNumber);
  await change('DA statement 1 — Sources checked after the last edit','true');expect(latest[0].sourceFactsConfirmed).toBe(true);
  const remove=[...container.querySelectorAll('button')].find(button=>button.textContent==='Remove single-state ID from DA statement 1');expect(remove).toBeDefined();await act(async()=>remove!.click());
  expect(latest[0].stateIdentificationNumber).toBeUndefined();expect(latest[0].stateWithholding).toEqual(original.stateWithholding);expect(latest[0].transactions).toEqual(original.transactions);expect(latest[0].sourceFactsConfirmed).toBeNull();
 }finally{await act(async()=>root.unmount());container.remove();}
});
