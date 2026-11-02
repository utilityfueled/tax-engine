// Spec: spec/federal/k1-form461-classification.yaml#profitable-c-k1-review.
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal.js';
import {prepareQbiLossReview,qbiLossReviewOriginalSourceInput,type PreparedQbiLossReview} from '@/pdf/qbi-loss-review-context.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {fillReturn} from '@/pdf/fill-return.js';
import {cK1NecFixture,cK1OrdinaryFixture} from '../fixtures/c-k1-ordinary.js';
it('binds prepared C and K1 originals before template I O',async()=>{
 const input=cK1OrdinaryFixture(),result=calculateFederalTax(input),context=prepareQbiLossReview(input),redacted=redactReviewIdentifiers(input);
 expect(qbiLossReviewOriginalSourceInput(redacted,result,context)).toEqual(input);
 for(const mutate of [(i:typeof input)=>{i.scheduleC!.businessName='Same dollars different C';},(i:typeof input)=>{i.scheduleC!.ein='98-7654321';},(i:typeof input)=>{i.scheduleC!.accountHolder='spouse';},(i:typeof input)=>{i.qbiLossSources!.form461Classification!.scheduleCSource!.sourceReference='Other actual original';},(i:typeof input)=>{i.scheduleK1[0].partnershipName='Different original K1';}]){
  const stale=structuredClone(input);mutate(stale);await expect(fillReturn(redactReviewIdentifiers(stale),result,{blankFormsDir:'/does-not-exist',outputDir:'/does-not-exist',qbiLossReview:context})).rejects.toThrow(/source|context|match|original/i);
 }
 expect(()=>qbiLossReviewOriginalSourceInput(redacted,result,{} as PreparedQbiLossReview)).toThrow(/context|source/i);
 const forged={...result,agi:result.agi.plus(1)};expect(()=>qbiLossReviewOriginalSourceInput(redacted,forged,context)).toThrow(/calculation|result|match|context/i);
});

it('binds complete actual NEC source originals and stale results before template I O',async()=>{
 const input=cK1NecFixture(),r=calculateFederalTax(input),token=prepareQbiLossReview(input);expect(qbiLossReviewOriginalSourceInput(redactReviewIdentifiers(input),r,token)).toEqual(input);
 const changed=cK1NecFixture();changed.form1099Nec[0].payer='Different equal-dollar original';changed.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!.rows![0].original={...changed.form1099Nec[0]};const fresh=prepareQbiLossReview(changed);
 await expect(fillReturn(redactReviewIdentifiers(changed),r,{blankFormsDir:'/does-not-exist',outputDir:'/does-not-exist',qbiLossReview:fresh})).rejects.toThrow(/calculation|reconcile|source/i);
 const text=JSON.stringify(calculateFederalTax(input).form461!.lines);expect(text).not.toContain('12-4444444');expect(text).not.toContain('Actual private receipt');
});
