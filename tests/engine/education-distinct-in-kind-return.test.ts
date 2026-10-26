// Spec: spec/federal/form-1099-q-distinct-in-kind-assistance.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { distinctInKindFixture } from '../fixtures/education-distinct-in-kind.js';
it('carries distinct tuition assistance and actual credit through the return', async () => {
  for (const year of [2025,2026]) {
    const plain = calculateFederalTax(distinctInKindFixture(year));
    expect([plain.agi,plain.form1099Q!.netPenalty].map(value => value.toFixed())).toEqual(['50425','43']);
    const credited = calculateFederalTax(distinctInKindFixture(year,true));
    expect([credited.agi,credited.form1099Q!.netPenalty].map(value => value.toFixed())).toEqual(['50700','43']);
    expect(credited.form8863?.llcAfterPhaseOut.toFixed()).toBe('300');
  }
  const original = await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');
  expect(() => original.getConstants(2026)).toThrow(/2026/);
});
