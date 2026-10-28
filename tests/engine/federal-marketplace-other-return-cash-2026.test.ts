// Spec: spec/federal/marketplace-other-return-cash.yaml; existing production gates remain unchanged.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { positiveOtherReturnCashInput } from '../fixtures/marketplace-other-return-cash';
it('retains isolated2026 actual other return cash without changing year gates', () => {
  const { input } = positiveOtherReturnCashInput('advance', '1000.49', 2026);
  const before = structuredClone(input), result = calculateFederalTax(input);
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('16800');
  expect([result.form8962!.ptcAllowed.toFixed(),result.form8962!.excessAPTCRepayment.toFixed()]).toEqual(['0','12000']);
  expect(result.marketplaceActualPaidRepaymentHealth!.originalPolicyAdvances.toFixed()).toBe('24011.76');
  expect(input).toEqual(before);
});
