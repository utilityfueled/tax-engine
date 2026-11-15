/** Spec: federal/w2-validation-only-callers.yaml; software parity, not a new tax oracle. */
import {beforeEach,expect,it,vi} from 'vitest';
import {validateSection} from '@/lib/guided-interview-flow';
import {guidedActualW2Fixture} from '../../fixtures/guided-w2-actual-rows';
import {ohioPaymentFixture} from '../../fixtures/oh-payments';
import {w2StateLocalFixture} from '../../fixtures/w2-state-local';
import {buildOhioPaymentSource} from '@/engine/state/oh-payment-source.js';
import {assertW2StateLocalSources,calculateW2StateLocalSources} from '@/engine/forms/w2-state-local';
vi.mock('@/engine/forms/w2-state-local',async original=>{
 const actual=await original<typeof import('@/engine/forms/w2-state-local')>();
 return {...actual,assertW2StateLocalSources:vi.fn(actual.assertW2StateLocalSources),calculateW2StateLocalSources:vi.fn(actual.calculateW2StateLocalSources)};
});
beforeEach(()=>vi.clearAllMocks());
function legacyGuard(){vi.mocked(assertW2StateLocalSources).mockImplementationOnce((...args)=>{calculateW2StateLocalSources(...args);});}
function observe<T>(run:()=>T){try{return {value:run()};}catch(error){return {error:error instanceof Error?error.message:String(error)};}}
function payment(){
 const input=ohioPaymentFixture(),sources=w2StateLocalFixture().sources,w2=input.w2s[0];
 sources.owner.originalTaxpayer={firstName:input.taxpayer.primary.firstName,lastName:input.taxpayer.primary.lastName,ssn:input.taxpayer.primary.ssn};
 sources.originalW2=structuredClone(w2);sources.stateReporting='single';sources.stateRows=[{...sources.stateRows[0],state:'OH',wages:'100000',withheld:'0'}];sources.localReporting='none';sources.localRows=[];
 w2.stateLocalSources=sources;
 const {ohioResidency:_r,ohioPayments:_p,...original}=input;input.ohioPayments.originalFederalSources=structuredClone(original);return {input,sources};
}
it('guided section validates original rows without a discarded commitment',()=>{
 for(const mutation of ['valid','owner','year','row','confirmation']as const){
  const f=guidedActualW2Fixture();if(mutation==='owner')f.sources.owner.originalTaxpayer.lastName='Different';if(mutation==='year')f.sources.sourceTaxYear=2026;if(mutation==='row')f.sources.stateRows[0].wages='';if(mutation==='confirmation')f.sources.sourceFactsConfirmed=false;
  const before=structuredClone(f.state);vi.clearAllMocks();const actual=validateSection(f.state,'income-w2');
  const guardCalls=mutation==='year'||mutation==='confirmation'?0:1;
  expect(calculateW2StateLocalSources).not.toHaveBeenCalled();expect(assertW2StateLocalSources,mutation).toHaveBeenCalledTimes(guardCalls);
  expect(actual.status).toBe(mutation==='valid'?'complete':'partial');if(mutation!=='valid')expect(Object.keys(actual.fieldErrors).length).toBeGreaterThan(0);
  // Year/confirmation already refuse in the unchanged earlier guide check.
  if(guardCalls)legacyGuard();expect(validateSection(f.state,'income-w2')).toEqual(actual);expect(calculateW2StateLocalSources).toHaveBeenCalledTimes(guardCalls);expect(f.state).toEqual(before);
 }
});
it('Ohio payment evidence retains its own exact digest without discarded W2 commitments',()=>{
 for(const mutation of ['valid','owner','year','row','confirmation']as const){
  const f=payment();if(mutation==='owner')f.sources.owner.originalTaxpayer.lastName='Different';if(mutation==='year')f.sources.sourceTaxYear=2026;if(mutation==='row')f.sources.stateRows[0].wages='';if(mutation==='confirmation')f.sources.sourceFactsConfirmed=false;
  // Bind the full edited original so each contradiction reaches the W2 guard,
  // rather than failing the earlier complete account-snapshot comparison.
  const {ohioResidency:_r,ohioPayments:_p,...original}=f.input;f.input.ohioPayments.originalFederalSources=structuredClone(original);
  const before=structuredClone(f.input);vi.clearAllMocks();const actual=observe(()=>buildOhioPaymentSource(f.input,f.input.ohioPayments));
  expect(calculateW2StateLocalSources).not.toHaveBeenCalled();expect(assertW2StateLocalSources,mutation).toHaveBeenCalledTimes(1);
  if(mutation==='valid'){expect(actual.value?.sourceDigest).toMatch(/^[a-f0-9]{64}$/);expect(actual.value?.estimatedPayments.toFixed()).toBe('0');}else expect(actual.error).toMatch(/W-2 actual row sources/);
  legacyGuard();const previous=observe(()=>buildOhioPaymentSource(f.input,f.input.ohioPayments));expect(previous).toEqual(actual);expect(JSON.stringify(previous)).toBe(JSON.stringify(actual));expect(calculateW2StateLocalSources).toHaveBeenCalledTimes(1);expect(f.input).toEqual(before);
 }
});
