// Spec: spec/federal/form-8962-shared-policy.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm8962 } from '@/engine/forms/form-8962.js';
import { sharedPolicyFixture } from '../fixtures/shared-policy.js';

it('transfers actual monthly allocated amounts and retains original policy totals', () => {
  const input = sharedPolicyFixture(), before = JSON.stringify(input), result = calculateFederalTax(input);
  expect(result.form8962?.calculationMethod).toBe('monthly');
  expect(result.form8962?.ptcAllowed.toFixed()).toBe('4812');
  expect(result.form8962?.advancePTCTotal.toFixed()).toBe('3000');
  expect(result.form8962?.netPTC.toFixed()).toBe('1812');
  expect(result.form8962?.lines.some(row => row.line === '11f')).toBe(false);
  expect(result.form8962?.sharedPolicyAllocation?.periods).toHaveLength(1);
  expect(JSON.stringify(input)).toBe(before);
  input.form8962!.monthlyReconciliation![0].advancePremiumTaxCredit = '500';
  expect(() => calculateFederalTax(input)).toThrow(/allocat|reconcil/i);
});

it('rejects a missing or conflicting allocation context and retains closed year gates', () => {
  const input = sharedPolicyFixture();
  expect(() => calculateForm8962({ taxYear: 2025, filingStatus: 'single', facts: { ...input.form8962, taxpayerModifiedAGI: '30000' }, form1095A: input.form1095A })).toThrow(/source.*context|household.*context/i);
  input.form8962!.allocationRequired = false;
  expect(() => calculateFederalTax(input)).toThrow(/allocat/i);
  expect(() => calculateFederalTax(sharedPolicyFixture(2026))).toThrow(/not.*ready|unavailable|incomplete|not.*available/i);
});

it('applies isolated2026 law to actual allocations and rejects absent original policies', () => {
  const input = sharedPolicyFixture(2026);
  const run = (magi: string) => calculateForm8962({ taxYear: 2026, filingStatus: 'single',
    facts: { ...input.form8962, taxpayerModifiedAGI: magi }, form1095A: input.form1095A,
    allocationHousehold: { taxpayer: input.taxpayer, standardDeductionFacts: input.standardDeductionFacts } });
  const actual = run('30000');
  expect(actual.contributionRate.toFixed()).toBe('0.0617');
  expect(actual.ptcAllowed.toFixed()).toBe('3552'); expect(actual.netPTC.toFixed()).toBe('552');
  const cliff = run('100000'); expect(cliff.ptcAllowed.toFixed()).toBe('0');
  expect(cliff.excessAPTCRepayment.toFixed()).toBe('3000');
  const missing = sharedPolicyFixture(); missing.form1095A = [];
  expect(() => calculateFederalTax(missing)).toThrow(/policy|source/i);
});
