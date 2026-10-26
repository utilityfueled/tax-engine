// Spec: spec/federal/form-1099-q-mixed-tuition.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { mixedTuitionFixture, mixedTuitionEducatorFixture } from '../fixtures/education-mixed-tuition.js';

it('routes the mixed original source and educator earnings once', async () => {
  for (const year of [2025, 2026]) {
    const original = mixedTuitionFixture(year), before = structuredClone(original), result = calculateFederalTax(original);
    expect([result.agi, result.form1099Q?.taxableEarnings, result.form1099Q?.netPenalty].map(value => value?.toFixed())).toEqual(['51500', '1500', '130']);
    expect(original).toEqual(before);
    const educator = mixedTuitionEducatorFixture(year), withEducator = calculateFederalTax(educator);
    expect(withEducator.agi.toFixed()).toBe(year === 2025 ? '51200' : '51150');
    expect(withEducator.form1099Q?.taxFreeEarnings.toFixed()).toBe('1500');
    const source = educator.adjustments?.educatorExpenseSources?.[0];
    if (!source) throw new Error('Missing actual fictional educator source');
    source.nontaxableQualifiedTuitionProgramAmount = '800';
    expect(() => calculateFederalTax(educator)).toThrow(/exclu|QTP|reconcil|tuition/i);
  }
  const original = await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');
  expect(() => original.getConstants(2026)).toThrow(/2026/);
});
