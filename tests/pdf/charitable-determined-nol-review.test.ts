// Spec: charitable-determined-nol.yaml private-output.
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal';
import {prepareCharitableReview} from '@/pdf/charitable-review-context';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
import {buildNetOperatingLossReview} from '@/pdf/fill-net-operating-loss';
import {fillForm6251} from '@/pdf/fill-form-6251';
import {fillReturn} from '@/pdf/fill-return';
import {d} from '@/utils/decimal';
import {charitableNolOriginsInput} from '../fixtures/charitable-nol-origins';
it('binds both determined ledgers before private review output',async()=>{
  const input=charitableNolOriginsInput({prior:true,alternative:'5000'}),result=calculateFederalTax(input),token=prepareCharitableReview(input);
  const redacted=redactReviewIdentifiers(input),text=buildNetOperatingLossReview(redacted,result,undefined,undefined,token).join(' ');
  expect(text).toContain('Determined regular charitable origins');expect(text).toContain('remaining 32880');
  expect(text).toContain('2024 capital_gain_30 noncash: opening 60000; normal use 15600');
  expect(text).toContain('Current AMT charity adjustment 10600');
  expect(text).toContain('Unresolved allocations across charitable categories or vintages');
  expect(text).not.toContain('Mixed charitable categories or vintages, current-plus-prior contributions');
  for(const value of [input.taxpayer.primary.ssn,'synthetic-regular-2024','synthetic-alternative-2024','6789'])expect(text).not.toContain(value);
  for(const mutate of [
    (copy:typeof input)=>{copy.donations[0].costBasis='9999.99';},
    (copy:typeof input)=>{copy.donations[0].organization='Changed same-money recipient';},
    (copy:typeof input)=>{delete copy.charitableCarryoverSources;},
    (copy:typeof input)=>{if(copy.netOperatingLoss?.alternativeTax)delete copy.netOperatingLoss.alternativeTax.charitableCarryoverHistory;},
  ]){
    const copy=structuredClone(input);mutate(copy);
    await expect(fillForm6251(copy,result,'/missing-determined-charity.pdf',undefined,undefined,token)).rejects.toThrow(/charit|source|history|reconcile/i);
    await expect(fillReturn(copy,result,{blankFormsDir:'/missing-determined-templates',outputDir:'/missing-determined-output'})).rejects.toThrow(/charit|source|history|reconcile/i);
  }
  expect(()=>buildNetOperatingLossReview(redacted,result,undefined,undefined,{} as typeof token)).toThrow(/context|prepared|original/i);
  const origins=result.netOperatingLoss?.determinedCharitableCarryover?.rows;if(!origins)throw new Error('Missing derived original ledger');
  origins[0].normalUse=origins[0].normalUse.minus('.01');origins[0].carryforward=origins[0].carryforward.plus('.01');
  await expect(fillForm6251(redacted,result,'/missing-determined-charity.pdf',undefined,undefined,token)).rejects.toThrow(/charit|source|reconcile/i);
  origins[0].normalUse=origins[0].normalUse.plus('.01');origins[0].carryforward=origins[0].carryforward.minus('.01');
  result.carryforwards.charitableContributionsByYear[0].amount=d('32880.01');
  expect(()=>buildNetOperatingLossReview(redacted,result,undefined,undefined,token)).toThrow(/charit|source|reconcile/i);
});
