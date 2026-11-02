// @vitest-environment jsdom
// Spec: spec/federal/k1-form461-classification.yaml#profitable-c-k1-guide.
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {K1LossSourceDetails} from '@/components/guided-interview/k1-loss-source-details';
import {cK1GuidedFixture} from '../../fixtures/c-k1-ordinary';
it('exposes explicit C source facts without inferring domestic proof and invalidates edits',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const data=cK1GuidedFixture().sectionData.adjustments!.k1LossSources!;delete data.form461Classification!.scheduleCSource;
 let latest=data;const element=document.createElement('div');document.body.appendChild(element);const root=createRoot(element);
 function Harness(){const[value,setValue]=useState(data);return <K1LossSourceDetails data={value} onChange={next=>{if(!next)throw new Error('Unexpected removal');latest=next;setValue(next);}}/>;}
 try{await act(async()=>root.render(<Harness/>));
  const button=[...element.querySelectorAll('button')].find(x=>x.textContent==='Add actual Schedule C classification source');expect(button).toBeDefined();await act(async()=>button!.click());
  expect(latest.form461Classification!.scheduleCSource!.allIncomeDomesticConfirmed).toBeUndefined();
  const control=(label:string)=>{const field=[...element.querySelectorAll('label')].find(x=>x.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');if(!field)throw new Error(label);return field;};
  expect(control('Schedule C classification all income is domestic').value).toBe('');
  const field=control('Schedule C classification source reference');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'Actual changed ledger');field.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(latest.form461Classification!.scheduleCSource!.sourceReference).toBe('Actual changed ledger');expect(latest.form461Classification!.sourceFactsConfirmed).toBeNull();expect(latest.sourceFactsConfirmed).toBeNull();
 }finally{await act(async()=>root.unmount());element.remove();}
});

it('collects actual NEC linkage with unknown relationship and source status',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;const initial=cK1GuidedFixture().sectionData.adjustments!.k1LossSources!;let latest=initial;const element=document.createElement('div');document.body.appendChild(element);const root=createRoot(element);function Harness(){const[value,setValue]=useState(initial);return <K1LossSourceDetails data={value} onChange={next=>{if(!next)throw new Error('Unexpected removal');latest=next;setValue(next);}}/>;}
 const click=async(text:string)=>{const b=[...element.querySelectorAll('button')].find(x=>x.textContent===text);expect(b).toBeDefined();await act(async()=>b!.click());};
 try{await act(async()=>root.render(<Harness/>));await click('Add actual NEC receipt reconciliation');expect(latest.form461Classification!.scheduleCSource!.necReceipts!.sourceFactsConfirmed).toBeUndefined();await click('Add original NEC receipt linkage');const row=latest.form461Classification!.scheduleCSource!.necReceipts!.rows![0];expect(row.sameBusinessConfirmed).toBeUndefined();expect(row.includedOnceConfirmed).toBeUndefined();expect(row.payerTinStatus).toBeUndefined();expect(row.currentOriginalNoCorrectionsOrVoidsConfirmed).toBeUndefined();expect(element.textContent).not.toContain('JSON');expect(element.textContent).toContain('Entered NEC source 1 (blank cards skipped)');expect(element.textContent).toContain('Receipt link numbers count nonblank NEC entries in business-income order, ignoring entirely blank cards. They can differ from the card numbers shown there.');}finally{await act(async()=>root.unmount());element.remove();}
});
