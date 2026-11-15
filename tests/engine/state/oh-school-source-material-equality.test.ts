/** Spec: state/oh-school-source-material-equality.yaml. Compatibility, never a timing assertion. */
import {createHash} from 'node:crypto';
import Decimal from 'decimal.js';
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal.js';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter.js';
import {calculateOhioResidentReturn,type OhioResidentReturnInput} from '@/engine/state/oh-return.js';
import {buildOhioPaymentSource} from '@/engine/state/oh-payment-source.js';
import {buildOhioSchoolDistrictSource} from '@/engine/state/oh-sd-100-sources.js';
import {prepareOhioResidencyReview,resolveOhioResidencyReview,type PreparedOhioResidencyReview} from '@/engine/state/oh-residency-source.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {schoolOfficialFixture,schoolOfficialCases,schoolOfficialOracles} from '../../fixtures/oh-school-district-official-review.js';
import {schoolPyHeaderPacket,schoolPyPaperCases} from '../../fixtures/oh-school-district-part-year-official-review.js';
import {schoolDistrictSourcesFixture,bindSchoolDistrictFixture,type SchoolDistrictFixtureInput} from '../../fixtures/oh-school-district-sources.js';
import {schoolDistrictPartYearFixture} from '../../fixtures/oh-school-district-part-year-sources.js';

function required<T>(value:T|null|undefined):T{if(value==null)throw Error('Explicit fictional original required');return value;}
function record(value:unknown):Record<string,unknown>{if(value===null||typeof value!=='object'||Array.isArray(value))throw Error('Explicit fictional object required');return value as Record<string,unknown>;}
function first(value:unknown):Record<string,unknown>{if(!Array.isArray(value))throw Error('Explicit fictional array required');return record(value[0]);}
function hash(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function copy<T>(value:T):T{
 if(Decimal.isDecimal(value))return new Decimal(value) as T;
 if(Array.isArray(value))return value.map(copy) as T;
 if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,copy(child)])) as T;
 return value;
}
// Full-output baselines rebound only after exact1768448b→835e8972 comparison: HSA audit wording and explicit zero trace additions; all monetary/source commitments unchanged.
const baselineHashes:Readonly<Record<string,string>>={
  "base": "3ccd138bc11907bce4e98591cdb010d953b578e32273f9a97117147bfcde78a4",
  "estimates": "9967ef077232525cecac9d09b5cea81244c540917418b48666989b63fdd48f23",
  "outgoing": "8897326cdac5b33beefc65e19b70d7fc120ae3e56cc0d11ac63f2d765d0b3c15",
  "prior": "f7445312897405e4426d02d07d7bca0bcc791d61e7bc29f947832b6d7152ace6",
  "zero-withholding": "fdd5e54dccd817ae28083d1536f4300fa0df3a78a6145542f660e00ef8c77867",
  "municipal-first": "06fb4f7c2fa3bbcd06e36afe921e88e26ccc0fbd322231503a2409e570b86739",
  "part-year-header-refund100": "4c6457a71adead15b617bc43b8bf3b663a5b48c72f35fb167b971bf33a351dd2",
  "part-year-header-covered": "4ecb41ca030de52874b6915e8fda99ea28e758ff223362c9f43e6bbc27ca0aae"
};
const cases=[...schoolOfficialCases.map(kind=>({name:kind,input:()=>schoolOfficialFixture(kind),itTax:'1767',sdTax:'1000',withheld:schoolOfficialOracles[kind].withheld,refund:schoolOfficialOracles[kind].refund})),...schoolPyPaperCases.map(c=>({name:`part-year-header-${c.name}`,input:()=>schoolPyHeaderPacket(c).withHeader,itTax:'811',sdTax:'500',withheld:c.withheld,refund:c.refund}))];
it.each(cases.map(c=>[c.name,c] as const))('preserves complete school baseline and commitments for %s',(_name,c)=>{
 const input=c.input(),before=copy(input),federal=calculateFederalTax(input),adapted=buildOhioResidentReturnInput(input,federal),state=calculateOhioResidentReturn(adapted),payment=buildOhioPaymentSource(input,input.ohioPayments),school=required(adapted.schoolDistrictSource);
 expect(hash({federal,adapted,state,payment,school})).toBe(required(baselineHashes[c.name]));
 expect([state.it1040.line10_taxAfterCredits,state.sd100?.line8_totalTaxAfterCredits,state.sd100?.line11_sdWithholding,state.sd100?.line21_refund].map(value=>required(value).toString())).toEqual([c.itTax,c.sdTax,c.withheld,c.refund]);
 expect(school.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
 expect(JSON.stringify(state.lines)).toContain(school.sourceDigest);
 expect(JSON.stringify(state.lines)).toContain(payment.sourceDigest);
 expect(input).toEqual(before);
});
const branches=[['full-year',schoolDistrictSourcesFixture],['part-year',schoolDistrictPartYearFixture]] as const;
/** Minimal IT arithmetic context; no prepopulated school/payment projection. Actual sources set all cash. */
function context(input:SchoolDistrictFixtureInput,federal:ReturnType<typeof calculateFederalTax>):OhioResidentReturnInput{return{taxYear:input.taxpayer.taxYear,filingStatus:input.taxpayer.filingStatus,federalAgi:federal.agi,exemptions:1+input.taxpayer.dependents.length};}
function source(input:SchoolDistrictFixtureInput,federal=calculateFederalTax(input)){return buildOhioSchoolDistrictSource(input,federal,context(input,federal));}
function captures(input:SchoolDistrictFixtureInput){return[record(input.ohioSchoolDistrict.originalFederalSources),record(input.ohioResidency.originalFederalSources)];}
function reorder(value:unknown):unknown{
 if(Decimal.isDecimal(value))return value;
 if(Array.isArray(value))return value.map(reorder);
 if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).reverse().map(([key,child])=>[key,reorder(child)]));
 return value;
}
const normalizations=['key-order','undefined-child','decimal-string','array-null','unicode-exact'] as const;
it.each(branches.flatMap(([branch,factory])=>normalizations.map(kind=>[`${branch}/${kind}`,factory,kind] as const)))('preserves full current material normalization for %s',(_name,factory,kind)=>{
 const input=factory();
 if(kind==='array-null')Object.assign(input,{materialProbe:[null]});
 if(kind==='unicode-exact')Object.assign(input,{materialProbe:'Exact Ω 😀 e\u0301 \ud800'});
 bindSchoolDistrictFixture(input);
 const expected=source(input);
 if(kind==='key-order'){
  input.ohioSchoolDistrict.originalFederalSources=record(reorder(input.ohioSchoolDistrict.originalFederalSources));
  input.ohioResidency.originalFederalSources=record(reorder(input.ohioResidency.originalFederalSources));
 }
 if(kind==='undefined-child')for(const capture of captures(input))capture.materialAbsent=undefined;
 if(kind==='decimal-string')for(const capture of captures(input))first(capture.w2s).federalWithheld=new Decimal(required(input.w2s[0]).federalWithheld);
 if(kind==='array-null')for(const capture of captures(input))capture.materialProbe=[undefined];
 const before=copy(input);expect(source(input)).toEqual(expected);expect(input).toEqual(before);
});
const distinctions=['school-missing','school-identity','school-provenance','school-lexeme','residency-missing','residency-identity','array-order','null-present','unicode-surrogate','unicode-normalization','federal-audit','residence-address','lookup-address'] as const;
it.each(branches.flatMap(([branch,factory])=>distinctions.map(kind=>[`${branch}/${kind}`,factory,kind] as const)))('rejects changed current school material for %s',(_name,factory,kind)=>{
 const input=factory();
 if(kind==='array-order')Object.assign(input,{materialProbe:['first','second']});
 if(kind==='unicode-surrogate')Object.assign(input,{materialProbe:'Literal \ud800'});
 if(kind==='unicode-normalization')Object.assign(input,{materialProbe:'Literal é'});
 bindSchoolDistrictFixture(input);
 const federal=calculateFederalTax(input),school=record(input.ohioSchoolDistrict.originalFederalSources),resident=record(input.ohioResidency.originalFederalSources);
 let error=/current private original snapshot/;
 if(kind==='school-missing')Reflect.deleteProperty(input.ohioSchoolDistrict,'originalFederalSources');
 if(kind==='school-missing')error=/complete confirmed actual source facts/;
 if(kind==='school-identity')record(first(school.w2s).employer).name='Same money, different actual employer';
 if(kind==='school-provenance')record(first(school.w2s).stateLocalSources).sourceReference='Different actual printed original';
 if(kind==='school-lexeme')first(school.w2s).federalWithheld=`${required(input.w2s[0]).federalWithheld}.0`;
 if(kind==='residency-missing'){Reflect.deleteProperty(input.ohioResidency,'originalFederalSources');error=/current actual Ohio full-residency source confirmation/;}
 if(kind==='residency-identity'){record(first(resident.w2s).employer).name='Same cash, different retained employer';error=/current actual Ohio full-residency source confirmation/;}
 if(kind==='array-order')school.materialProbe=['second','first'];
 if(kind==='null-present')school.materialProbe=null;
 if(kind==='unicode-surrogate')school.materialProbe='Literal \ufffd';
 if(kind==='unicode-normalization')school.materialProbe='Literal e\u0301';
 if(kind==='federal-audit'){Object.assign(required(federal.allLines[0]),{formula:'Changed complete audit at identical AGI and tax'});error=/saved federal result is stale/;}
 if(kind==='residence-address'){input.ohioSchoolDistrict.residence.originalAddress.street='Different actual street';error=/actual (?:private residence\/lookup address|Ohio home and independent lookup originals)/;}
 if(kind==='lookup-address'){input.ohioSchoolDistrict.residence.lookup.originalAddress.street='Different actual lookup street';error=/actual (?:private residence\/lookup address|Ohio home and independent lookup originals)/;}
 const before=copy(input),beforeFederal=JSON.stringify(federal);
 expect(()=>source(input,federal)).not.toThrow(TypeError);expect(()=>source(input,federal)).toThrow(error);
 expect(input).toEqual(before);expect(JSON.stringify(federal)).toBe(beforeFederal);
});
it.each(branches.map(([name,factory])=>[name,factory] as const))('preserves school original context integrity for %s',(_name,factory)=>{
 const input=factory(),federal=calculateFederalTax(input),before=copy(input),token=prepareOhioResidencyReview(input);
 expect(resolveOhioResidencyReview(input,federal,token)).toEqual(input);
 expect(resolveOhioResidencyReview(redactReviewIdentifiers(input),redactReviewIdentifiers(federal),token)).toEqual(input);
 expect(()=>resolveOhioResidencyReview(input,federal,{} as PreparedOhioResidencyReview)).toThrow(/context/);
 const changed=copy(input);required(changed.w2s[0]).employer.name='Same money new private original';
 expect(()=>resolveOhioResidencyReview(changed,federal,token)).toThrow(/current originals differ/);
 const changedFederal=calculateFederalTax(input);Object.assign(required(changedFederal.allLines[0]),{formula:'Same totals different full audit'});
 expect(()=>resolveOhioResidencyReview(input,changedFederal,token)).toThrow(/saved federal calculation differs/);
 expect(input).toEqual(before);
});
