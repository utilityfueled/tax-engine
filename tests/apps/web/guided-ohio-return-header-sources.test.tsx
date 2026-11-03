// @vitest-environment jsdom
/** Spec: state/oh-return-header-sources.yaml. Source-first pure/native contracts; no future-module diagnostics count as behavioral RED. */
import React,{useState} from 'react';
import type {TaxYearInput} from '@/models/inputs';
import {expect,it,vi} from 'vitest';
import {OhioReturnHeaderDetails} from '@/components/guided-interview/ohio-return-header-details';
import {emptyOhioReturnHeaderDraft,confirmGuidedOhioReturnHeaderSources,buildGuidedOhioReturnHeaderSources} from '@/lib/guided-ohio-return-header-sources';
import {confirmGuidedOhioPaymentFacts} from '@/lib/guided-ohio-payment-facts';
import {confirmGuidedOhioResidentCreditSources} from '@/lib/guided-ohio-resident-credit-sources';
import {mountGuidedPanel} from './guided-panel-dom';
import {ohioReturnHeaderFixture,enteredOhioHeaderDraft,currentHeaderDraft,ohioHeaderLabels as L,ohioHeaderNativeFields,requiredHeader} from '../../fixtures/oh-return-header-sources';
import {ohioNavigationHeaderParent,ohioNavigationHeaderPayments} from '../../fixtures/oh-return-header-sources';
it('Ohio header draft empty and pending JSON records remain unknown',()=>{
 const empty=emptyOhioReturnHeaderDraft();expect(empty.taxYear).toBe('');expect(empty.owner.accountHolder).toBe('');expect(empty.sourceFactsConfirmed).not.toBe(true);expect(empty.originalFederalSources).toBeUndefined();expect(empty.originalOhioPaymentSources).toBeUndefined();expect(empty.confirmedHeaderSources).toBeUndefined();expect(empty.finderOriginal.districtCode).toBe('');expect(empty.countyOriginal.countyName).toBe('');expect(empty.finderOriginal.schoolIncomeTax).toBe('');expect(empty.officialInventoryOriginal.rateDisplay).toBe('');
 const draft=enteredOhioHeaderDraft();draft.finderOriginal.districtCode='';draft.countyOriginal.countyName='';const saved=JSON.parse(JSON.stringify(draft)),before=structuredClone(saved);expect(saved.officialInventoryOriginal.rateDisplay).toBe('-');expect(saved.finderOriginal.districtCode).toBe('');expect(()=>buildGuidedOhioReturnHeaderSources(ohioReturnHeaderFixture().original,saved,ohioNavigationHeaderParent(),ohioNavigationHeaderPayments())).toThrow();expect(saved).toEqual(before);
});
it('Ohio header explicit confirmation binds current originals without read refresh',()=>{
 const f=ohioReturnHeaderFixture(),draft=enteredOhioHeaderDraft(),parent=ohioNavigationHeaderParent(),payments=ohioNavigationHeaderPayments(),before=structuredClone({f,draft,parent,payments});
 const confirmed=confirmGuidedOhioReturnHeaderSources(f.original,draft,parent,payments);expect(confirmed.sourceFactsConfirmed).toBe(true);expect(confirmed.originalFederalSources).toEqual(f.original);expect(confirmed.originalOhioResidencySources).toEqual(f.facts);expect(confirmed.originalOhioPaymentSources).toEqual(f.payments);expect(confirmed.confirmedHeaderSources).toEqual(f.header);
 const saved=JSON.parse(JSON.stringify(confirmed)),savedBefore=structuredClone(saved);expect(buildGuidedOhioReturnHeaderSources(f.original,saved,parent,payments)).toEqual(f.header);expect(saved).toEqual(savedBefore);expect({f,draft,parent,payments}).toEqual(before);
});
it.each(['missing capture','missing confirmed pair','changed paired draft','owner edit','current W2 edit','current residency edit','unconfirmed parent'] as const)('Ohio header draft denies stale or naked confirmation %s',kind=>{
 const f=ohioReturnHeaderFixture(),d=currentHeaderDraft(),parent=ohioNavigationHeaderParent(),payments=ohioNavigationHeaderPayments();if(kind==='missing capture')d.originalFederalSources=undefined;if(kind==='missing confirmed pair')d.confirmedHeaderSources=undefined;if(kind==='changed paired draft')d.finderOriginal.sourceReference='Different retained actual lookup';if(kind==='owner edit')f.original.taxpayer.primary.lastName='Changed current owner';if(kind==='current W2 edit'){const w=requiredHeader(f.original.w2s[0]);w.employer.name='Changed current same-money employer';}if(kind==='current residency edit')parent.sourceReference='Changed current domicile original';if(kind==='unconfirmed parent')parent.sourceFactsConfirmed=null;
 const before=structuredClone({f,d,parent,payments});expect(()=>buildGuidedOhioReturnHeaderSources(f.original,d,parent,payments)).toThrow();expect({f,d,parent,payments}).toEqual(before);
});
async function mounted(initial:ReturnType<typeof enteredOhioHeaderDraft>|undefined){
 const f=ohioReturnHeaderFixture(),parent=ohioNavigationHeaderParent(),payments=ohioNavigationHeaderPayments();let latest=initial,updates=0;
 function Harness(){const[data,set]=useState(initial);return <OhioReturnHeaderDetails originalInput={f.original} ohioResidency={parent} ohioPayments={payments} data={data} taxYear={2025} onChange={next=>{updates++;latest=next;set(next);}}/>;}
 return{f,parent,payments,panel:await mountGuidedPanel(<Harness/>),data:()=>requiredHeader(latest),optional:()=>latest,updates:()=>updates};
}
it('Ohio header panel complete native source entry confirms explicit originals',async()=>{
 const request=vi.fn(()=>{throw Error('Native header sources cannot transfer to a provider');});vi.stubGlobal('fetch',request);const h=await mounted(undefined);try{expect(h.optional()).toBeUndefined();expect(h.updates()).toBe(0);await h.panel.click(L.add);expect(h.data().taxYear).toBe('');expect(h.data().sourceFactsConfirmed).not.toBe(true);await h.panel.click('Add actual Ohio residential period');for(const[label,value]of ohioHeaderNativeFields())await h.panel.change(label,value);await h.panel.click(L.confirm);expect(h.data().sourceFactsConfirmed).toBe(true);expect(buildGuidedOhioReturnHeaderSources(h.f.original,h.data(),h.parent,h.payments)).toEqual(h.f.header);expect(h.panel.container.querySelector('textarea')).toBeNull();expect(h.panel.container.textContent).not.toContain(h.f.input.taxpayer.primary.ssn);expect(request).not.toHaveBeenCalled();}finally{await h.panel.dispose();vi.unstubAllGlobals();}
});
it('Ohio header panel blank failed confirmation retains all unknown facts',async()=>{
 const h=await mounted(undefined);try{await h.panel.click(L.add);await h.panel.click(L.confirm);expect(h.data().sourceFactsConfirmed).not.toBe(true);expect(h.data().finderOriginal.districtCode).toBe('');expect(h.data().countyOriginal.countyName).toBe('');expect(h.data().originalFederalSources).toBeUndefined();expect(h.data().originalOhioPaymentSources).toBeUndefined();expect(h.data().confirmedHeaderSources).toBeUndefined();}finally{await h.panel.dispose();}
});
const edits=[[L.source,'Different actual header source'],[L.asOf,'2026-04-02'],[L.firstName,'Robin Changed'],[L.street,'Different actual residential original'],[L.finderDate,'2026-03-21'],[L.finderSource,'Different equal-jurisdiction lookup'],[L.district,'0302'],[L.countyName,'Delaware'],[L.inventoryRate,'.0125'],[L.complete,'false'],[L.finderMatched,'false'],[L.inventoryReviewed,'false']] as const;
it.each(edits)('Ohio header panel edit preserves old originals and clears confirmation %s',async(label,value)=>{
 const initial=currentHeaderDraft(),before=structuredClone(initial),h=await mounted(initial);try{await h.panel.change(label,value);expect(h.data().sourceFactsConfirmed).not.toBe(true);expect(h.data().originalFederalSources).toEqual(before.originalFederalSources);expect(h.data().originalOhioResidencySources).toEqual(before.originalOhioResidencySources);expect(h.data().originalOhioPaymentSources).toEqual(before.originalOhioPaymentSources);expect(h.data().confirmedHeaderSources).toEqual(before.confirmedHeaderSources);expect(initial).toEqual(before);}finally{await h.panel.dispose();}
});
it('Ohio header panel save and remount preserve pending actual records',async()=>{
 const d=enteredOhioHeaderDraft();d.finderOriginal.districtCode='';d.countyOriginal.countyName='';const saved=JSON.parse(JSON.stringify(d)),before=structuredClone(saved),h=await mounted(saved);try{expect(h.updates()).toBe(0);expect(h.data()).toEqual(saved);await h.panel.click(L.confirm);expect(h.data().sourceFactsConfirmed).not.toBe(true);expect(h.data().finderOriginal.districtCode).toBe('');expect(h.data().countyOriginal.countyName).toBe('');expect(h.data().officialInventoryOriginal.rateDisplay).toBe('-');expect(saved).toEqual(before);}finally{await h.panel.dispose();}
});
it('Ohio header panel read remount never emits new source snapshots',async()=>{
 const d=currentHeaderDraft(),before=structuredClone(d),h=await mounted(d);try{expect(h.updates()).toBe(0);await h.panel.render(<OhioReturnHeaderDetails originalInput={h.f.original} ohioResidency={h.parent} ohioPayments={h.payments} data={d} taxYear={2025} onChange={()=>{throw Error('Read cannot replace actual sources');}}/>);expect(d).toEqual(before);expect(h.updates()).toBe(0);}finally{await h.panel.dispose();}
});

const nativeDependencies=['missing payments','unconfirmed payments','reconfirmed equal-money payment original','unconfirmed resident credit','reconfirmed equal-money resident credit original','retained canonical credit missing native child'] as const;
it.each(nativeDependencies)('Ohio header requires complete current native payment and credit replay %s',kind=>{
 const f=ohioReturnHeaderFixture(),d=currentHeaderDraft(),parent=ohioNavigationHeaderParent();let payments:ReturnType<typeof ohioNavigationHeaderPayments>|undefined=ohioNavigationHeaderPayments();let original:TaxYearInput=f.original;
 if(kind==='missing payments')payments=undefined;
 if(kind==='unconfirmed payments')requiredHeader(payments).sourceFactsConfirmed=null;
 if(kind==='reconfirmed equal-money payment original'){const changed=requiredHeader(payments);changed.sourceReference='PRIVATE-EXPLICIT-REPLACEMENT-SAME-CASH-OH-PAYMENT-ORIGINAL';payments=confirmGuidedOhioPaymentFacts(original,changed);}
 if(kind==='unconfirmed resident credit')requiredHeader(parent.residentCreditSources).sourceFactsConfirmed=null;
 if(kind==='reconfirmed equal-money resident credit original'){const child=requiredHeader(parent.residentCreditSources);child.sourceReference='PRIVATE-EXPLICIT-REPLACEMENT-SAME-MONEY-VA-SOURCE';parent.residentCreditSources=confirmGuidedOhioResidentCreditSources(original,child,parent,payments);}
 if(kind==='retained canonical credit missing native child'){original={...original,ohioResidency:structuredClone(f.facts),ohioPayments:structuredClone(f.payments)};Reflect.deleteProperty(parent,'residentCreditSources');}
 const before=structuredClone({original,d,parent,payments});expect(()=>buildGuidedOhioReturnHeaderSources(original,d,parent,payments)).toThrow();expect({original,d,parent,payments}).toEqual(before);
});
