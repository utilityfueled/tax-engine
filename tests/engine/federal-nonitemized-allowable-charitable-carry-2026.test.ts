// Spec: spec/federal/nonitemized-allowable-charitable-carry.yaml. Isolated draft constants; production gate stays closed.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { currentCategoryFixture } from '../fixtures/current-charitable-categories.js';
import { currentCharitableOriginInput } from '../fixtures/form-172-charitable-origin.js';
import { priorPropertyNonitemizedInput } from '../fixtures/k1-prior-property-nonitemized.js';
it('preserves common carry with separately selected deductions and current cash cap', () => {
  for (const cash of [false,true]) for (const method of ['standard','nonitemized','itemized'] as const) {
    const input = currentCategoryFixture(cash?'70000':'0','0','0',cash?'0':'40000','0');
    input.w2s[0].wages='100000'; input.w2s[0].federalWithheld='30000'; input.deductionElection=method;
    if (!input.standardDeductionFacts) throw Error('Missing actual synthetic eligibility');
    input.standardDeductionFacts.spouseItemizes=method==='nonitemized';
    const before=JSON.stringify(input),result=calculateFederalTax(input);
    expect(result.deductionUsed).toBe(method);
    expect(result.carryforwards.charitableContributions.toFixed()).toBe('10500');
    expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe(cash&&method!=='itemized'?'1000':'0');
    expect(JSON.stringify(input)).toBe(before);
  }
  const capped=currentCategoryFixture('5000','0','0','0','0'); capped.w2s[0].wages='100000'; capped.w2s[0].federalWithheld='30000';
  const result=calculateFederalTax(capped);expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe('1000');
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('0');
});
it('orders the current floor before independent regular and alternative loss origins', () => {
  for(const method of ['standard','nonitemized'] as const){
    const input=currentCharitableOriginInput('G',2026);input.deductionElection=method;
    if(method==='nonitemized'){
      input.taxpayer.filingStatus='married_filing_separately';
      if(!input.standardDeductionFacts||!input.charitableCarryoverSources)throw Error('Missing synthetic actual sources');
      input.standardDeductionFacts.spouseItemizes=true;input.charitableCarryoverSources.filingStatus='married_filing_separately';
    }
    const before=JSON.stringify(input),result=calculateFederalTax(input);
    expect([result.agi,result.nonitemizerCharitableDeduction,result.form172?.regular.netOperatingLoss,result.form172?.alternativeTax.netOperatingLoss,
      result.carryforwards.charitableContributions,result.carryforwards.amtCharitableContributions].map(x=>x?.toFixed()))
      .toEqual(['10000','1000',method==='standard'?'7100':'0','0','14050','14050']);
    expect(JSON.stringify(input)).toBe(before);
  }
});
it('requires actual prior release floor proof independently of standard selection', () => {
  for(const method of ['basis','risk'] as const){
    const input=priorPropertyNonitemizedInput({method});
    expect(()=>calculateFederalTax(input)).toThrow(/prior.*floor|floor.*prior|contribution.year/i);
    input.w2s[0].wages='0';input.w2s[0].federalWithheld='0';
    const before=JSON.stringify(input);
    expect(()=>calculateFederalTax(input)).toThrow(/prior.*(carry|contribution.year)|(carry|contribution.year).*prior/i);
    expect(JSON.stringify(input)).toBe(before);
    const differentFloor=priorPropertyNonitemizedInput({method});
    differentFloor.donations=[{organization:'Actual current cash recipient',type:'cash',amount:'70000',dateOfDonation:'2026-06-01',
      qualifiedOrganization:true,recipientCategory:'fifty-percent',supportingOrganization:false,donorAdvisedFund:false}];
    expect(()=>calculateFederalTax(differentFloor)).toThrow(/prior.*(carry|contribution.year)|(carry|contribution.year).*prior/i);
    for(const capacity of ['20000','30000']){
      const harmless=priorPropertyNonitemizedInput({method,capacity}),original=JSON.stringify(harmless),result=calculateFederalTax(harmless);
      expect(result.agi.toFixed()).toBe('100000');expect(result.carryforwards.charitableContributions.toFixed()).toBe('0');
      expect(result.scheduleA?.charitableTotal.toFixed()).toBe('0');expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe('0');
      expect(JSON.stringify(harmless)).toBe(original);
    }
  }
});
