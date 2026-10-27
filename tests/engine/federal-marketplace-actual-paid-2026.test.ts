// Spec: spec/federal/marketplace-actual-paid-repayment.yaml; existing production gates remain unchanged.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { actualPaidRepaymentInput } from '../fixtures/marketplace-actual-paid-repayment.js';
it('checks actual2026 credit after the actual paid deduction', () => {
  const input = actualPaidRepaymentInput(false, '1000.49', 2026); input.scheduleC!.grossReceipts = '150000';
  const result = calculateFederalTax(input);
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('15606');
  expect([result.form8962!.ptcAllowed.toFixed(), result.form8962!.excessAPTCRepayment.toFixed()]).toEqual(['0', '12006']);
  expect(result.marketplaceActualPaidRepaymentHealth!.reportedPayment!.eligiblePremiums.toFixed()).toBe('15605.88');
  const lower = actualPaidRepaymentInput(false, '1000', 2026); lower.scheduleC!.grossReceipts = '100000';
  expect(() => calculateFederalTax(lower)).toThrow(/credit|repayment/i);
});
