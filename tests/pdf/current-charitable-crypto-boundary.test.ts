// Spec: spec/federal/current-charitable-crypto-handoff.yaml.
import {expect,it} from 'vitest';
import {prepareCharitableReview,assertCharitableReviewSource,type PreparedCharitableReview} from '@/pdf/charitable-review-context.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {fillReturn} from '@/pdf/fill-return.js';
import {currentCryptoFixture} from '../fixtures/current-charitable-crypto.js';
import {simpleW2Fixture} from '../fixtures/simple-w2.js';
it('binds original crypto facts while keeping future export unavailable',async()=>{
 const input=currentCryptoFixture(),before=JSON.stringify(input),token=prepareCharitableReview(input),redacted=redactReviewIdentifiers(input);
 expect(()=>assertCharitableReviewSource(input,token)).not.toThrow();expect(()=>assertCharitableReviewSource(redacted,token)).not.toThrow();expect(redacted.taxpayer.primary.ssn).toBe('');expect(redacted.charitableCarryoverSources?.primaryTaxpayerIdLast4).toBe('');
 for(const mutate of [
  (x:ReturnType<typeof currentCryptoFixture>)=>{if(x.cryptoIncome){x.cryptoIncome.donations[1].fairMarketValueAtDonation='19999.99';x.cryptoIncome.donations[2].fairMarketValueAtDonation='15000.01';}},
  (x:ReturnType<typeof currentCryptoFixture>)=>{if(x.cryptoIncome)x.cryptoIncome.donations[0].dateDonated='2026-06-02';},
  (x:ReturnType<typeof currentCryptoFixture>)=>{if(x.cryptoIncome)x.cryptoIncome.donations[0].sourceFactsConfirmed=false;},
  (x:ReturnType<typeof currentCryptoFixture>)=>{if(x.cryptoIncome)x.cryptoIncome.donations[0].recipientCategory='private-nonoperating';},
 ]){const changed=structuredClone(input);mutate(changed);expect(()=>assertCharitableReviewSource(changed,token)).toThrow(/stale|conflict/i);}
 expect(()=>assertCharitableReviewSource(redacted,{} as PreparedCharitableReview)).toThrow(/original.*source/i);expect(()=>calculateFederalTax(input)).toThrow(/not.*ready|incomplete|unavailable|not.*available/i);
 const historical=calculateFederalTax(simpleW2Fixture);await expect(fillReturn(input,{...historical,taxYear:2026},{outputDir:'tmp/should-not-be-written'})).rejects.toThrow(/2026.*unavailable|no.*2026|2026.*not/i);expect(JSON.stringify(input)).toBe(before);
});
