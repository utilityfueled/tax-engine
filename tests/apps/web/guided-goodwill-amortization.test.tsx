// @vitest-environment jsdom
// Spec: spec/federal/guided-goodwill-amortization.yaml#source-origination.
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {BusinessSourceDetails} from '@/components/guided-interview/business-source-details';
it('offers actual goodwill source entry without hidden source defaults',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<BusinessSourceDetails data={{}} onChange={()=>{}}/>));
 expect([...host.querySelectorAll('button')].some(button=>button.textContent==='Add acquired-goodwill originals')).toBe(true);
 expect(host.textContent).toContain('Actual business and expense facts');
 }finally{await act(async()=>root.unmount());host.remove();}
});

import {useState} from 'react';
import type {BusinessSourceData} from '@/lib/guided-business-facts';
import {buildGuidedGoodwill,goodwillCollectionQuestions,goodwillRowQuestions} from '@/lib/guided-goodwill-amortization';
import {goodwillFacts} from '../../fixtures/guided-goodwill-amortization';
function required<T,>(v:T|null|undefined):T{if(v==null)throw Error('Missing actual UI control');return v;}
it('captures typed currency originals and invalidates edits without monetary math',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let latest=goodwillFacts();
 function Harness(){const[data,setData]=useState<BusinessSourceData>(latest);return <BusinessSourceDetails data={data} onChange={v=>{latest=v;setData(v);}}/>;}
 const button=(name:string)=>required([...host.querySelectorAll('button')].find(b=>b.textContent===name));
 const control=(name:string)=>required([...host.querySelectorAll('label')].find(l=>l.querySelector('.guided-field-label')?.textContent===name)?.querySelector('input,select')) as HTMLInputElement|HTMLSelectElement;
 async function enter(name:string,value:string){const field=control(name),proto=field instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;await act(async()=>{required(Object.getOwnPropertyDescriptor(proto,'value')?.set).call(field,value);field.dispatchEvent(new Event(field instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});}
 try{await act(async()=>root.render(<Harness/>));await act(async()=>button('Add acquired-goodwill originals').click());expect(latest.goodwillAmortization).toEqual({});expect(control('Goodwill original tax year').value).toBe('');
 await act(async()=>button('Add goodwill original').click());
 for(const [label,value]of [['Goodwill original tax year','2025'],['Complete goodwill inventory reference','PRIVATE-DOM-INVENTORY'],['Goodwill ledger remaining nonamortization other expenses','500'],['Goodwill remaining expense ledger reference','PRIVATE-DOM-REMAINDER'],['Goodwill 1 original reference','PRIVATE-DOM-ASSET'],['Goodwill 1 actual description','Actual cash acquired goodwill'],['Goodwill 1 acquired basis','18000.15'],['Goodwill 1 acquisition date','2025-07-15'],['Goodwill 1 business-start date','2025-01-01'],['Goodwill 1 original amortization start month (YYYY-MM)','2025-07']])await enter(label,value);
 const basis=control('Goodwill 1 acquired basis');await act(async()=>{basis.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));});expect(required(latest.goodwillAmortization).rows?.[0]?.basis).toBe('18,000.15');
 for(const label of [...Object.values(goodwillCollectionQuestions),...Object.values(goodwillRowQuestions)])await enter(label,'true');
 await act(async()=>button('Confirm complete goodwill originals').click());expect(latest.goodwillAmortization?.sourceFactsConfirmed).toBe(true);
 await enter('Have you reconciled every actual source, owner, year and eligibility fact in this Schedule C packet?','true');await enter('Have you checked every expense amount, business use and deduction qualification against the records?','true');expect(latest.goodwillAmortization?.sourceFactsConfirmed).toBe(true);expect(required(buildGuidedGoodwill(latest,2025,'500')).total.toFixed()).toBe('600');
 await enter('Goodwill 1 acquired basis','');expect(latest.goodwillAmortization?.sourceFactsConfirmed).toBeNull();expect(required(latest.goodwillAmortization).rows?.[0]?.basis).toBe('');expect(()=>buildGuidedGoodwill(latest,2025,'500')).toThrow();
 await enter('Goodwill 1 acquired basis','0');await act(async()=>button('Confirm complete goodwill originals').click());await enter('Have you reconciled every actual source, owner, year and eligibility fact in this Schedule C packet?','true');expect(required(buildGuidedGoodwill(latest,2025,'500')).total.toFixed()).toBe('0');
 await enter('Actual business activity','Changed actual business');expect(latest.goodwillAmortization?.sourceFactsConfirmed).toBeNull();expect(host.textContent).toContain('PA requires its own independent basis method');
 }finally{await act(async()=>root.unmount());host.remove();}
});
