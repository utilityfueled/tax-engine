// @vitest-environment jsdom
/** Spec: state/oh-school-header-native-composition.yaml. Literal source controls before products. */
import React,{useState} from 'react';
import {expect,it} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine';
import {confirmGuidedOhioResidencyFacts} from '@/lib/guided-ohio-residency-facts';
import {confirmGuidedOhioPaymentFacts} from '@/lib/guided-ohio-payment-facts';
import {confirmGuidedOhioSchoolDistrictFacts,buildGuidedOhioSchoolDistrictFacts,type OhioSchoolDistrictDraft} from '@/lib/guided-ohio-school-district-facts';
import {confirmGuidedOhioReturnHeaderSources,buildGuidedOhioReturnHeaderSources,type OhioReturnHeaderDraft} from '@/lib/guided-ohio-return-header-sources';
import {updateSectionData,type StateReturnData} from '@/lib/guided-interview-flow';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {SectionStateReturn} from '@/components/guided-interview/section-state-return';
import {startCompleteInterview} from '../../guided-interview/complete-facts';
import {enteredSchoolDraft} from '../../fixtures/guided-oh-school-district-complete';
import {schoolPyHeaderPacket,schoolPyPaperCases,type SchoolPyPaperCase} from '../../fixtures/oh-school-district-part-year-official-review';
import {ohioReturnHeaderFixture,enteredOhioHeaderDraft} from '../../fixtures/oh-return-header-sources';
import {mountGuidedPanel} from './guided-panel-dom';
function required<T>(v:T|null|undefined):T{if(v==null)throw Error('Complete actual fictional source required');return v;}
function native(c:SchoolPyPaperCase=required(schoolPyPaperCases[0])){
 const source=schoolPyHeaderPacket(c),actual=source.canonical,original=TaxYearInputSchema.parse(source.original);
 const residency=confirmGuidedOhioResidencyFacts(original,{...structuredClone(actual.ohioResidency),taxYear:'2025',sourceFactsConfirmed:null,owners:actual.ohioResidency.owners.map(o=>({...structuredClone(o),stateAdditions:[],stateDeductions:[]}))});
 const payments=confirmGuidedOhioPaymentFacts(original,{...structuredClone(actual.ohioPayments),taxYear:'2025',sourceFactsConfirmed:null,specialFacts:{farmingFishingIncome:'known_none',militaryDisasterRelief:'known_none'}});
 const draft:OhioSchoolDistrictDraft={...enteredSchoolDraft(actual.ohioSchoolDistrict),partYearWageSources:{...structuredClone(actual.ohioSchoolDistrict.partYearWageSources),payrollOriginals:actual.ohioSchoolDistrict.partYearWageSources.payrollOriginals.map(row=>({...structuredClone(row),taxYear:String(row.taxYear)}))}};
 const school=confirmGuidedOhioSchoolDistrictFacts(original,draft,residency,payments),h=structuredClone(source.header);
 const header:OhioReturnHeaderDraft={...h,taxYear:'2025',sourceFactsConfirmed:null,originalFederalSources:undefined,originalOhioResidencySources:undefined,originalOhioPaymentSources:undefined,confirmedHeaderSources:undefined,
 finderOriginal:{...h.finderOriginal,taxYear:'2025'},countyOriginal:{...h.countyOriginal,taxYear:'2025'},officialInventoryOriginal:{...h.officialInventoryOriginal,taxYear:'2025',printedPage:'51'}};
 const data:StateReturnData={stateEstimatedPayments:[],additionalStateWithholding:'',ohioResidency:residency,ohioPayments:payments,ohioSchoolDistrict:school,ohioReturnHeaderSources:header};
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:'OH'});state.sectionData['state-return']=data;
 return{source,original,residency,payments,school,header,data,state};
}
function confirm(f:ReturnType<typeof native>,header=f.header,school:OhioSchoolDistrictDraft|undefined=f.school){return confirmGuidedOhioReturnHeaderSources(f.original,header,f.residency,f.payments,school);}
function replay(f:ReturnType<typeof native>,header:OhioReturnHeaderDraft,school:OhioSchoolDistrictDraft|undefined=f.school){return buildGuidedOhioReturnHeaderSources(f.original,header,f.residency,f.payments,school);}
function money(input:Parameters<typeof calculateFederalTax>[0]){const r=calculateOhioResidentReturnFromFederal({taxInput:input,federalResult:calculateFederalTax(input)}),sd=required(r.sd100);return[r.it1040.line14_ohioWithholding,sd.line7_earnedIncomeTax,sd.line11_sdWithholding,sd.line21_refund].map(v=>v.toString());}
it('Ohio school header baseline preserves existing actual payroll and separate cash',()=>{
 const f=native(),before=structuredClone(f),packet=buildGuidedOhioSchoolDistrictFacts(f.original,f.school,f.residency,f.payments);
 expect(packet.partYearWageSources?.payrollOriginals.map(r=>r.grossWages)).toEqual(['40000','20000']);
 expect(money({...f.original,ohioResidency:f.source.canonical.ohioResidency,ohioPayments:f.source.canonical.ohioPayments,ohioSchoolDistrict:packet})).toEqual(['2000','500','600','100']);
 for(const key of ['ohioResidency','ohioPayments','ohioSchoolDistrict','ohioReturnHeaderSources'])expect(f.original).not.toHaveProperty(key);expect(f).toEqual(before);
});
it('Ohio school header baseline preserves complete native resident credit677',()=>{
 const f=ohioReturnHeaderFixture(),header=confirmGuidedOhioReturnHeaderSources(f.native.input,enteredOhioHeaderDraft(),f.native.residency,f.native.payments),before=structuredClone(header);
 const result=buildGuidedOhioReturnHeaderSources(f.native.input,header,f.native.residency,f.native.payments);
 expect(result.originalOhioResidencySources).toEqual(f.facts);expect(result.originalOhioPaymentSources).toEqual(f.payments);expect(Reflect.get(header,'originalOhioSchoolDistrictSources')).toBeUndefined();
 const current=buildGuidedStateOriginals(f.native.input,f.native.state),ohio=calculateOhioResidentReturnFromFederal({taxInput:current,federalResult:calculateFederalTax(current)});
 expect(ohio.it1040.line26_refund.toString()).toBe('677');expect(header).toEqual(before);
});
it.each(schoolPyPaperCases)('Ohio school header actual mounted caller confirms current school %s',async c=>{
 const f=native(c);let latest=f.state;
 function Harness(){const [state,set]=useState(latest);return <SectionStateReturn stateCode="OH" taxYear={2025} filingStatus="single" originalInput={f.original} data={state.sectionData['state-return']} guidedPreview={null} onDataChange={incoming=>{latest=updateSectionData(state,'state-return',incoming);set(latest);}}/>;}
 const panel=await mountGuidedPanel(<Harness/>);try{
  await panel.click('Confirm actual Ohio resident return header sources');const data=required(latest.sectionData['state-return']);
  expect(data.ohioReturnHeaderSources?.sourceFactsConfirmed).toBe(true);expect(data.ohioSchoolDistrict).toEqual(f.school);expect(data.ohioResidency).toEqual(f.residency);expect(data.ohioPayments).toEqual(f.payments);
  const current=buildGuidedStateOriginals(f.original,latest);expect(current.ohioReturnHeaderSources?.finderOriginal.districtCode).toBe('0302');expect(current.ohioReturnHeaderSources?.countyOriginal.countyName).toBe('Ashland');expect(money(current)).toEqual(['2000','500',c.withheld,c.refund]);
 }finally{await panel.dispose();}
});
it.each(schoolPyPaperCases)('Ohio school header own edit preserves confirmed school %s',c=>{
 const f=native(c),incoming=structuredClone(f.data);required(incoming.ohioReturnHeaderSources).finderOriginal.sourceReference='PRIVATE-NEW-ACTUAL-SUPPLIED-FINDER';const before=structuredClone({state:f.state,incoming});
 const next=required(updateSectionData(f.state,'state-return',incoming).sectionData['state-return']);
 expect(next.ohioReturnHeaderSources?.sourceFactsConfirmed).toBeNull();expect(next.ohioSchoolDistrict).toEqual(f.school);expect(next.ohioResidency).toEqual(f.residency);expect(next.ohioPayments).toEqual(f.payments);expect({state:f.state,incoming}).toEqual(before);
});
it.each(schoolPyPaperCases)('Ohio school header explicit replay captures current child and recovers without refresh %s',c=>{
 const f=native(c),before=structuredClone(f),confirmed=confirm(f),captured=Reflect.get(confirmed,'originalOhioSchoolDistrictSources');
 expect(captured).toEqual(buildGuidedOhioSchoolDistrictFacts(f.original,f.school,f.residency,f.payments));expect(f).toEqual(before);
 const saved:OhioReturnHeaderDraft=JSON.parse(JSON.stringify(confirmed)),old=JSON.stringify(saved),packet=replay(f,saved);expect(packet.finderOriginal.districtCode).toBe('0302');expect(packet.residence.periods).toEqual(f.source.header.residence.periods);expect(JSON.stringify(saved)).toBe(old);
 const incoming={...structuredClone(f.data),ohioReturnHeaderSources:confirmed},next=updateSectionData(f.state,'state-return',incoming);expect(required(next.sectionData['state-return']).ohioReturnHeaderSources).toEqual(confirmed);expect(required(next.sectionData['state-return']).ohioSchoolDistrict).toEqual(f.school);
 const current=buildGuidedStateOriginals(f.original,next);expect(money(current)).toEqual(['2000','500',c.withheld,c.refund]);
});
it('Ohio school header rejects equally paid replacement until explicit reconfirmation',()=>{
 const f=native(),header=confirm(f),old=structuredClone(header),changed=structuredClone(f.school);changed.payments.account.sourceReference='PRIVATE-EQUAL-CASH-NEW-COMPLETE-SCHOOL-ACCOUNT';
 const school=confirmGuidedOhioSchoolDistrictFacts(f.original,changed,f.residency,f.payments);expect(buildGuidedOhioSchoolDistrictFacts(f.original,school,f.residency,f.payments).payments.account.sourceReference).toBe('PRIVATE-EQUAL-CASH-NEW-COMPLETE-SCHOOL-ACCOUNT');
 expect(()=>replay(f,header,school)).toThrow(/school|district/i);expect(header).toEqual(old);const next=confirm(f,header,school);expect(Reflect.get(next,'originalOhioSchoolDistrictSources')).not.toEqual(Reflect.get(header,'originalOhioSchoolDistrictSources'));expect(replay(f,next,school).finderOriginal.districtCode).toBe('0302');expect(header).toEqual(old);
});
it.each(['unknown payroll','unconfirmed school','removed school','stripped capture','federal identity','parent identity','payment identity']as const)('Ohio school header rejects actual missing or stale dependency %s',kind=>{
 const f=native(),header=confirm(f),school=structuredClone(f.school),original=structuredClone(f.original),parent=structuredClone(f.residency),payments=structuredClone(f.payments);
 if(kind==='unknown payroll')required(school.partYearWageSources?.payrollOriginals[0]).grossWages='';
 if(kind==='unconfirmed school')school.sourceFactsConfirmed=null;if(kind==='stripped capture')Reflect.deleteProperty(header,'originalOhioSchoolDistrictSources');
 if(kind==='federal identity')original.taxpayer.primary.lastName='New actual owner';if(kind==='parent identity')parent.sourceReference='PRIVATE-NEW-PARENT';if(kind==='payment identity')payments.sourceReference='PRIVATE-NEW-PAYMENT';
 const before=structuredClone({header,school,original,parent,payments}),read=()=>buildGuidedOhioReturnHeaderSources(original,header,parent,payments,kind==='removed school'?undefined:school);
 expect(read).not.toThrow(TypeError);expect(read).toThrow();expect({header,school,original,parent,payments}).toEqual(before);
});
it.each(['parent','payment','school']as const)('Ohio school header dependency edit invalidates child and header %s',kind=>{
 const f=native(),header=confirm(f);f.data.ohioReturnHeaderSources=header;const incoming=structuredClone(f.data);
 if(kind==='parent')required(incoming.ohioResidency).sourceReference='PRIVATE-EQUAL-CASH-NEW-PARENT';if(kind==='payment')required(incoming.ohioPayments).sourceReference='PRIVATE-EQUAL-CASH-NEW-PAYMENT';if(kind==='school')required(incoming.ohioSchoolDistrict).payments.account.sourceReference='PRIVATE-EQUAL-CASH-NEW-SCHOOL';
 const before=structuredClone({state:f.state,incoming}),next=required(updateSectionData(f.state,'state-return',incoming).sectionData['state-return']);
 expect(next.ohioReturnHeaderSources?.sourceFactsConfirmed).toBeNull();expect(next.ohioSchoolDistrict?.sourceFactsConfirmed).toBeNull();
 for(const key of ['originalFederalSources','originalOhioResidencySources','originalOhioPaymentSources','confirmedHeaderSources']as const)expect(next.ohioReturnHeaderSources?.[key]).toEqual(header[key]);
 expect(Reflect.get(required(next.ohioReturnHeaderSources),'originalOhioSchoolDistrictSources')).toEqual(Reflect.get(header,'originalOhioSchoolDistrictSources'));expect({state:f.state,incoming}).toEqual(before);
});
it('Ohio school header retained canonical child requires actual native originals',()=>{
 const f=native(),input={...f.original,ohioSchoolDistrict:f.source.canonical.ohioSchoolDistrict},before=structuredClone(input);
 expect(()=>confirmGuidedOhioReturnHeaderSources(input,f.header,f.residency,f.payments)).toThrow(/school|district/i);expect(input).toEqual(before);
});
