/** Spec: state/oh-school-source-same-invocation.yaml. Compatibility, not a timing or tax oracle. */
import{expect,it,vi,beforeEach}from'vitest';import{createHash}from'node:crypto';
import{calculateFederalTax}from'@/engine/federal.js';import{buildOhioResidentReturnInput,type OhioOverlayInput}from'@/engine/state/oh-input-adapter.js';import{calculateOhioResidentReturn,type OhioResidentReturnInput}from'@/engine/state/oh-return.js';import{buildOhioPaymentSource}from'@/engine/state/oh-payment-source.js';import{buildOhioSchoolDistrictSource,type OhioSchoolDistrictSourceProjection}from'@/engine/state/oh-sd-100-sources.js';import{buildOhioResidencySource}from'@/engine/state/oh-residency-source.js';
import{schoolOfficialFixture,schoolOfficialCases}from'../../fixtures/oh-school-district-official-review.js';import{schoolDistrictPartYearFixture}from'../../fixtures/oh-school-district-part-year-sources.js';import{schoolBalanceFixture}from'../../fixtures/oh-sd-100-remaining-balance.js';import{schoolDistrictSourcesFixture,schoolDistrictEstimatedFixture}from'../../fixtures/oh-school-district-sources.js';
const work=vi.hoisted(()=>({school:0,payment:0,federal:0,it:0,projections:[] as OhioSchoolDistrictSourceProjection[],dropProjection:false}));
vi.mock('@/engine/federal.js',async original=>{const a=await original<typeof import('@/engine/federal.js')>();return{...a,calculateFederalTax:(...args:Parameters<typeof a.calculateFederalTax>)=>{work.federal++;return a.calculateFederalTax(...args);}};});
vi.mock('@/engine/state/oh-payment-source.js',async original=>{const a=await original<typeof import('@/engine/state/oh-payment-source.js')>();return{...a,buildOhioPaymentSource:(...args:Parameters<typeof a.buildOhioPaymentSource>)=>{work.payment++;return a.buildOhioPaymentSource(...args);}};});
vi.mock('@/engine/state/oh-sd-100-sources.js',async original=>{const a=await original<typeof import('@/engine/state/oh-sd-100-sources.js')>();return{...a,buildOhioSchoolDistrictSource:(...args:Parameters<typeof a.buildOhioSchoolDistrictSource>)=>{work.school++;const projection=a.buildOhioSchoolDistrictSource(...args);work.projections.push(projection);return projection;}};});
vi.mock('@/engine/state/oh-return.js',async original=>{const a=await original<typeof import('@/engine/state/oh-return.js')>();return{...a,calculateOhioResidentReturn:(...args:Parameters<typeof a.calculateOhioResidentReturn>)=>{work.it++;return a.calculateOhioResidentReturn(...args);}};});
vi.mock('@/engine/state/oh-residency-source.js',async original=>{const a=await original<typeof import('@/engine/state/oh-residency-source.js')>();return{...a,buildOhioResidencySource:(...args:Parameters<typeof a.buildOhioResidencySource>)=>{const result=a.buildOhioResidencySource(...args);if(work.dropProjection)Reflect.deleteProperty(result,'schoolDistrictSource');return result;}};});
function reset(){work.it=0;work.school=0;work.payment=0;work.federal=0;work.projections=[];work.dropProjection=false;}
beforeEach(reset);
function required<T>(v:T|null|undefined):T{if(v==null)throw Error('Explicit fixture value required');return v;}
function hash(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function record(v:unknown):Record<string,unknown>{if(v===null||typeof v!=='object'||Array.isArray(v))throw Error('Explicit original required');return v as Record<string,unknown>;}
const cohorts=[...schoolOfficialCases.map(name=>({name:'full-'+name,make:()=>schoolOfficialFixture(name)})),...(['600','500']as const).map(v=>({name:'part-year-'+v,make:()=>schoolDistrictPartYearFixture(v)})),...(['unpaid','expected_payment','actual_payment']as const).map(v=>({name:'balance-'+v,make:()=>schoolBalanceFixture(v)})),{name:'full-nonzero-IT-elections',make:()=>{const x=schoolDistrictSourcesFixture();x.ohioPayments.balanceFacts={...x.ohioPayments.balanceFacts,useTax:'25',outgoingCarryforward:'15',donations:'10'};return x;}},{name:'full-independent-IT-estimates',make:()=>{const x=schoolDistrictEstimatedFixture();x.ohioPayments.paymentRows=structuredClone(x.ohioSchoolDistrict.payments.paymentRows).map((r,i)=>({...r,sourceId:'IT-EST-'+i,returnType:'it1040',original:{...r.original,returnType:'it1040',confirmationNumber:'IT-INDEPENDENT-EST-'+i}}));return x;}}];
// Exact predecessor digests, with the separately asserted federal Schedule A correction below.
const baselineHashes:Readonly<Record<string,string>>={
  "full-base": "15b9b9832bb7fc92b6fdbac7d530d4e8d227f3f3122188b91a6e8425d8a02b98",
  "full-estimates": "91918be151e0e1d24d989c691f525c944cff87cf2f92aaa9696787f4523011be",
  "full-outgoing": "414baacd4b130f0e0085ae938d63358809ff1d6fa1d7e608ca549e3e08f1dd78",
  "full-prior": "c85f5b67cb2c34c2d5ab67aba12b564575636e93cdeb89325436384c271c5b80",
  "full-zero-withholding": "9bbe92bb2ea4b0fde5f21b5a83ed7f66ced602eb0b5bb3c30578223e5597dfb4",
  "full-municipal-first": "02218aa51e470cf8312365bf5c17c6c635bb303fcf204912c8a965ba171d28ba",
  "part-year-600": "16925030665e0082348ab14169be497257e18a2e5917c7877a93d9794ff189d5",
  "part-year-500": "29c9101729a474d8186a55d6de7c5b7330ee195b91bee7858291d08a35d0e802",
  "balance-unpaid": "c851d402b69e35b482f03abedeea2b2882aeb9f2d39b7376e254bc544b7b2012",
  "balance-expected_payment": "2319f26b1d156d1738540a8d2a48c9abd754a35d2069c675f71768723da1218c",
  "balance-actual_payment": "870b1c81a09c23b2018c85257aa38254c99b24bcec0fcb9d0309f0f3e64e0ff7",
  "full-nonzero-IT-elections": "eb92392e9c1483f67009492b6a6de6398083860958a42c03568bf3b234b22dcc",
  "full-independent-IT-estimates": "5427d218dae764edea9bd87b786822123726d525a2a50d609e6d32070051ccb2"
};
const errorOracles=[
  {
    "key": "school-year",
    "message": "Ohio actual school district sources: only the actual2025 school district year method is available",
    "sdCalls": 1
  },
  {
    "key": "school-confirmation",
    "message": "Ohio actual school district sources: complete confirmed actual source facts required (sourceFactsConfirmed: Invalid input: expected true)",
    "sdCalls": 1
  },
  {
    "key": "school-owner",
    "message": "Ohio actual school district sources: current owner identity or birth date differs from actual originals",
    "sdCalls": 1
  },
  {
    "key": "payment-confirmation",
    "message": "Ohio actual payment sources: complete confirmed actual payment records are required",
    "sdCalls": 1
  },
  {
    "key": "snapshot",
    "message": "Ohio actual school district sources: current private original snapshot is missing or changed",
    "sdCalls": 1
  },
  {
    "key": "stale-federal",
    "message": "Ohio actual residency sources: saved federal result is stale",
    "sdCalls": 0
  },
  {
    "key": "residency-confirmation",
    "message": "Ohio actual school district sources: current actual Ohio full-residency source confirmation/snapshot differs",
    "sdCalls": 1
  },
  {
    "key": "overlay",
    "message": "Ohio actual school district sources: finite source-bound return does not accept unbound district or state overrides",
    "sdCalls": 0
  },
  {
    "key": "owner-before-payment",
    "message": "Ohio actual school district sources: current owner identity or birth date differs from actual originals",
    "sdCalls": 1
  },
  {
    "key": "year-before-owner",
    "message": "Ohio actual school district sources: only the actual2025 school district year method is available",
    "sdCalls": 1
  },
  {
    "key": "stale-federal-before-school",
    "message": "Ohio actual residency sources: saved federal result is stale",
    "sdCalls": 0
  },
  {
    "key": "overlay-before-stale",
    "message": "Ohio actual school district sources: finite source-bound return does not accept unbound district or state overrides",
    "sdCalls": 0
  }
];

it.each(cohorts.map(c=>[c.name,c]as const))('reuses only one current school projection for %s',(_name,c)=>{
 const input=c.make(),before=JSON.stringify(input),federal=calculateFederalTax(input),fbefore=JSON.stringify(federal);reset();
 const adapted=buildOhioResidentReturnInput(input,federal);
 // Each of the two fresh federal replays now reads the documented IT receipts for Schedule A.
 const federalReceiptReads=c.name==='full-independent-IT-estimates'?2:0;
 expect({school:work.school,payment:work.payment,federal:work.federal,it:work.it}).toEqual({school:1,payment:2+federalReceiptReads,federal:2,it:1});
 expect(work.projections).toHaveLength(1);expect(adapted.schoolDistrictSource).toBe(work.projections[0]);
 calculateOhioResidentReturn(adapted);expect(work.it).toBe(2); // Independent final IT calculation is retained.
 expect(JSON.stringify(input)).toBe(before);expect(JSON.stringify(federal)).toBe(fbefore);
});
it.each(cohorts.map(c=>[c.name,c]as const))('preserves complete predecessor bytes for %s',(_name,c)=>{
 const input=c.make(),before=JSON.stringify(input),federal=calculateFederalTax(input),fbefore=JSON.stringify(federal);reset();const adapted=buildOhioResidentReturnInput(input,federal);const state=calculateOhioResidentReturn(adapted);const payment=buildOhioPaymentSource(input,input.ohioPayments);
 if(c.name==='full-independent-IT-estimates'){
  expect(hash({input,adapted,state,payment,school:adapted.schoolDistrictSource})).toBe('2576f28e205505a58dfb114cee8fa1bf62b0caa421f204efac275a521aa16f65');
  expect(state.it1040.line15_estimatedPayments.toString()).toBe('400');
  expect(state.it1040.line17_totalPayments.toString()).toBe('3400');
  expect(state.sd100?.line12_estimatedPayments.toString()).toBe('400');
  expect(state.sd100?.line13_totalPayments.toString()).toBe('1000');
  expect(federal.allLines.find(line=>line.form==='Sched A'&&line.line==='5a')?.value.toString()).toBe('3900');
  expect(federal.itemizedDeductions.toString()).toBe('3900');
  expect(federal.deductionUsed).toBe('standard');
  expect(federal.taxableIncome.toString()).toBe('64250');
 }
 expect(hash({input,federal,adapted,state,payment,school:adapted.schoolDistrictSource})).toBe(required(baselineHashes[c.name]));
 expect(JSON.stringify(input)).toBe(before);expect(JSON.stringify(federal)).toBe(fbefore);
});
it.each(errorOracles.map(row=>[row.key,row]as const))('preserves predecessor first-error order for %s',(key,oracle)=>{
 const input=schoolDistrictSourcesFixture(),federal=calculateFederalTax(input);let overlay:OhioOverlayInput={};
 const school=record(input.ohioSchoolDistrict),owner=record(school.owner),identity=record(owner.originalTaxpayer),payments=record(input.ohioPayments),residency=record(input.ohioResidency);
 if(key==='school-year'||key==='year-before-owner')school.taxYear=2026;
 if(key==='school-confirmation')school.sourceFactsConfirmed=false;
 if(['school-owner','owner-before-payment','year-before-owner','stale-federal-before-school','overlay-before-stale'].includes(key))identity.ssn='900-00-0000';
 if(['payment-confirmation','owner-before-payment','year-before-owner','stale-federal-before-school','overlay-before-stale'].includes(key))payments.sourceFactsConfirmed=false;
 if(key==='snapshot')record(school.originalFederalSources).w2s=[];
 if(['stale-federal','stale-federal-before-school','overlay-before-stale'].includes(key))federal.agi=federal.agi.plus(1);
 if(key==='residency-confirmation')residency.allFederalSourcesIncludedConfirmed=false;
 if(key==='overlay'||key==='overlay-before-stale')overlay={useTax:'1'};
 const before=JSON.stringify(input),fbefore=JSON.stringify(federal);reset();let message:string|undefined;
 try{buildOhioResidentReturnInput(input,federal,overlay);}catch(e){if(!(e instanceof Error))throw e;message=e.message;}
 expect(message).toBe(oracle.message);expect(work.school).toBe(oracle.sdCalls);expect(JSON.stringify(input)).toBe(before);expect(JSON.stringify(federal)).toBe(fbefore);
});
it('never reuses a projection across invocations or source edits',()=>{
 const input=schoolDistrictSourcesFixture(),before=JSON.stringify(input),federal=calculateFederalTax(input),fbefore=JSON.stringify(federal);reset();
 const first=required(buildOhioResidentReturnInput(input,federal).schoolDistrictSource),second=required(buildOhioResidentReturnInput(input,federal).schoolDistrictSource);
 expect(work.school).toBe(2);expect(first).not.toBe(second);expect(hash(first)).toBe(hash(second));
 Reflect.set(first.district,'oldProjectionOnly','MUTATED_PREVIOUS_RESULT');
 const third=required(buildOhioResidentReturnInput(input,federal).schoolDistrictSource);expect(JSON.stringify(third)).not.toContain('MUTATED_PREVIOUS_RESULT');
 input.ohioSchoolDistrict.sourceReference+='-new-current-source';
 const changed=required(buildOhioResidentReturnInput(input,federal).schoolDistrictSource);expect(changed.sourceDigest).not.toBe(third.sourceDigest);expect(work.school).toBe(4);
 record(input.ohioSchoolDistrict).sourceFactsConfirmed=false;expect(()=>buildOhioResidentReturnInput(input,federal)).toThrow('complete confirmed actual source facts');expect(work.school).toBe(5);
 record(input.ohioSchoolDistrict).sourceFactsConfirmed=true;input.ohioSchoolDistrict.sourceReference=input.ohioSchoolDistrict.sourceReference.replace('-new-current-source','');
 expect(JSON.stringify(input)).toBe(before);expect(JSON.stringify(federal)).toBe(fbefore);
});
it('keeps standalone source validation fresh',()=>{
 const input=schoolDistrictSourcesFixture(),federal=calculateFederalTax(input),ohio:OhioResidentReturnInput={taxYear:2025,filingStatus:'single',federalAgi:federal.agi,exemptions:1};reset();
 const a=buildOhioSchoolDistrictSource(input,federal,ohio),b=buildOhioSchoolDistrictSource(input,federal,ohio);expect(a).not.toBe(b);expect(hash(a)).toBe(hash(b));expect(work.school).toBe(2);
 const r1=buildOhioResidencySource(input,federal,ohio,input.ohioResidency),r2=buildOhioResidencySource(input,federal,ohio,input.ohioResidency);expect(work.school).toBe(4);expect(r1.schoolDistrictSource).not.toBe(r2.schoolDistrictSource);expect(hash(r1.schoolDistrictSource)).toBe(hash(a));
});
it('rejects a missing current projection without recalculating or accepting caller proof',()=>{
 const input=schoolDistrictSourcesFixture(),federal=calculateFederalTax(input);reset();work.dropProjection=true;
 expect(()=>buildOhioResidentReturnInput(input,federal)).toThrow('current invocation school projection is missing');expect(work.school).toBe(1);
 reset();const forged={schoolDistrictSource:{sourceDigest:'0'.repeat(64)}} as unknown as OhioOverlayInput;
 expect(()=>buildOhioResidentReturnInput(input,federal,forged)).toThrow('does not accept unbound');expect(work.school).toBe(0);
});
