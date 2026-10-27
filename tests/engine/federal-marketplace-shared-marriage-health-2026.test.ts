// Spec: spec/federal/marketplace-shared-marriage-health.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { sharedMarriageHealthInput } from '../fixtures/marketplace-shared-marriage-health.js';

it('keeps the isolated next-year shared marriage calculation source bound', async () => {
  const input = sharedMarriageHealthInput(2026), result = calculateFederalTax(input);
  expect([result.schedule1!.seHealthInsurance, result.agi, result.form8962!.ptcAllowed, result.form8962!.excessAPTCRepayment].map(value => value.toFixed())).toEqual(['7811', '85124', '3346', '5054']);
  const wrong = structuredClone(input); wrong.form8962!.sharedPolicyAllocations!.sourceTaxYear = 2025;
  expect(() => calculateFederalTax(wrong)).toThrow(/source|year/i);
  const actual = await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');
  expect(() => actual.getConstants(2026)).toThrow(/2026|qualified|supported/i);
});
