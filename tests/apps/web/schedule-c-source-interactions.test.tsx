// @vitest-environment jsdom
// Spec: spec/federal/schedule-c.yaml#E-source-interaction.
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {BusinessSourceDetails} from '@/components/guided-interview/business-source-details';
import type {BusinessSourceData} from '@/lib/guided-business-facts';
it('collects actual source facts without inferring interest eligibility or address',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;let latest:BusinessSourceData={};const host=document.createElement('div');document.body.append(host);const root=createRoot(host);function Harness(){const[data,setData]=useState<BusinessSourceData>({});return <BusinessSourceDetails data={data} onChange={value=>{latest=value;setData(value);}}/>;}
 try{await act(async()=>root.render(<Harness/>));const add=[...host.querySelectorAll('button')].find(x=>x.textContent==='Add actual Schedule C interest and address sources');expect(add).toBeDefined();await act(async()=>add!.click());expect(latest.scheduleCSourceFacts!.sourceFactsConfirmed).not.toBe(true);expect(latest.scheduleCSourceFacts!.address).toBeUndefined();expect(host.textContent).toContain('Actual aggregate business interest');expect(host.textContent).not.toContain('automatically eligible');}finally{await act(async()=>root.unmount());host.remove();}
});
