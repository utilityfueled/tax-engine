// Spec: spec/state/pa-ordinary-digital-cod-mixed-private-independent.yaml. Original literal privacy/money oracles retained.
import {expect,it}from 'vitest';
import {preparePAOrdinaryReturnReview,assertPAOrdinaryReturnReview}from '@/pdf/pa-ordinary-return-review-context';
import {redactReviewIdentifiers}from '@/pdf/redact-review-identifiers';
import {mixedPrivateDigitalFixture,mixedPrivateKeys}from '../fixtures/pa-digital-cod-mixed-private-independent';
it.each(mixedPrivateKeys)('redacts actual mixed private source references after the complete canonical composer succeeds: %s',key=>{
 const {input,ordinary,result,secrets}=mixedPrivateDigitalFixture([key]);
 expect(ordinary.pa40.taxLiability.toFixed()).toBe('3071');expect(ordinary.pa40.totalPayments.toFixed()).toBe('4000');expect(ordinary.pa40.netOverpayment.toFixed()).toBe('929');expect(ordinary.scheduleD?.line12.toFixed()).toBe('20');expect(ordinary.readiness.filingEligible).toBe(false);
 const before=JSON.stringify(input),token=preparePAOrdinaryReturnReview(input),render=assertPAOrdinaryReturnReview(redactReviewIdentifiers(input),result,token),description=render.scheduleD?.rows[0].description;
 expect(description).toBe('0.001 Complete mixed actual safe prefix [REDACTED] COMPLETE MIXED ACTUAL SAFE END');expect(description).not.toContain(secrets[0]);expect(JSON.stringify(input)).toBe(before);
});
