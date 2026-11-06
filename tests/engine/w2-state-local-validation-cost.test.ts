/** Spec: federal/w2-state-local-validation-cost.yaml; software-only source guard preservation. */
import {describe,expect,it,vi} from 'vitest';
import {w2StateLocalFixture} from '../fixtures/w2-state-local.js';
import * as actualSources from '@/engine/forms/w2-state-local.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {AuditTrail} from '@/utils/audit.js';
import {createHash} from 'node:crypto';
const observed=vi.hoisted(()=>({calls:[]as Array<{reads:string[];digest:string}>}));
vi.mock('@/engine/forms/w2-state-local.js',async importOriginal=>{
 const actual=await importOriginal<typeof import('@/engine/forms/w2-state-local.js')>();
 return{...actual,calculateW2StateLocalSources:vi.fn((...args:Parameters<typeof actual.calculateW2StateLocalSources>)=>{
  const result=actual.calculateW2StateLocalSources(...args),entry={reads:[]as string[],digest:result.sourceCommitment};observed.calls.push(entry);
  return new Proxy(result,{get(target,key,receiver){entry.reads.push(String(key));return Reflect.get(target,key,receiver);},ownKeys(target){entry.reads.push('[[OwnKeys]]');return Reflect.ownKeys(target);},getOwnPropertyDescriptor(target,key){entry.reads.push('[[Descriptor]]'+String(key));return Reflect.getOwnPropertyDescriptor(target,key);}});
 })};
});
// Frozen original software result/ordering hashes, not independent tax arithmetic oracles.
const originalSoftwareGoldens=[
 {
  "year": 2025,
  "zero": false,
  "sourceCommitment": "9770e27b33b9fc926d9689942120d7b9226c75086cf159c7d8d427fb00f9ef92",
  "resultJsonSHA256": "1aaff7ac1844c95965272d416c05b6d2af61751bc0220bf585650ffe3c44a1e2"
 },
 {
  "year": 2025,
  "zero": true,
  "sourceCommitment": "6b558fe64d7bea09597c4abef31ab83404019c01f317a5e6c6c9b249e5204862",
  "resultJsonSHA256": "c5f9251c5532965c262625b8d7edfad557e5f9607f03609559d73790a417a615"
 },
 {
  "year": 2026,
  "zero": false,
  "sourceCommitment": "3515dc5f5c8951aa83f71fa28629a3bc2e74f721ed8a57ced4feb54854dd1a5a",
  "resultJsonSHA256": "5210679949146655b5e0cfb7786f2803b688b9eff900947159c51474b515ff70"
 },
 {
  "year": 2026,
  "zero": true,
  "sourceCommitment": "5b4cc86219d46c26b9dadef96b289dffd3dffc79244fd7e8fcf1a18e8b0eccac",
  "resultJsonSHA256": "7c8e970ae19f24e7a009c1af89c26f0ba08153a1d73038f6ec51f8e5079172e9"
 }
];
type Fixture=ReturnType<typeof w2StateLocalFixture>;
function assertSources(f:Fixture):void{
 const assertion=(actualSources as typeof actualSources&{assertW2StateLocalSources?:(...args:Parameters<typeof actualSources.calculateW2StateLocalSources>)=>void}).assertW2StateLocalSources;
 if(!assertion)throw Error('assertW2StateLocalSources implementation missing');
 return assertion(f.input,0,f.sources);
}
function currentW2(f:Fixture){const w2=f.input.w2s[0];if(!w2)throw Error('Synthetic W2 fixture missing');return w2;}
function retained(year=2025){const f=w2StateLocalFixture(year);Object.assign(currentW2(f),{stateLocalSources:f.sources});return f;}
function caught(fn:()=>unknown){try{return{status:'PASS',value:fn()};}catch(e){return{status:'DENY',name:(e as Error).name,message:(e as Error).message};}}
describe('Spec W2 source validation versus required committed result',()=>{
 it('does not discard a calculated W2 source commitment in the public federal guard',()=>{
  const f=retained();observed.calls.length=0;const result=calculateFederalTax(f.input);
  expect(result.taxYear).toBe(2025);
  expect(observed.calls.length).toBeGreaterThan(0);
  expect(observed.calls.every(call=>/^[a-f0-9]{64}$/.test(call.digest))).toBe(true);
  expect(observed.calls.filter(call=>call.reads.length===0)).toHaveLength(0);
 });
 it('keeps the full federal 2026 route unavailable after validating originals',()=>{expect(()=>calculateFederalTax(retained(2026).input)).toThrow(/2026/);});
 it('preserves original committed bytes and key order for supported years and verified zero',()=>{
  for(const year of[2025,2026])for(const zero of[false,true]){
   const f=retained(year);
   if(zero){Object.assign(currentW2(f),{wages:'0',federalWithheld:'0',stateWages:'0',stateTaxWithheld:'0',localWages:'0',localTaxWithheld:'0'});for(const row of[...f.sources.stateRows,...f.sources.localRows]){row.wages='0';row.withheld='0';}const original={...currentW2(f)};delete original.stateLocalSources;f.sources.originalW2=structuredClone(original);}
   const before=structuredClone(f),next=actualSources.calculateW2StateLocalSources(f.input,0,f.sources),original=originalSoftwareGoldens.find(row=>row.year===year&&row.zero===zero);
   if(!original)throw Error('Original software preservation golden missing');
   expect(createHash('sha256').update(JSON.stringify(next)).digest('hex')).toBe(original.resultJsonSHA256);expect(Object.keys(next)).toEqual(['federalWages','federalWithheld','stateRows','localRows','totalStateWithheld','totalLocalWithheld','sourceCommitment','lines']);expect(next.sourceCommitment).toBe(original.sourceCommitment);expect(assertSources(f)).toBeUndefined();expect(f).toEqual(before);
  }
 });
 const failures:Array<[string,(f:Fixture)=>void]>=[
  ['unknown confirmation',f=>{f.sources.sourceFactsConfirmed=null as unknown as true;}],
  ['stale owner',f=>{f.input.taxpayer.primary.lastName='Changed';}],
  ['stale original',f=>{currentW2(f).employer.ein='98-7654321';}],
  ['negative actual row',f=>{const row=f.sources.stateRows[0];if(!row)throw Error('Synthetic state row missing');row.withheld='-0.01';}],
  ['unknown amount',f=>{const row=f.sources.localRows[0];if(!row)throw Error('Synthetic local row missing');row.withheld='';}],
  ['unrelated BigInt',f=>{Object.assign(f.input,{extraSerializationProbe:1n});}],
  ['unrelated cycle',f=>{Object.assign(f.input,{extraSerializationProbe:f.input});}],
  ['throwing enumerable getter',f=>{Object.defineProperty(f.input,'extraSerializationProbe',{enumerable:true,get(){throw new Error('SYNTHETIC_SERIALIZATION_REFUSAL');}});}],
  ['missing original federal amount',f=>{const w2=currentW2(f)as{federalWithheld?:string};delete w2.federalWithheld;const original=f.sources.originalW2;if(!original)throw Error('Synthetic original W2 missing');delete original.federalWithheld;}],
  ['final original amount becomes unknown after encoding',f=>{let reads=0;Object.defineProperty(currentW2(f),'federalWithheld',{enumerable:true,get(){return++reads<=2?'5000':undefined;}});}],
 ];
 it.each(failures)('preserves baseline refusals and observable serialization order: %s',(_name,mutate)=>{
  for(const year of[2025,2026]){
   const old=retained(year),next=retained(year);mutate(old);mutate(next);
   const expected=caught(()=>actualSources.calculateW2StateLocalSources(old.input,0,old.sources));expect(expected.status).toBe('DENY');expect(caught(()=>assertSources(next))).toEqual(expected);
  }
 });
 it('retains full raw source bytes and validates the exact v1 commitment with an independent hash',()=>{
  const f=retained(),encode=TextEncoder.prototype.encode,encoded:string[]=[];
  const spy=vi.spyOn(TextEncoder.prototype,'encode').mockImplementation(function(this:InstanceType<typeof TextEncoder>,value?:string){if(value?.includes('w2-state-local-source-v1'))encoded.push(value);return encode.call(this,value);});
  try{
   const result=actualSources.calculateW2StateLocalSources(f.input,0,f.sources);expect(encoded).toHaveLength(1);const bytes=encoded[0];if(bytes===undefined)throw Error('Synthetic encoded source missing');
   expect(bytes).toContain('"version":"w2-state-local-source-v1"');expect(bytes).toContain('"rawSources":');expect(bytes).toContain(f.sources.sourceReference);
   expect(result.sourceCommitment).toBe(createHash('sha256').update(bytes,'utf8').digest('hex'));
   encoded.length=0;expect(assertSources(f)).toBeUndefined();expect(encoded).toEqual([bytes]);
  }finally{spy.mockRestore();}
 });
 it('retains baseline serialization audit final-amount and getLines order',()=>{
  const originalEncode=TextEncoder.prototype.encode,originalRecord=AuditTrail.prototype.record,originalLines=AuditTrail.prototype.getLines;let events:string[]=[];
  const encode=vi.spyOn(TextEncoder.prototype,'encode').mockImplementation(function(this:InstanceType<typeof TextEncoder>,value?:string){events.push('encode');return originalEncode.call(this,value);});
  const record=vi.spyOn(AuditTrail.prototype,'record').mockImplementation(function(this:AuditTrail,...args:Parameters<typeof originalRecord>){events.push('audit-record');return originalRecord.apply(this,args);});
  const lines=vi.spyOn(AuditTrail.prototype,'getLines').mockImplementation(function(this:AuditTrail){events.push('getLines');return originalLines.call(this);});
  const fixture=()=>{const f=retained();let reads=0;Object.defineProperty(currentW2(f),'federalWithheld',{enumerable:true,get(){events.push('original-amount-read-'+(++reads));return'5000';}});return f;};
  try{
   const old=fixture();events=[];actualSources.calculateW2StateLocalSources(old.input,0,old.sources);const expected=[...events];
   const next=fixture();events=[];assertSources(next);expect(events).toEqual(expected);expect(events).toEqual(['original-amount-read-1','original-amount-read-2','encode','audit-record','audit-record','original-amount-read-3','getLines']);
  }finally{encode.mockRestore();record.mockRestore();lines.mockRestore();}
 });
});
