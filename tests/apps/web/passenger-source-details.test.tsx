// @vitest-environment jsdom
// spec/federal/passenger-native-source-collector.yaml#native-controls
import {act,useState} from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {BusinessSourceDetails} from '@/components/guided-interview/business-source-details';
import {captureGuidedPassengerSources,buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {updateSectionData} from '@/lib/guided-interview-flow';
import {TaxYearInputSchema} from '@/models/inputs';
import {calculateScheduleC} from '@/engine/schedules/schedule-c';
import {passengerNativeFixture} from '../../fixtures/passenger-native';
import {mountGuidedPanel} from './guided-panel-dom';
afterEach(()=>vi.unstubAllGlobals());
it('real native passenger entry captures all actual originals and revokes a changed reference',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const f=passengerNativeFixture(),target=structuredClone(f.draft);delete f.facts.passengerSources;delete f.facts.depreciationMethod;let current=f.state;
 function Harness(){const[state,set]=useState(current);const facts=state.sectionData['income-self-employment']?.businessFacts;return <BusinessSourceDetails data={facts} onCapturePassenger={businessFacts=>captureGuidedPassengerSources({...state,sectionData:{...state.sectionData,'income-self-employment':{...f.se,businessFacts}}})} onChange={businessFacts=>{current=updateSectionData(state,'income-self-employment',{...f.se,businessFacts});set(current);}}/>;}
 const panel=await mountGuidedPanel(<Harness/>);
 try{
 await panel.change('Depreciation source method','passenger');expect(current.sectionData['income-self-employment']?.businessFacts?.passengerSources).toBeUndefined();expect(buildTaxInputFromGuidedData(current)).toBeNull();
 for(let i=0;i<6;i++)await panel.click('Add actual expense classification (all six required)');await panel.click('Record reviewed empty NEC inventory');
 const leaves:Array<[string,unknown]>=[];function walk(v:unknown,path:string[]=[]){if(v!==null&&typeof v==='object'){for(const[k,x]of Object.entries(v))walk(x,[...path,k]);}else leaves.push([path.join('.'),v]);}walk(target);
 for(const[path,value]of leaves){if(path==='sourceFactsConfirmed'||value===undefined||value===null)continue;const wrapper=[...panel.container.querySelectorAll<HTMLElement>('[data-passenger-path]')].find(n=>n.dataset.passengerPath===path);if(!wrapper)throw new Error('Actual native control missing for '+path);const field=wrapper.querySelector<HTMLInputElement|HTMLSelectElement>('input,select');if(!field)throw new Error('Actual native control input missing for '+path);const proto=field instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;if(!setter)throw new Error('Actual setter missing');await act(async()=>{setter.call(field,String(value));field.dispatchEvent(new Event(field instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});}
 expect(current.sectionData['income-self-employment']?.businessFacts?.passengerSources?.originalInput).toBeUndefined();
 await panel.click('Capture and confirm complete passenger sources after the last edit');expect(buildTaxInputFromGuidedData(current)).toBeNull();
 await panel.change('Have you reconciled every actual source, owner, year and eligibility fact in this Schedule C packet?','true');await panel.change('Have you reconciled receipts with all source forms and excluded duplicate income from the manual total?','true');await panel.change('Have you checked every expense amount, business use and deduction qualification against the records?','true');
 await panel.click('Capture and confirm complete passenger sources after the last edit');
 const d=current.sectionData['income-self-employment']?.businessFacts?.passengerSources;expect(d?.sourceFactsConfirmed).toBe(true);const raw=buildTaxInputFromGuidedData(current);expect(raw).not.toBeNull();const input=TaxYearInputSchema.parse(raw);expect(calculateScheduleC(input,input.scheduleC).netProfit.toString()).toBe('3775');const original=structuredClone(d?.originalInput);
 const unchanged=JSON.stringify(d);await act(async()=>{const field=panel.control('Actual gross Cost Basis');field.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));});expect(JSON.stringify(current.sectionData['income-self-employment']?.businessFacts?.passengerSources)).toBe(unchanged);
 await panel.change('invoice Reference','different-original-same-cash');expect(current.sectionData['income-self-employment']?.businessFacts?.passengerSources?.sourceFactsConfirmed).toBeNull();expect(current.sectionData['income-self-employment']?.businessFacts?.passengerSources?.originalInput).toEqual(original);expect(buildTaxInputFromGuidedData(current)).toBeNull();
 }finally{await panel.dispose();}
});
