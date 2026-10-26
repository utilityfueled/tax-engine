// Spec: spec/federal/form-1099-q-multiple-expense-esa.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { multipleEsaFixture } from '../fixtures/education-multiple-esa.js';

it('routes the actual multiple-expense election once', async () => {
  for (const year of [2025, 2026]) {
    const input = multipleEsaFixture(year), before = JSON.stringify(input), result = calculateFederalTax(input);
    expect([result.agi, result.form1099Q!.taxableEarnings, result.form1099Q!.penaltyExceptionAmount, result.form1099Q!.netPenalty].map(value => value.toFixed()))
      .toEqual(['50950', '950', '200', '75']);
    expect(JSON.stringify(input)).toBe(before);
    // This inherited W-2 separately reports1232.50 Medicare withholding on50000 wages,
    // so existing Form8959 contributes508 withholding beyond the20000 federal Box2.
    if (year === 2025) expect([result.totalTax, result.refund].map(value => value.toFixed())).toEqual(['3864', '16644']);
    const allocations = input.qualifiedEducationExpenses!.sourceFacts!.allocations!;
    allocations[0]!.amount = '1500'; allocations[1]!.amount = '2000';
    const changed = calculateFederalTax(input);
    expect([changed.agi, changed.form1099Q!.netPenalty].map(value => value.toFixed())).toEqual(['51000', '80']);
    if (year === 2025) expect([changed.totalTax, changed.refund].map(value => value.toFixed())).toEqual(['3875', '16633']);
  }
  const original = await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');
  expect(() => original.getConstants(2026)).toThrow(/2026/);
});
