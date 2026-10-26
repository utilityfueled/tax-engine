// Spec: spec/federal/form-1099-q-tuition-account-group.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { tuitionAccountGroupFixture } from '../fixtures/education-tuition-account-group.js';
it('routes the actual tuition account group once', async () => {
  for (const year of [2025, 2026]) {
    const input = tuitionAccountGroupFixture(year), before = JSON.stringify(input), result = calculateFederalTax(input);
    expect([result.agi, result.form1099Q!.taxableEarnings, result.form1099Q!.netPenalty].map(value => value.toFixed())).toEqual(['51200', '1200', '90']);
    expect(JSON.stringify(input)).toBe(before);
    const a = input.qualifiedEducationExpenses!.sourceFacts!.allocations!; a[0]!.amount = '1500'; a[2]!.amount = '2500';
    const changed = calculateFederalTax(input);
    expect([changed.agi, changed.form1099Q!.taxableEarnings, changed.form1099Q!.netPenalty].map(value => value.toFixed())).toEqual(['51267', '1267', '97']);
  }
  const original = await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');
  expect(() => original.getConstants(2026)).toThrow(/2026/);
});
