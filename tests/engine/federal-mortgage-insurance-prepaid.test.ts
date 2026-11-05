// Spec: spec/federal/mortgage-insurance-prepaid-return.yaml. Actual federal orchestration; draft constants only in this test module.
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { mortgageInsurancePrepaidReturnInput } from '../fixtures/mortgage-insurance-prepaid-return.js';

function result(kind: 'ordinary' | 'reit' | 'high-income') {
  const input = mortgageInsurancePrepaidReturnInput(kind);
  const before = JSON.stringify(input);
  const calculated = calculateFederalTax(input);
  expect(JSON.stringify(input)).toBe(before);
  expect(calculated.taxYear).toBe(2026);
  expect(calculated.deductionUsed).toBe('itemized');
  expect(calculated.form2210?.safeHarborMet).toBe(true);
  if (!calculated.scheduleA) throw Error('Missing actual Schedule A result');
  return { ...calculated, scheduleA: calculated.scheduleA };
}

describe('actual original prepaid PMI federal coordination', () => {
  it('composes original PMI with actual SALT and charitable floor once', () => {
    const r = result('ordinary');
    expect(r.agi.toString()).toBe('100000');
    expect(r.scheduleA.mortgageInsurancePremiums.toString()).toBe('880');
    expect(r.scheduleA.mortgageInterest.toString()).toBe('5000');
    expect(r.scheduleA.saltDeduction.toString()).toBe('20000');
    expect(r.scheduleA.charitableTotal.toString()).toBe('3500');
    expect(r.deductionAmount.toString()).toBe('29380');
    expect(r.taxableIncome.toString()).toBe('70620');
  });
  it('uses original PMI in the actual REIT taxable income limit', () => {
    const r = result('reit');
    expect(r.agi.toString()).toBe('100000');
    expect(r.scheduleA.mortgageInsurancePremiums.toString()).toBe('880');
    expect(r.deductionAmount.toString()).toBe('29380');
    expect(r.form8995?.qbiDeduction.toString()).toBe('14124');
    expect(r.taxableIncome.toString()).toBe('56496');
  });
  it('retains original proof through zero PMI and actual section68 limitation', () => {
    const r = result('high-income');
    expect(r.scheduleA.mortgageInsurancePremiums.toString()).toBe('0');
    expect(r.scheduleA.saltDeduction.toString()).toBe('10000');
    expect(r.scheduleA.charitableTotal.toString()).toBe('100000');
    expect(r.itemizedDeductionReduction?.toString()).toBe('3211');
    expect(r.deductionAmount.toString()).toBe('111789');
    expect(r.taxableIncome.toString()).toBe('588211');
    expect(r.allLines.some(line => line.form === 'Prepaid Mortgage Insurance' && line.value.eq('880'))).toBe(true);
  });
  it('rejects an equal-money original account substitution before returning a financial result', () => {
    const input = mortgageInsurancePrepaidReturnInput();
    const sources = input.form1098[0].mortgageInsuranceQualification?.prepaidSources;
    if (!sources) throw Error('Missing fictional original');
    sources.loanAccountReference = 'different-actual-account';
    expect(() => calculateFederalTax(input)).toThrow(/account|reconcile|match|source/i);
  });
  it('rejects original year drift rather than using the same allocation cash', () => {
    const input = mortgageInsurancePrepaidReturnInput();
    const sources = input.form1098[0].mortgageInsuranceQualification?.prepaidSources;
    if (!sources) throw Error('Missing fictional original');
    // Deliberate post-parse corruption exercises the defensive real caller boundary.
    Reflect.set(sources, 'sourceTaxYear', 2025);
    expect(() => calculateFederalTax(input)).toThrow(/year|2026|source/i);
  });
});
