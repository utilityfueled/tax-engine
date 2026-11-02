// @vitest-environment jsdom
// Spec: state/pa-ordinary-return-facts.yaml guide-ui.
import React,{act,useState} from 'react';import {createRoot} from 'react-dom/client';import {it,expect} from 'vitest';
import {PAOrdinaryReturnDetails} from '@/components/guided-interview/pa-ordinary-return-details';
import {PAOrdinaryReturnFactsSchema,type PAOrdinaryReturnFacts} from '@/models/pa-ordinary-return-facts.js';
import {paOrdinaryReturnFactsFixture} from '../../fixtures/pa-ordinary-return-facts.js';
it('PA ordinary UI preserves unknown drafts and invalidates edits',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const {input,facts}=paOrdinaryReturnFactsFixture();const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);let latest:PAOrdinaryReturnFacts|undefined;
 function Harness(){const[data,setData]=useState<PAOrdinaryReturnFacts>();return <PAOrdinaryReturnDetails originalInput={input} data={data} onChange={next=>{latest=next;setData(next);}}/>;}
 try{
  await act(async()=>root.render(<Harness/>));const add=[...container.querySelectorAll('button')].find(b=>b.textContent==='Add Pennsylvania return facts');if(!add)throw new Error('Missing PA return source control');await act(async()=>add.click());
  expect(latest?.sourceFactsConfirmed).toBeNull();expect(latest?.sourceTaxYear).toBeNull();expect(latest?.timing.asOfDate).toBe('');expect(latest?.useTax.status).toBe('');expect(latest?.payments.allPaymentsIncludedConfirmed).toBeNull();
  await act(async()=>root.render(<PAOrdinaryReturnDetails originalInput={input} data={PAOrdinaryReturnFactsSchema.parse(facts)} onChange={next=>{latest=next;}}/>));
  const label=[...container.querySelectorAll('label')].find(l=>l.querySelector('.guided-field-label')?.textContent==='PA return original source reference');const field=label?.querySelector('input');if(!field)throw new Error('Missing actual source reference');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(!setter)throw new Error('Missing native setter');
  await act(async()=>{setter.call(field,'Changed actual reference');field.dispatchEvent(new Event('input',{bubbles:true}));});expect(latest?.sourceFactsConfirmed).toBeNull();expect(latest?.owner.originalTaxpayer).toEqual(facts.owner.originalTaxpayer);
 }finally{await act(async()=>root.unmount());container.remove();}
});
