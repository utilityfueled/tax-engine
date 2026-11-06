// @vitest-environment jsdom
/** Spec: state/oh-return-header-sources.yaml. Existing imports only; future modules intentionally absent. */
import React,{useState} from 'react';
import {expect,it} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine';
import {lookupOhioSchoolDistrictMetadata,lookupOhioSchoolDistrictNumberByName} from '@/engine/state/oh-school-district-lookup';
import {SectionStateReturn} from '@/components/guided-interview/section-state-return';
import type {StateReturnData} from '@/lib/guided-interview-flow';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {mountGuidedPanel} from './guided-panel-dom';
import {guidedOhioNavigationFixture} from '../../fixtures/guided-ohio-source-navigation';
import {ohioReturnHeaderFixture,ohioHeaderLabels,requiredHeader} from '../../fixtures/oh-return-header-sources';
it('Ohio header existing source baseline preserves exact RC arithmetic and official district identity',()=>{
 const f=ohioReturnHeaderFixture(),before=structuredClone(f),fed=calculateFederalTax(f.input),oh=calculateOhioResidentReturnFromFederal({taxInput:f.input,federalResult:fed});
 expect(fed.agi.toString()).toBe('100000');expect(oh.it1040.line8c_totalTax.toString()).toBe('2323');expect(requiredHeader(oh.residentCredit).line7_residentCredit.toString()).toBe('1000');expect(oh.it1040.line26_refund.toString()).toBe('677');
 expect(lookupOhioSchoolDistrictNumberByName('Columbus CSD')).toBe('2503');expect(lookupOhioSchoolDistrictMetadata(2025,'2503')).toBeNull();expect(f.header.officialInventoryOriginal).toMatchObject({taxYear:2025,printedPage:50,districtCode:'2503',rateDisplay:'-',taxBaseDisplay:'-'});
 expect(f.header.residence.originalAddress.street).not.toBe(f.input.taxpayer.address.street);expect(f).toEqual(before);
});
it('Ohio header existing canonical API preserves complete actual header originals',()=>{
 const f=ohioReturnHeaderFixture(),input={...f.input,ohioReturnHeaderSources:f.header},before=structuredClone(input),parsed=TaxYearInputSchema.parse(input);
 expect(Reflect.get(parsed,'ohioReturnHeaderSources')).toEqual(f.header);expect(input).toEqual(before);
});
it.each(['unknown year','unknown district','unknown county','false confirmation'] as const)('Ohio header existing canonical API rejects malformed present header %s',kind=>{
 const f=ohioReturnHeaderFixture(),h=structuredClone(f.header);if(kind==='unknown year')Reflect.deleteProperty(h,'taxYear');if(kind==='unknown district')h.finderOriginal.districtCode='';if(kind==='unknown county')h.countyOriginal.countyName='';if(kind==='false confirmation')h.sourceFactsConfirmed=false;
 const input={...f.input,ohioReturnHeaderSources:h},before=structuredClone(input);expect(TaxYearInputSchema.safeParse(input).success).toBe(false);expect(input).toEqual(before);
});
it('Ohio header existing section offers absent native source origination',async()=>{
 const f=guidedOhioNavigationFixture();let latest=f.data;
 function Harness(){const[data,set]=useState(f.data);return <SectionStateReturn stateCode="OH" taxYear={2025} filingStatus="single" originalInput={f.original} data={data} guidedPreview={null} onDataChange={(next:StateReturnData)=>{latest=next;set(next);}}/>;}
 const p=await mountGuidedPanel(<Harness/>);try{expect(Reflect.get(latest,'ohioReturnHeaderSources')).toBeUndefined();await p.click(ohioHeaderLabels.add);const d=requiredHeader(Reflect.get(latest,'ohioReturnHeaderSources'));expect(d.taxYear).toBe('');expect(d.sourceFactsConfirmed).not.toBe(true);expect(d.originalFederalSources).toBeUndefined();expect(d.finderOriginal.districtCode).toBe('');expect(d.countyOriginal.countyName).toBe('');}finally{await p.dispose();}
});

it('Ohio header current native baseline retains full resident credit replay and original677',()=>{
 const f=ohioReturnHeaderFixture(),before=structuredClone(f.native),current=buildGuidedStateOriginals(f.native.input,f.native.state),facts=requiredHeader(current.ohioResidency),payments=requiredHeader(current.ohioPayments),child=requiredHeader(facts.residentCreditSources);
 expect(facts).toEqual(f.facts);expect(payments).toEqual(f.payments);expect(child).toEqual(f.source);expect(f.header.originalOhioResidencySources).toEqual(facts);expect(f.header.originalOhioPaymentSources).toEqual(payments);
 expect(child.filedReturn.incomeTaxedByVirginia).toBe('60000');expect(child.completedAccount.netIncomeTax).toBe('1000');expect(child.completedAccount.payments).toHaveLength(1);expect(child.completedAccount.refunds).toHaveLength(1);
 const federal=calculateFederalTax(current),ohio=calculateOhioResidentReturnFromFederal({taxInput:current,federalResult:federal});expect(requiredHeader(ohio.residentCredit).line7_residentCredit.toString()).toBe('1000');expect(ohio.it1040.line10_taxAfterCredits.toString()).toBe('1323');expect(ohio.it1040.line14_ohioWithholding.toString()).toBe('2000');expect(ohio.it1040.line26_refund.toString()).toBe('677');expect(f.native).toEqual(before);
});
