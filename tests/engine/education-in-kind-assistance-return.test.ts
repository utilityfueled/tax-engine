// Spec: spec/federal/form-1099-q-in-kind-assistance.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { inKindAssistanceFixture } from '../fixtures/education-in-kind-assistance.js';

it('carries assistance-reduced earnings to the actual return recipient', async () => {
    for (const year of [2025,2026]) {
      const input = inKindAssistanceFixture(year), result = calculateFederalTax(input);
      expect(result.agi.toFixed()).toBe('50200');
      expect(result.form1099Q?.netPenalty.toFixed()).toBe('20');
      input.form1099Q[0].recipientOwner = 'other'; input.form1099Q[0].recipientId = 'false-outside';
      expect(() => calculateFederalTax(input)).toThrow(/recipient|beneficiary|identity/);
    }
  const original = await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');
  expect(() => original.getConstants(2026)).toThrow(/2026/);
});
