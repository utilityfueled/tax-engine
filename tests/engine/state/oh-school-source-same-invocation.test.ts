/** Spec: state/oh-school-source-same-invocation.yaml. Compatibility, not a timing or tax oracle. */
import{expect,it,vi,beforeEach}from'vitest';import{createHash}from'node:crypto';
import{calculateFederalTax}from'@/engine/federal.js';import{buildOhioResidentReturnInput,type OhioOverlayInput}from'@/engine/state/oh-input-adapter.js';import{calculateOhioResidentReturn,type OhioResidentReturnInput}from'@/engine/state/oh-return.js';import{buildOhioPaymentSource}from'@/engine/state/oh-payment-source.js';import{buildOhioSchoolDistrictSource,type OhioSchoolDistrictSourceProjection}from'@/engine/state/oh-sd-100-sources.js';import{buildOhioResidencySource}from'@/engine/state/oh-residency-source.js';
import{schoolOfficialFixture,schoolOfficialCases}from'../../fixtures/oh-school-district-official-review.js';import{schoolDistrictPartYearFixture}from'../../fixtures/oh-school-district-part-year-sources.js';import{schoolBalanceFixture}from'../../fixtures/oh-sd-100-remaining-balance.js';import{schoolDistrictSourcesFixture,schoolDistrictEstimatedFixture}from'../../fixtures/oh-school-district-sources.js';
import{assertOhioSchoolFederalDelta}from'../../fixtures/oh-school-federal-schedule-a-predecessor.js';
const work=vi.hoisted(()=>({school:0,payment:0,federal:0,it:0,projections:[] as OhioSchoolDistrictSourceProjection[],dropProjection:false}));
// All fixture federal calculations, including the private preliminary and final passes, validate payment originals once.
vi.mock('@/engine/forms/federal-payment-date-sources.js',async original=>{const a=await original<typeof import('@/engine/forms/federal-payment-date-sources.js')>();return{...a,assertFederalPaymentSources:(...args:Parameters<typeof a.assertFederalPaymentSources>)=>{work.federal++;return a.assertFederalPaymentSources(...args);}};});
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
// Earlier full returns compared with 5a8384ec for Schedule B Part III.
// aa2d431bc → 182f240a7 complete-byte replay: only 20 numeric NRC audit rows
// disappear from each full-resident state result; both part-year cases are unchanged.
// All original source commitments and every other output byte are retained.
const baselineHashes:Readonly<Record<string,string>>={
  "full-base": "2892295d5ca111b86e010e61d71179895873e8ebb80cb8f7b2d8c659020a6baf",
  "full-estimates": "5d93bf0158d41e79415cef0594a3bea6a96eb2cddb9453b104eef8cda9365774",
  "full-outgoing": "b8932b361fbe306fc01c82c991ca03d11af90bdd4075ed753937ce3da87d8e3c",
  "full-prior": "02bc6f941c0e5bf0b50505aba1d37320ca9e77cd72818fc51b87ef62e1a1c808",
  "full-zero-withholding": "15d281af9ec4c40170586f194ddab7dea8ce42cfa0cedb510a91e69c5af7373c",
  "full-municipal-first": "b231193b5b396db9423036591ea7322bde7913a9fcbd3f2d38f4037902c403db",
  "part-year-600": "c0e51ae1b0500b7d254c25d512972341b971d2b8fd7621585f577cfebf8b60d8",
  "part-year-500": "412a9c187c54f8698235bfb9ac62b392e0339be9d83243ae2d76673577499435",
  "balance-unpaid": "ee3d44ebb9bdb0fa01f0ff224ea117e1be2b58ce1f6932836c0f1835e842a334",
  "balance-expected_payment": "e4017a08d389eea112aa938466f57e74492f3d9ec20b5ff56e519f07a8206a96",
  "balance-actual_payment": "fd45d2c6ebaedb3426a142a51e5bfe13b9d8fbc6ffaefeb0367adc231daa8f18",
  "full-nonzero-IT-elections": "b57e0f891b86b6bed9bf6b74ca0fb6453ce41c257cc290253a23f7f73e7b0758",
  "full-independent-IT-estimates": "5789c8e422941c7b3c40e6e0536392a19ce5150c4ba6d7a1662f5bfbdd595021"
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
  expect(hash({input,adapted,state,payment,school:adapted.schoolDistrictSource})).toBe('4d8dfc6791436639efd81c5ed16f3a2b3ba25b240634a8e52a7eba4f2c5f10f3');
  expect(state.it1040.line15_estimatedPayments.toString()).toBe('400');
  expect(state.it1040.line17_totalPayments.toString()).toBe('3400');
  expect(state.sd100?.line12_estimatedPayments.toString()).toBe('400');
  expect(state.sd100?.line13_totalPayments.toString()).toBe('1000');
  expect(federal.allLines.find(line=>line.form==='Sched A'&&line.line==='5a')?.value.toString()).toBe('4200');
  expect(federal.itemizedDeductions.toString()).toBe('4200');
  expect(federal.deductionUsed).toBe('standard');
  expect(federal.taxableIncome.toString()).toBe('64250');
 }
 const predecessorFederal=assertOhioSchoolFederalDelta(input,federal,c.name.replace(/^full-/, ''));
 expect(hash({input,federal:predecessorFederal,adapted,state,payment,school:adapted.schoolDistrictSource})).toBe(required(baselineHashes[c.name]));
 if(predecessorFederal!==federal) expect(() => buildOhioResidentReturnInput(input,predecessorFederal)).toThrow('saved federal result is stale');
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
