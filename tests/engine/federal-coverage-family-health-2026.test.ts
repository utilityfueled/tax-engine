// Isolated indexed-method control only; production2026 remains closed.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { roundDollar } from '@/utils/decimal.js';
import { coverageFamilyHealthInput } from '../fixtures/coverage-family-health.js';
// Spec: spec/federal/marketplace-coverage-family-health.yaml, year-and-known-mec.
  it('retains full2026 repayment and rejects contradictory owner employer enrollment', () => {
    const { input } = coverageFamilyHealthInput(2026); input.scheduleC!.grossReceipts = '150000';
    const result = calculateFederalTax(input);
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('15000');
    expect(result.form8962!.ptcAllowed.toFixed()).toBe('0');
    expect(result.form8962!.advancePTCTotal.toFixed()).toBe('6000');
    expect(result.form8962!.excessAPTCRepayment.toFixed()).toBe('6000');
    expect(roundDollar(result.form7206!.businesses[0].specifiedPremiums).toFixed()).toBe('10000');
    const contradictory = coverageFamilyHealthInput().input;
    contradictory.form7206!.plans![0].months![0].employerCoverageEnrolled = true;
    expect(() => calculateFederalTax(contradictory)).toThrow(/employer|enrollment|coverage/i);
  });
