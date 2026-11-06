// Spec: spec/federal/form-172-current-mortgage-insurance.yaml. Literal independent loss-origin examples.
import { expect,it,vi } from 'vitest';
vi.mock('@/models/constants.js',async importOriginal=>{
 const original=await importOriginal<typeof import('@/models/constants.js')>();
 const {FEDERAL_2026_CONSTANTS}=await import('@/models/federal-2026-indexed.js');
 return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import { calculateFederalTax } from '@/engine/federal.js';
import { currentMortgageInsuranceOriginInput } from '../fixtures/form-172-current-mortgage-insurance.js';
function actual<T>(value:T|undefined):T {if(value===undefined)throw Error('Missing fictional actual source');return value;}
it('classifies original main-home PMI in independently recomputed regular and AMT origins',()=>{
 const input=currentMortgageInsuranceOriginInput(),before=JSON.stringify(input),r=calculateFederalTax(input),f=actual(r.form172);
 expect(r.agi.toFixed()).toBe('-60000');expect(r.deductionUsed).toBe('itemized');expect(r.deductionAmount.toFixed()).toBe('25880');
 expect(r.scheduleA?.mortgageInsurancePremiums.toFixed()).toBe('880');
 expect(f.regular.partI[1].toFixed()).toBe('-85880');expect(f.regular.partI[6].toFixed()).toBe('25880');expect(f.regular.partI[7].toFixed()).toBe('20000');expect(f.regular.partI[9].toFixed()).toBe('5880');expect(f.regular.netOperatingLoss.toFixed()).toBe('80000');
 expect(f.alternativeTax.partI[1].toFixed()).toBe('-65880');expect(f.alternativeTax.partI[6].toFixed()).toBe('5880');expect(f.alternativeTax.partI[9].toFixed()).toBe('0');expect(f.alternativeTax.netOperatingLoss.toFixed()).toBe('65880');
 expect(f.section1411OriginalLoss.toFixed()).toBe('0');expect(f.regularClosingCarryforward.toFixed()).toBe('80000');expect(f.alternativeClosingCarryforward.toFixed()).toBe('65880');
 expect(JSON.stringify(input)).toBe(before);
});
it('uses reported annual zero and half-dollar rounding exactly once',()=>{
 for(const [premium,reported,deduction,alternative] of [['0','0','25000','65000'],['5.25','1','25001','65001']] as const){
  const input=currentMortgageInsuranceOriginInput();actual(actual(input.form1098[0].mortgageInsuranceQualification).prepaidSources).prepaidPremiumPaid=premium;
  const before=JSON.stringify(input),r=calculateFederalTax(input);expect(r.scheduleA?.mortgageInsurancePremiums.toFixed()).toBe(reported);expect(r.deductionAmount.toFixed()).toBe(deduction);expect(r.form172?.regular.netOperatingLoss.toFixed()).toBe('80000');expect(r.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe(alternative);expect(JSON.stringify(input)).toBe(before);
 }
});
it('rejects second-home PMI even with zero current interest',()=>{
 const input=currentMortgageInsuranceOriginInput(),loan=actual(input.mortgageInterestWorksheet).loans[0];loan.homeUse='second';loan.interestPaid='0';input.form1098[0].mortgageInterestReceived='0';
 expect(()=>calculateFederalTax(input)).toThrow(/Form172.*(insurance|AMT|dwelling|principal)/i);
});
it('does not replace an original AMT classification with a manual annual amount',()=>{
 const input=currentMortgageInsuranceOriginInput(),q=actual(input.form1098[0].mortgageInsuranceQualification);delete q.prepaidSources;q.premiumsAllocableToYear='880';
 expect(()=>calculateFederalTax(input)).toThrow(/Form172.*(insurance|original|source)/i);
});
it('keeps unknown original history denied for documented zero',()=>{
 const input=currentMortgageInsuranceOriginInput(),q=actual(actual(input.form1098[0].mortgageInsuranceQualification).prepaidSources);q.prepaidPremiumPaid='0';Reflect.deleteProperty(q,'otherPremiumPayments');
 expect(()=>calculateFederalTax(input)).toThrow();
});
