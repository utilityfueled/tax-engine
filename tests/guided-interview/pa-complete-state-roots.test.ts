// Spec: state/pa-complete-canonical-roots.yaml. Literal originals/oracles fixed before root admission.
import {expect,it} from 'vitest';
import {TaxYearInputSchema,type TaxYearInput} from '@/models/inputs';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
import {snapshotPAOrdinaryReturnCompletionOriginals} from '@/lib/guided-pa-ordinary-return-completion';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {paOrdinaryReturnFixture} from '../fixtures/pa-ordinary-return';
function canonical(status:'resident'|'part_year'|'nonresident'='resident'){
 const f=paOrdinaryReturnFixture(status);
 return {...f,input:{...f.input,paOrdinaryReturnFacts:f.facts,paOrdinaryReturnCompletionSources:f.sources}};
}
it('PA canonical roots retain both complete actual source packets',()=>{
 const f=canonical(),before=structuredClone(f.input);const parsed=TaxYearInputSchema.parse(f.input);
 expect(parsed).toHaveProperty('paOrdinaryReturnFacts',f.facts);
 expect(parsed).toHaveProperty('paOrdinaryReturnCompletionSources',f.sources);
 expect(f.input).toEqual(before);
});
it('PA canonical roots reject malformed present ordinary and completion packets',()=>{
 const f=canonical();
 for(const key of ['paOrdinaryReturnFacts','paOrdinaryReturnCompletionSources']){
  expect(()=>TaxYearInputSchema.parse({...f.input,[key]:{sourceTaxYear:2025,sourceFactsConfirmed:true,unknownField:'must not be stripped'}}),key).toThrow();
 }
});
it('PA canonical snapshots exclude exactly the four separately bound PA collector roots',()=>{
 const f=canonical();const input={...f.input,retainedNonPAAuditOriginal:{sourceReference:'Fictional untouched extra canonical original',amount:'9007199254740993.01'}};
 const expected=structuredClone(input) as Record<string,unknown>;
 for(const key of ['paResidencySources','paReciprocitySources','paOrdinaryReturnFacts','paOrdinaryReturnCompletionSources'])delete expected[key];
 expect(snapshotPAOrdinaryReturnOriginals(input)).toEqual(expected);
 expect(snapshotPAOrdinaryReturnCompletionOriginals(input)).toEqual(expected);
 expect(snapshotPAOrdinaryReturnOriginals(input)).toHaveProperty('retainedNonPAAuditOriginal.amount','9007199254740993.01');
});
it('PA canonical packets replay all three original residency tax oracles without opening filing',()=>{
 for(const [status,tax] of [['resident','1539'],['part_year','799'],['nonresident','184']] as const){
  const f=canonical(status);const input=TaxYearInputSchema.parse(f.input) as TaxYearInput&{paOrdinaryReturnFacts?:unknown;paOrdinaryReturnCompletionSources?:unknown};
  expect(input.paOrdinaryReturnFacts).toEqual(f.facts);expect(input.paOrdinaryReturnCompletionSources).toEqual(f.sources);
  const result=calculatePAOrdinaryReturn(input,input.paOrdinaryReturnFacts,input.paOrdinaryReturnCompletionSources);
  expect(result.pa40.taxLiability.toFixed()).toBe(tax);expect(result.readiness.filingEligible).toBe(false);
  expect(result.readiness.blockers).toContain('separate-local-return-required');
 }
});
