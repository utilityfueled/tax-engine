// Spec: spec/federal/nonitemized-charitable-election.yaml
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateFederalDeductionSelection } from '@/engine/forms/federal-deduction-selection.js';
const d = (value: string) => new Decimal(value);
it('requires actual ineligibility and preserves distinct deduction choices', () => {
  const facts = { taxYear: 2026, election: 'nonitemized' as const, eligibleForStandardDeduction: false,
    standardDeduction: d('0'), itemizedDeductions: d('1125'), nonitemizerCharitableDeduction: d('1000') };
  const selected = calculateFederalDeductionSelection(facts);
  expect(selected.deductionUsed).toBe('nonitemized');
  expect(selected.deductionAmount.toFixed()).toBe('0');
  expect(selected.nonitemizerCharitableDeduction.toFixed()).toBe('1000');
  expect(calculateFederalDeductionSelection({ ...facts, election: 'itemized' }).deductionAmount.toFixed()).toBe('1125');
  expect(calculateFederalDeductionSelection({ ...facts, election: 'itemized' }).nonitemizerCharitableDeduction.toFixed()).toBe('0');
  expect(calculateFederalDeductionSelection({ ...facts, election: 'automatic' }).deductionUsed).toBe('itemized');
  expect(() => calculateFederalDeductionSelection({ ...facts, election: 'standard' })).toThrow(/standard.*ineligible/i);
  expect(() => calculateFederalDeductionSelection({ ...facts, eligibleForStandardDeduction: true })).toThrow(/unavailable|ineligible/i);
  expect(() => calculateFederalDeductionSelection({ ...facts, standardDeduction: d('16100') })).toThrow(/zero/i);
  expect(() => calculateFederalDeductionSelection({ ...facts, taxYear: 2025 })).toThrow(/2026/i);
  expect(() => calculateFederalDeductionSelection({ ...facts, nonitemizerCharitableDeduction: d('NaN') })).toThrow(/finite/i);
  expect(calculateFederalDeductionSelection({ ...facts, election: 'standard', eligibleForStandardDeduction: true,
    standardDeduction: d('16100') }).deductionAmount.toFixed()).toBe('16100');
});
