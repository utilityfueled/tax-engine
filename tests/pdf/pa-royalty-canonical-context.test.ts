// Spec: spec/state/guided-pa-royalty-history-guards.yaml. No PDF creation.
import {expect,it} from 'vitest';
import {preparePARoyaltyReview,assertPARoyaltyReview} from '@/pdf/pa-royalty-review-context';
import {calculateFederalTax} from '@/engine/federal';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {paRoyaltyTaxRefundFixture} from '../fixtures/pa-royalty-tax-refund-sources';
function actual(){const f=paRoyaltyTaxRefundFixture();const input={...f.input,paOrdinaryReturnFacts:f.facts,paOrdinaryReturnCompletionSources:f.completion};const result=calculateFederalTax(input);result.stateReturns={pennsylvania:calculatePAOrdinaryReturn(input,f.facts,f.completion)};return {input,result};}
it('prepared canonical royalty context admits exact canonical Schedule E lineage',()=>{
 const f=actual(),token=preparePARoyaltyReview(f.input);expect(()=>assertPARoyaltyReview(f.input,f.result,token)).not.toThrow();expect(f.result.stateReturns?.pennsylvania?.pa40.netRentalIncome.toFixed()).toBe('11000');
});
it('prepared canonical royalty context rejects changed originals',()=>{
 const f=actual(),token=preparePARoyaltyReview(f.input),changed=structuredClone(f.input);changed.form1099Misc[0].royalties='12001.25';expect(()=>assertPARoyaltyReview(changed,f.result,token)).toThrow(/changed|reconcile/);
});
