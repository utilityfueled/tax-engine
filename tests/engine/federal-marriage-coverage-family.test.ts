// Spec: spec/federal/marketplace-marriage-coverage-family.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { marriageCoverageFamilyInput, marriageMixedCoveragePeopleInput } from '../fixtures/marketplace-marriage-coverage-family.js';

it('keeps signed health worksheets with actual mixed coverage people and annual family size', () => {
  const input=marriageMixedCoveragePeopleInput(), before=structuredClone(input), result=calculateFederalTax(input);
  const line=(form:string,number:string)=>result.allLines.find(row=>row.form===form&&row.line===number)?.value.toFixed(2);
  expect([line('Pub974 Worksheet W','1'),line('Pub974 Worksheet W','14'),line('Pub974 Worksheet W','16')]).toEqual(['10000.00','5000.00','-2000.00']);
  const specified=result.allLines.find(row=>row.form==='Pub974 Worksheet W'&&row.line==='1')!.value;
  const nonspecified=result.allLines.find(row=>row.form==='Pub974 Worksheet W'&&row.line==='14')!.value;
  expect(specified.plus(nonspecified).toFixed()).toBe('15000');
  expect(result.marketplaceHealthInsurance!.step2Credit.toFixed()).toBe('11610');
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('3390');
  expect(result.agi.toFixed()).toBe('52371');
  expect([result.form8962!.ptcAllowed,result.form8962!.excessAPTCRepayment].map(value=>value.toFixed())).toEqual(['11545','455']);
  expect(result.form8962!.marriageCalculation!.families[0].familySize).toBe(2);
  expect(result.allLines.find(row=>row.form==='QBI Source Deductions'&&row.line==='scheduleC')?.inputs['SE health insurance'].toString()).toBe('3390');
  expect(input).toEqual(before);
});

it('replays actual monthly marriage coverage through health final credit and QBI once', () => {
  for (const shared of [false,true]) {
    const input=marriageCoverageFamilyInput(shared), before=structuredClone(input), result=calculateFederalTax(input);
    expect(result.marketplaceHealthInsurance!.step2Credit.toFixed()).toBe('4786');
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('7214');
    expect(result.agi.toFixed()).toBe('85721');
    expect([result.form8962!.ptcAllowed,result.form8962!.excessAPTCRepayment].map(value=>value.toFixed())).toEqual(['4426','2574']);
    expect(result.form8962!.marriageCalculation!.families[0].startMonth).toBe(1);
    expect(result.form8962!.marriageCalculation!.families[0].stopMonth).toBe(7);
    expect(result.allLines.filter(line=>line.form==='Pub974 QBI Allocation'&&line.line==='scheduleC').map(line=>line.value.toFixed())).toEqual(['5214']);
    expect(result.allLines.find(line=>line.form==='QBI Source Deductions'&&line.line==='scheduleC')?.inputs['SE health insurance'].toString()).toBe('7214');
    expect(result.allLines.filter(line=>line.form==='Form 8962'&&line.line==='24').map(line=>line.value.toFixed())).toEqual(['4426']);
    expect(input).toEqual(before);
  }
});

it('preserves partial first month cash and the full enrollment source in canonical output', () => {
  for (const shared of [false,true]) {
    const input=marriageCoverageFamilyInput(shared,true), before=structuredClone(input), result=calculateFederalTax(input);
    expect(result.marketplaceHealthInsurance!.step2Credit.toFixed()).toBe('4145');
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('7855');
    expect(result.agi.toFixed()).toBe('85080');
    expect([result.form8962!.ptcAllowed,result.form8962!.excessAPTCRepayment].map(value=>value.toFixed())).toEqual(['3853','2447']);
    expect(result.form8962!.marriageCalculation!.families[0].startMonth).toBe(2);
    expect(result.form8962!.marriageCalculation!.families[0].stopMonth).toBe(7);
    expect(result.form8962!.marriageCalculation!.months.find(row=>row.month===1)?.credit.toFixed()).toBe('0');
    expect(result.allLines.find(line=>line.form==='Pub974 Worksheet W'&&line.line==='1')?.value.toFixed()).toBe('9000');
    expect(result.allLines.find(line=>line.form==='Pub974 Worksheet W'&&line.line==='14')?.value.toFixed()).toBe('3000');
    expect(input).toEqual(before);
  }
});

it('retains actual noncoverage advance attribution and original source gates', () => {
  const input=marriageCoverageFamilyInput(), original=input.form1095A[0];
  original.monthlyPremiums[1].advancePremiumTaxCredit='1';
  const plan=input.form7206!.plans![0], payment=plan.payments![1];
  payment.ownerOrBusinessPaid='999'; payment.advancePremiumTaxCredit='1';
  payment.personAmounts![0].amountPaid='999';payment.personAmounts![0].advancePremiumTaxCredit='1';
  input.form8962!.monthlyReconciliation![1].advancePremiumTaxCredit='1';
  input.form8962!.marriageSources!.policies![0].original=structuredClone(original);
  plan.coverageFamilySources!.policies![0].original=structuredClone(original);
  expect(()=>calculateFederalTax(input)).toThrow(/noncoverage|non-coverage|advance|repayment/i);
  const stale=marriageCoverageFamilyInput();
  stale.form1095A[0].policyNumber='changed-original';
  expect(()=>calculateFederalTax(stale)).toThrow(/original|snapshot|source/i);
});
