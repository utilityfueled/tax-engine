// Spec: spec/federal/charitable-recipient-classification.yaml.
import { expect, it } from 'vitest';
import { TaxYearInputSchema, CryptoDonationSchema } from '@/models/inputs.js';
import { calculateScheduleA } from '@/engine/schedules/schedule-a.js';
import { calculateCryptoDonations } from '@/engine/forms/crypto-lot-matching.js';
import { getConstants } from '@/models/constants.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { readCurrentPublicCashForNol } from '@/utils/charitable-nol-source.js';
import { d } from '@/utils/decimal.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';
const receipt = { organization:'Actual recipient',type:'cash',amount:'6000',dateOfDonation:'2025-05-01',qualifiedOrganization:true,isPrivateFoundation:true };
function input(change:Record<string,unknown>={},year=2025) {
 return TaxYearInputSchema.parse({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,taxYear:year},donations:[{...receipt,dateOfDonation:`${year}-05-01`,supportingOrganization:false,donorAdvisedFund:false,...change}]});
}
function calc(change:Record<string,unknown>={},year=2025,base='10000') { const value=input(change,year); return calculateScheduleA(value,d(base),'single',year===2025?getConstants(2025):FEDERAL_2026_CONSTANTS); }
it('separates actual recipient limits and foundation valuation without rewriting legacy facts',()=>{
 const value=input({recipientCategory:'fifty-percent'}), before=JSON.stringify(value);
 expect(calculateScheduleA(value,d('10000'),'single',getConstants(2025)).cashCharitable.toFixed()).toBe('6000');
 expect(readCurrentPublicCashForNol(value).toFixed()).toBe('6000');
 expect(value.donations[0]).toMatchObject({isPrivateFoundation:true,recipientCategory:'fifty-percent'});
 expect(JSON.stringify(value)).toBe(before);
 expect(calc({recipientCategory:'private-nonoperating'}).cashCharitable.toFixed()).toBe('3000');
 expect(calc({recipientCategory:'other-thirty-percent',type:'appreciated_stock',amount:'2000',costBasis:'1000',isLongTermCapitalGain:true},2025,'100000').nonCashCharitable.toFixed()).toBe('2000');
 expect(calc({recipientCategory:'private-nonoperating',type:'appreciated_stock',amount:'2000',costBasis:'1000',isLongTermCapitalGain:true,qualifiedAppreciatedStock:false},2025,'100000').nonCashCharitable.toFixed()).toBe('1000');
 expect(calc({recipientCategory:'fifty-percent',amount:'1500'},2026,'100000').nonitemizerCharitableDeduction.toFixed()).toBe('1000');
});
it('preserves unresolved legacy categories and actual false without inventing eligibility',()=>{
 for(const year of [2025,2026]) {
  expect(()=>calc({},year)).toThrow(/classification|category/i);
  expect(()=>calc({isPrivateFoundation:undefined},year)).toThrow(/classification|category/i);
  expect(calc({qualifiedOrganization:false},year).charitableTotal.toFixed()).toBe('0');
  expect(calc({amount:'0',qualifiedOrganization:undefined,isPrivateFoundation:undefined},year).charitableTotal.toFixed()).toBe('0');
 }
 const legacy=input({isPrivateFoundation:false});
 expect(legacy.donations[0]).not.toHaveProperty('recipientCategory');
 expect(calculateScheduleA(legacy,d('10000'),'single',getConstants(2025)).cashCharitable.toFixed()).toBe('6000');
 expect(TaxYearInputSchema.safeParse({...legacy,donations:[{...legacy.donations[0],recipientCategory:'fabricated-category'}]}).success).toBe(false);
});
it('binds crypto valuation to the same actual category and rejects the ambiguous legacy enum',()=>{
 const source={asset:'ETH',quantity:'1',dateAcquired:'2023-01-01',dateDonated:'2025-05-01',fairMarketValueAtDonation:'2000',costBasis:'1000',charityName:'Actual recipient',isQualifiedOrganization:true,capitalAsset:true,sourceFactsConfirmed:true,fullOwnershipInterestDonated:true,noGoodsOrServicesReceived:true,substantiationRequirementsMet:true,appraisalRequired:false};
 for(const [recipientCategory,expected,category] of [['fifty-percent','2000','capitalGainPublic'],['private-nonoperating','1000','capitalGainPrivate'],['other-thirty-percent','2000','capitalGainPrivate']] as const){
  const gift=CryptoDonationSchema.parse({...source,recipientCategory}),before=JSON.stringify(gift),result=calculateCryptoDonations([gift],2025);
  expect(result.totalDeduction.toFixed()).toBe(expected);expect(result.contributionAmounts[category].toFixed()).toBe(expected);expect(JSON.stringify(gift)).toBe(before);
 }
 const old=CryptoDonationSchema.parse({...source,recipientCategory:'other-qualified'});
 expect(old.recipientCategory).toBe('other-qualified');
 expect(()=>calculateCryptoDonations([old],2025)).toThrow(/classification|category/i);
 const unknown=CryptoDonationSchema.parse({...source,sourceFactsConfirmed:undefined,recipientCategory:undefined});
 expect(calculateCryptoDonations([unknown],2025).sourceFactsVerified).toBe(false);
 expect(unknown.recipientCategory).toBeUndefined();
 expect(()=>calculateCryptoDonations([{...unknown,dateDonated:'2026-05-01'}],2026)).toThrow(/qualification|source/i);
 expect(calculateCryptoDonations([{...old,isQualifiedOrganization:false}],2025).totalDeduction.toFixed()).toBe('0');
});
