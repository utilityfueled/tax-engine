// Spec: spec/federal/form-1099-q-in-kind-k12.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { inKindK12Fixture } from '../fixtures/education-in-kind-k12.js';

it('carries cash-limited earnings without taxing the qualified prepaid benefit', async () => {
  for (const year of [2025, 2026]) {
    const input = inKindK12Fixture(year), before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(result.agi.toFixed()).toBe('50200');
    expect(result.form1099Q?.taxableEarnings.toFixed()).toBe('200');
    expect(result.form1099Q?.netPenalty.toFixed()).toBe('20');
    expect(result.allLines.filter(row => row.form === 'Sched 1' && row.line === '8z').map(row => row.value.toFixed())).toEqual(['200']);
    expect(JSON.stringify(input)).toBe(before);
    input.form1099Q[0].recipientOwner = 'other'; input.form1099Q[0].recipientId = 'false-outside';
    expect(() => calculateFederalTax(input)).toThrow(/recipient|beneficiary|identity/);
  }
  const actual = await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');
  expect(() => actual.getConstants(2026)).toThrow(/2026/);
});
