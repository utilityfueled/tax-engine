// Spec: spec/federal/marketplace-reported-repayment-payment.yaml.
// Isolated indexed2026 calculation; production gates stay unchanged.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { marketplaceReportedRepaymentInput } from '../fixtures/marketplace-reported-repayment.js';
it('checks final2026 credit after actual reported payment', () => {
  const input = marketplaceReportedRepaymentInput(false, false, 2026); input.scheduleC!.grossReceipts = '150000';
  const result = calculateFederalTax(input);
  expect(result.form8962!.ptcAllowed.toFixed()).toBe('0');
  expect(result.form8962!.excessAPTCRepayment.toFixed()).toBe('12006');
  expect(result.marketplaceReportedRepaymentHealth!.reportingExcess.toFixed()).toBe('0.12');
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('18000');
  const lower = marketplaceReportedRepaymentInput(false, false, 2026); lower.scheduleC!.grossReceipts = '100000';
  expect(() => calculateFederalTax(lower)).toThrow(/zero credit/);
});
