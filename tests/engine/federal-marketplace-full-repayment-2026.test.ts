// Spec: spec/federal/marketplace-full-advance-repayment.yaml.
// Isolated indexed2026 method only; production readiness remains unchanged.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { marketplaceFullRepaymentInput } from '../fixtures/marketplace-full-repayment.js';
it('requires actual final2026 zero credit after the full ordinary deduction', () => {
  const input = marketplaceFullRepaymentInput(false, 2026); input.scheduleC!.grossReceipts = '150000';
  const result = calculateFederalTax(input);
  expect(result.form8962!.ptcAllowed.toFixed()).toBe('0');
  expect(result.form8962!.excessAPTCRepayment.toFixed()).toBe('12000');
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('18000');
  const changesEligibility = marketplaceFullRepaymentInput(false, 2026); changesEligibility.scheduleC!.grossReceipts = '100000';
  expect(() => calculateFederalTax(changesEligibility)).toThrow(/zero final credit/);
});
