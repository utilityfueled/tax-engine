// @vitest-environment jsdom
// Spec: spec/state/pa-married-native-browser.yaml. Actual shell status mapping, no mocked handler.
import React,{useState} from 'react';
import {expect,it} from 'vitest';
import {SectionStateReturn} from '@/components/guided-interview/section-state-return';
import {mapFilingStatus} from '@/lib/guided-interview-bridge';
import type {StateReturnData} from '@/lib/guided-interview-flow';
import {guidedPAMarriedNativeFixture} from '../../fixtures/guided-pa-married-native';
import {mountGuidedPanel} from './guided-panel-dom';
const add='Add married Pennsylvania household sources';
async function mount(status:string,initial?:StateReturnData){
 const f=guidedPAMarriedNativeFixture('M','whole');let latest=initial,changes=0;
 function Harness(){const[data,setData]=useState(initial);return <SectionStateReturn stateCode="PA" taxYear={2025} filingStatus={status} originalInput={f.input} ordinaryOriginalInput={f.input} data={data} guidedPreview={null} onDataChange={next=>{latest=next;changes++;setData(next);}}/>;}
 const panel=await mountGuidedPanel(<Harness/>);
 return{panel,current:()=>latest,changes:()=>changes};
}
function buttons(h:Awaited<ReturnType<typeof mount>>,name:string){return [...h.panel.container.querySelectorAll('button')].filter(node=>node.textContent===name);}
it('actual shell normalized MFJ status exposes blank married source origin',async()=>{
 const status=mapFilingStatus('mfj');expect(status).toBe('married_filing_jointly');const h=await mount(status);
 try{expect(h.changes()).toBe(0);expect(h.current()).toBeUndefined();expect(buttons(h,add)).toHaveLength(1);expect(buttons(h,'Add Pennsylvania residency sources')).toHaveLength(0);await h.panel.click(add);const draft=h.current()?.paMarriedOrdinarySources;expect(draft).toMatchObject({sourceTaxYear:null,filingMode:'',owners:[],wages:[],dispositions:[],originalFederalSources:{},sourceFactsConfirmed:null});expect((h.panel.control('Married PA source tax year')as HTMLInputElement).value).toBe('');expect((h.panel.control('Actual married Pennsylvania filing choice')as HTMLSelectElement).value).toBe('');expect(h.panel.container.querySelector('textarea,input[type="hidden"]')).toBeNull();}finally{await h.panel.dispose();}
});
it('legacy raw MFJ status retains blank married source origin',async()=>{
 const h=await mount('mfj');try{expect(h.changes()).toBe(0);expect(h.current()).toBeUndefined();expect(buttons(h,add)).toHaveLength(1);expect(buttons(h,'Add Pennsylvania residency sources')).toHaveLength(0);}finally{await h.panel.dispose();}
});
it('actual single status without married originals retains ordinary collector',async()=>{
 const h=await mount(mapFilingStatus('single'));try{expect(h.changes()).toBe(0);expect(h.current()).toBeUndefined();expect(buttons(h,add)).toHaveLength(0);expect(buttons(h,'Add Pennsylvania residency sources')).toHaveLength(1);expect(h.panel.container.querySelector('[aria-label="Married Pennsylvania household sources"]')).toBeNull();}finally{await h.panel.dispose();}
});
it('retained married originals remain visible under a changed current status',async()=>{
 const f=guidedPAMarriedNativeFixture('M','whole'),initial=structuredClone(f.state.sectionData['state-return']);if(!initial?.paMarriedOrdinarySources)throw Error('Actual retained fictional married originals required');const snapshot=structuredClone(initial),h=await mount(mapFilingStatus('single'),initial);
 try{expect(h.changes()).toBe(0);expect(h.current()).toEqual(snapshot);expect(buttons(h,add)).toHaveLength(0);expect(buttons(h,'Add Pennsylvania residency sources')).toHaveLength(0);expect(h.panel.container.querySelectorAll('[aria-label="Married Pennsylvania household sources"]')).toHaveLength(1);expect(h.panel.container.textContent).toContain('Taylor');expect(h.panel.container.textContent).toContain('Robin');expect(h.current()?.paMarriedOrdinarySources?.wages.map(row=>[row.original.wages,row.original.stateTaxWithheld])).toEqual([['50000','1535'],['30000','921']]);expect(h.current()).toEqual(snapshot);}finally{await h.panel.dispose();}
});
