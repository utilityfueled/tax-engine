/** Spec: state/oh-header-school-native-independent.yaml. Independent source-first; no PDF operation. */
import {expect,it} from 'vitest';
import {TaxYearInputSchema,type TaxYearInput} from '@/models/inputs';
import {OhioReturnHeaderSourcesSchema} from '@/models/ohio-return-header-sources';
import {confirmGuidedOhioResidencyFacts} from '@/lib/guided-ohio-residency-facts';
import {confirmGuidedOhioPaymentFacts} from '@/lib/guided-ohio-payment-facts';
import {confirmGuidedOhioSchoolDistrictFacts,buildGuidedOhioSchoolDistrictFacts,type OhioSchoolDistrictDraft} from '@/lib/guided-ohio-school-district-facts';
import {confirmGuidedOhioReturnHeaderSources,buildGuidedOhioReturnHeaderSources,type OhioReturnHeaderDraft} from '@/lib/guided-ohio-return-header-sources';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {updateSectionData,type StateReturnData} from '@/lib/guided-interview-flow';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine';
import {schoolPyHeaderPacket} from '../../fixtures/oh-school-district-part-year-official-review';
import {enteredSchoolDraft,required} from '../../fixtures/guided-oh-school-district-complete';
import {ohioReturnHeaderFixture,currentHeaderDraft} from '../../fixtures/oh-return-header-sources';
import {startCompleteInterview} from '../../guided-interview/complete-facts';

function actual(withheld:'600'|'500'='600'){
 const f=schoolPyHeaderPacket({name:withheld==='600'?'refund100':'covered',withheld,refund:withheld==='600'?'100':'0'});
 const original=TaxYearInputSchema.parse(f.original),h=OhioReturnHeaderSourcesSchema.parse(f.header),c=f.canonical;
 const residency=confirmGuidedOhioResidencyFacts(original,{...structuredClone(c.ohioResidency),taxYear:'2025',sourceFactsConfirmed:null,owners:c.ohioResidency.owners.map(o=>({...structuredClone(o),stateAdditions:[],stateDeductions:[]}))});
 const payments=confirmGuidedOhioPaymentFacts(original,{...structuredClone(c.ohioPayments),taxYear:'2025',sourceFactsConfirmed:null,specialFacts:{farmingFishingIncome:'known_none',militaryDisasterRelief:'known_none'}});
 const entered={...enteredSchoolDraft(c.ohioSchoolDistrict),partYearWageSources:{...structuredClone(c.ohioSchoolDistrict.partYearWageSources),payrollOriginals:c.ohioSchoolDistrict.partYearWageSources.payrollOriginals.map(r=>({...structuredClone(r),taxYear:String(r.taxYear)}))}};
 const school=confirmGuidedOhioSchoolDistrictFacts(original,entered,residency,payments);
 const header:OhioReturnHeaderDraft={...structuredClone(h),taxYear:'2025',sourceFactsConfirmed:null,originalFederalSources:undefined,originalOhioResidencySources:undefined,originalOhioPaymentSources:undefined,confirmedHeaderSources:undefined,
  finderOriginal:{...h.finderOriginal,taxYear:'2025'},countyOriginal:{...h.countyOriginal,taxYear:'2025'},officialInventoryOriginal:{...h.officialInventoryOriginal,taxYear:'2025',printedPage:'51'}};
 return{f,original,residency,payments,school,header};
}
// Reflect invokes the real existing API with its proposed optional fifth child before implementation;
// it avoids changing that API or pretending baseline types already implement the new contract.
function confirm(f:ReturnType<typeof actual>,header=f.header,school:OhioSchoolDistrictDraft|null=f.school,input=f.original):OhioReturnHeaderDraft{
 return Reflect.apply(confirmGuidedOhioReturnHeaderSources,undefined,[input,header,f.residency,f.payments,school??undefined]);
}
function read(f:ReturnType<typeof actual>,header:OhioReturnHeaderDraft,school:OhioSchoolDistrictDraft|null=f.school,input=f.original){
 return Reflect.apply(buildGuidedOhioReturnHeaderSources,undefined,[input,header,f.residency,f.payments,school??undefined]);
}
function flow(f:ReturnType<typeof actual>,header:OhioReturnHeaderDraft){
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:'OH'});
 const data:StateReturnData={stateEstimatedPayments:[],additionalStateWithholding:'',ohioResidency:f.residency,ohioPayments:f.payments,ohioSchoolDistrict:f.school,ohioReturnHeaderSources:header};
 state.sectionData['state-return']=structuredClone(data);return{state,data};
}
function result(input:TaxYearInput){return calculateOhioResidentReturnFromFederal({taxInput:input,federalResult:calculateFederalTax(input)});}
function cash(input:TaxYearInput,withheld='600'){
 const r=result(input),sd=required(r.sd100);
 expect([r.it1040.line8c_totalTax,r.it1040.line10_taxAfterCredits,r.it1040.line14_ohioWithholding,r.it1040.line26_refund].map(x=>x.toString())).toEqual(['1217','811','2000','1189']);
 expect([sd.line8_totalTaxAfterCredits,sd.line11_sdWithholding,sd.line21_refund].map(x=>x.toString())).toEqual(['500',withheld,withheld==='600'?'100':'0']);
}
it('independent school header canonical source precondition retains811 and500',()=>{
 const f=actual(),before=structuredClone(f);cash(f.f.canonical);expect(buildGuidedOhioSchoolDistrictFacts(f.original,f.school,f.residency,f.payments)).toEqual(f.f.canonical.ohioSchoolDistrict);expect(f).toEqual(before);
});
it.each(['600','500'] as const)('independent school header current native sources retain separate cash %s',withheld=>{
 const f=actual(withheld),before=structuredClone(f),h=confirm(f),ctx=flow(f,h),built=buildGuidedStateOriginals(f.original,ctx.state);
 expect(built.ohioReturnHeaderSources).toEqual(f.f.header);expect(built.ohioSchoolDistrict).toEqual(f.f.canonical.ohioSchoolDistrict);
 expect(Reflect.get(h,'originalOhioSchoolDistrictSources')).toEqual(f.f.canonical.ohioSchoolDistrict);cash(built,withheld);expect(f).toEqual(before);
});
it('independent school header same cash child replacement requires explicit header reconfirmation',()=>{
 const f=actual(),h=confirm(f),changed=structuredClone(f.school);changed.sourceReference='PRIVATE-INDEPENDENT-EQUAL-CASH-SCHOOL';
 const newer=confirmGuidedOhioSchoolDistrictFacts(f.original,changed,f.residency,f.payments),packet=buildGuidedOhioSchoolDistrictFacts(f.original,newer,f.residency,f.payments),before=structuredClone(h);
 expect(packet.sourceReference).toBe(changed.sourceReference);expect(packet.payments).toEqual(f.f.canonical.ohioSchoolDistrict.payments);
 expect(()=>read(f,h,newer)).toThrow();expect(h).toEqual(before);
 const confirmed=confirm(f,h,newer);expect(Reflect.get(confirmed,'originalOhioSchoolDistrictSources')).toEqual(packet);expect(read(f,confirmed,newer).sourceReference).toBe(f.f.header.sourceReference);expect(h).toEqual(before);
});
const badChild=['missing native','pending confirmation','unknown payroll cash','unknown no Ohio services','missing capture','forged capture','stale current employer'] as const;
it.each(badChild)('independent school header rejects changed actual child %s',kind=>{
 const f=actual(),h=confirm(f),school=structuredClone(f.school),input=structuredClone(f.original);
 if(kind==='pending confirmation')school.sourceFactsConfirmed=null;
 if(kind==='unknown payroll cash')required(school.partYearWageSources?.payrollOriginals[0]).grossWages='';
 if(kind==='unknown no Ohio services')required(school.partYearWageSources?.payrollOriginals[1]).noOhioServicesOutsideOhioConfirmed=null;
 if(kind==='missing capture')Reflect.deleteProperty(h,'originalOhioSchoolDistrictSources');
 if(kind==='forged capture')Reflect.set(h,'originalOhioSchoolDistrictSources',{...f.f.canonical.ohioSchoolDistrict,sourceReference:'PRIVATE-FORGED-SCHOOL-CAPTURE'});
 if(kind==='stale current employer')required(input.w2s[0]).employer.name='FICTIONAL SAME CASH INDEPENDENT EMPLOYER';
 const before=structuredClone({f,h,school,input});expect(()=>read(f,h,kind==='missing native'?null:school,input)).toThrow();expect({f,h,school,input}).toEqual(before);
});
it.each(['finder','county'] as const)('independent school header own source edit preserves current school %s',kind=>{
 const f=actual(),h=confirm(f),ctx=flow(f,h),incoming=structuredClone(ctx.data);required(incoming.ohioReturnHeaderSources)[kind==='finder'?'finderOriginal':'countyOriginal'].sourceReference='PRIVATE-NEW-INDEPENDENT-HEADER-ORIGINAL';
 const before=structuredClone(ctx),next=required(updateSectionData(ctx.state,'state-return',incoming).sectionData['state-return']);
 expect(required(next.ohioReturnHeaderSources).sourceFactsConfirmed).not.toBe(true);expect(next.ohioSchoolDistrict).toEqual(ctx.data.ohioSchoolDistrict);expect(next.ohioResidency).toEqual(ctx.data.ohioResidency);expect(next.ohioPayments).toEqual(ctx.data.ohioPayments);
 expect(Reflect.get(required(next.ohioReturnHeaderSources),'originalOhioSchoolDistrictSources')).toEqual(f.f.canonical.ohioSchoolDistrict);expect(ctx).toEqual(before);
});
it('independent school header confirmation-only update preserves confirmed school',()=>{
 const f=actual(),ctx=flow(f,f.header),h=confirm(f),incoming={...ctx.data,ohioReturnHeaderSources:h},next=required(updateSectionData(ctx.state,'state-return',incoming).sectionData['state-return']);
 expect(next.ohioReturnHeaderSources).toEqual(h);expect(next.ohioSchoolDistrict).toEqual(f.school);expect(next.ohioResidency).toEqual(f.residency);expect(next.ohioPayments).toEqual(f.payments);
});
it('independent school header JSON reopen preserves captures and rejects same cash edit',()=>{
 const f=actual(),h=confirm(f),ctx=flow(f,h),saved=JSON.parse(JSON.stringify(ctx.state)),before=JSON.stringify(saved);
 cash(buildGuidedStateOriginals(f.original,saved));expect(JSON.stringify(saved)).toBe(before);
 required(required(saved.sectionData['state-return']).ohioSchoolDistrict).sourceReference='PRIVATE-JSON-EQUAL-CASH-UNREVIEWED';
 const old=JSON.stringify(required(saved.sectionData['state-return']).ohioReturnHeaderSources);expect(()=>buildGuidedStateOriginals(f.original,saved)).toThrow();expect(JSON.stringify(required(saved.sectionData['state-return']).ohioReturnHeaderSources)).toBe(old);
});
it('independent school header retained canonical child cannot bypass missing native draft',()=>{
 const f=actual(),h=confirm(f),input={...f.original,ohioSchoolDistrict:f.f.canonical.ohioSchoolDistrict},before=structuredClone({input,h});
 expect(()=>confirm(f,f.header,null,input)).toThrow();expect(()=>read(f,h,null,input)).toThrow();expect({input,h}).toEqual(before);
});
it('independent school header legacy full year credit remains677 without school',()=>{
 const f=ohioReturnHeaderFixture(),h=currentHeaderDraft(),before=structuredClone(f);expect(buildGuidedOhioReturnHeaderSources(f.native.input,h,f.native.residency,f.native.payments)).toEqual(f.header);
 const current=buildGuidedStateOriginals(f.native.input,f.native.state),r=result(current);expect(current.ohioSchoolDistrict).toBeUndefined();expect([r.it1040.line8c_totalTax,required(r.residentCredit).line7_residentCredit,r.it1040.line26_refund].map(x=>x.toString())).toEqual(['2323','1000','677']);expect(f).toEqual(before);
});
