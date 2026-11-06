// Spec: spec/federal/form-1099-q-cash-assistance.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { cashAssistanceFixture, cashAssistanceEducatorFixture, requiredCashAssistance as required } from '../fixtures/education-cash-assistance.js';

it('routes actual cash assistance and educator source earnings once', async () => {
  for (const year of [2025, 2026]) {
    const input = cashAssistanceFixture(year), before = structuredClone(input), result = calculateFederalTax(input);
    expect([result.agi, result.form1099Q?.netPenalty].map(value => value?.toFixed())).toEqual(['50975', '75']);
    expect(input).toEqual(before);
    const educator = cashAssistanceEducatorFixture(year), withEducator = calculateFederalTax(educator);
    expect(withEducator.agi.toFixed()).toBe(year === 2025 ? '50675' : '50625');
    required(educator.adjustments?.educatorExpenseSources?.[0]).nontaxableQualifiedTuitionProgramAmount = '1800';
    expect(() => calculateFederalTax(educator)).toThrow(/QTP|exclu|tuition|reconcil/i);
  }
  const original = await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');
  expect(() => original.getConstants(2026)).toThrow(/2026/);
});
