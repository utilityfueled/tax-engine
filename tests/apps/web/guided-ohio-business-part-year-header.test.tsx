// @vitest-environment jsdom
/** Spec: state/oh-business-part-year-header.yaml. Real mounted existing native controls. */
import React,{useState} from 'react';
import {expect,it,vi} from 'vitest';
import {OhioReturnHeaderDetails} from '@/components/guided-interview/ohio-return-header-details';
import {confirmGuidedOhioReturnHeaderSources,buildGuidedOhioReturnHeaderSources,type OhioReturnHeaderDraft} from '@/lib/guided-ohio-return-header-sources';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {mountGuidedPanel} from './guided-panel-dom';
import {julyNativeFixture,julyEnteredHeader,julyHeaderNativeFields,julyRequired} from '../../fixtures/oh-business-part-year-header';
import {ohioHeaderLabels as L} from '../../fixtures/oh-return-header-sources';
async function mounted(initial?:OhioReturnHeaderDraft){const f=julyNativeFixture();let latest=initial,updates=0;function Harness(){const[data,set]=useState(initial);return<OhioReturnHeaderDetails originalInput={f.input} ohioResidency={f.residency} ohioPayments={f.payments} data={data} taxYear={2025} onChange={next=>{updates++;latest=next;set(next);}}/>;}return{f,panel:await mountGuidedPanel(<Harness/>),value:()=>julyRequired(latest),optional:()=>latest,updates:()=>updates};}
function confirmed(){const f=julyNativeFixture();return confirmGuidedOhioReturnHeaderSources(f.input,julyEnteredHeader(),f.residency,f.payments);}
it('July business native blank confirmation preserves actual unknowns',async()=>{
 const h=await mounted();try{expect(h.optional()).toBeUndefined();expect(h.updates()).toBe(0);await h.panel.click(L.add);expect(h.value().taxYear).toBe('');expect(h.value().finderOriginal.districtCode).toBe('');await h.panel.click(L.confirm);expect(h.value().sourceFactsConfirmed).not.toBe(true);expect(h.value().countyOriginal.countyName).toBe('');expect(h.value().originalFederalSources).toBeUndefined();expect(h.value().originalOhioResidencySources).toBeUndefined();expect(h.value().confirmedHeaderSources).toBeUndefined();}finally{await h.panel.dispose();}
});
it('July business native actual source entry confirms current212-day originals',async()=>{
 const request=vi.fn(()=>{throw Error('Actual private sources never leave native panel');});vi.stubGlobal('fetch',request);const h=await mounted();try{
  await h.panel.click(L.add);await h.panel.click('Add actual Ohio residential period');for(const[label,value]of julyHeaderNativeFields())await h.panel.change(label,value);await h.panel.click(L.confirm);
  expect(h.value().sourceFactsConfirmed).toBe(true);expect(h.value().originalFederalSources).toEqual(h.f.input);expect(h.value().originalOhioResidencySources).toEqual(h.f.facts);expect(h.value().originalOhioPaymentSources).toEqual(h.f.paid);
  const before=structuredClone(h.value()),saved=JSON.parse(JSON.stringify(before))as OhioReturnHeaderDraft,source=buildGuidedOhioReturnHeaderSources(h.f.input,saved,h.f.residency,h.f.payments);expect(source.residence.periods).toEqual([{from:'2025-01-01',through:'2025-07-31',sourceReference:'PRIVATE-JULY212-ACTUAL-OH-RESIDENCE'}]);expect(source.finderOriginal.districtCode).toBe('2503');expect(saved).toEqual(JSON.parse(JSON.stringify(before)));
  const state=structuredClone(h.f.state);julyRequired(state.sectionData['state-return']).ohioReturnHeaderSources=saved;const raw=buildGuidedStateOriginals(h.f.input,state);expect(raw.ohioReturnHeaderSources).toEqual(source);expect(raw.ohioResidency?.businessSources).toEqual(h.f.facts.businessSources);expect(h.panel.container.querySelector('textarea')).toBeNull();expect(h.panel.container.textContent).not.toContain('900-74-0421');expect(request).not.toHaveBeenCalled();
 }finally{await h.panel.dispose();vi.unstubAllGlobals();}
});
it('July business native same-cell edit remains stale through JSON reopen until reconfirmed',async()=>{
 const initial=confirmed(),before=structuredClone(initial),h=await mounted(initial);let saved:OhioReturnHeaderDraft|undefined;
 try{await h.panel.change(L.finderSource,'PRIVATE-JULY212-REPLACEMENT-SAME-JURISDICTION');expect(h.value().sourceFactsConfirmed).not.toBe(true);expect(h.value().confirmedHeaderSources).toEqual(before.confirmedHeaderSources);expect(h.value().originalFederalSources).toEqual(before.originalFederalSources);saved=JSON.parse(JSON.stringify(h.value()))as OhioReturnHeaderDraft;expect(()=>buildGuidedOhioReturnHeaderSources(h.f.input,saved,h.f.residency,h.f.payments)).toThrow();expect(initial).toEqual(before);}finally{await h.panel.dispose();}
 const reopened=await mounted(julyRequired(saved));try{expect(reopened.updates()).toBe(0);const stale=structuredClone(reopened.value());await reopened.panel.click(L.confirm);expect(reopened.value().sourceFactsConfirmed).toBe(true);expect(reopened.value().confirmedHeaderSources).toMatchObject({finderOriginal:{sourceReference:'PRIVATE-JULY212-REPLACEMENT-SAME-JURISDICTION'}});expect(buildGuidedOhioReturnHeaderSources(reopened.f.input,reopened.value(),reopened.f.residency,reopened.f.payments).finderOriginal.districtCode).toBe('2503');expect(saved).toEqual(stale);}finally{await reopened.panel.dispose();}
});
it('July business native remount never captures current originals',async()=>{
 const initial=confirmed(),before=structuredClone(initial),h=await mounted(initial);try{expect(h.updates()).toBe(0);await h.panel.render(<OhioReturnHeaderDetails originalInput={h.f.input} ohioResidency={h.f.residency} ohioPayments={h.f.payments} data={initial} taxYear={2025} onChange={()=>{throw Error('Read cannot capture new originals');}}/>);expect(initial).toEqual(before);expect(h.updates()).toBe(0);}finally{await h.panel.dispose();}
});
it.each(['missing business child','unconfirmed parent','unconfirmed payment','missing confirmed pair','changed paired source','changed currentC']as const)('July business native read rejects stale actual dependencies %s',kind=>{
 const f=julyNativeFixture(),draft=confirmed();if(kind==='missing business child')Reflect.deleteProperty(f.residency,'businessSources');if(kind==='unconfirmed parent')f.residency.sourceFactsConfirmed=null;if(kind==='unconfirmed payment')f.payments.sourceFactsConfirmed=null;if(kind==='missing confirmed pair')draft.confirmedHeaderSources=undefined;if(kind==='changed paired source')draft.finderOriginal.sourceReference='PRIVATE-PENDING-SAME-CELLS';if(kind==='changed currentC')julyRequired(f.input.scheduleC).businessName='Same money different original';const before=structuredClone({f,draft});expect(()=>buildGuidedOhioReturnHeaderSources(f.input,draft,f.residency,f.payments)).toThrow();expect({f,draft}).toEqual(before);
});
