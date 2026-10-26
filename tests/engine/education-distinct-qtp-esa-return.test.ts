// Spec: spec/federal/form-1099-q-distinct-qtp-esa.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { distinctQtpEsaFixture } from '../fixtures/education-distinct-qtp-esa.js';

it('routes distinct prepaid and ESA sources once', async () => {
  for (const year of [2025, 2026]) {
    const input = distinctQtpEsaFixture(year), before = JSON.stringify(input), result = calculateFederalTax(input);
    expect([result.agi, result.form1099Q!.taxableEarnings, result.form1099Q!.penaltyExceptionAmount, result.form1099Q!.netPenalty].map(value => value.toFixed()))
      .toEqual(['51150', '1150', '300', '85']);
    expect(JSON.stringify(input)).toBe(before);
    // This inherited W-2 separately reports1232.50 Medicare withholding on50000 wages,
    // so existing Form8959 contributes508 withholding beyond the20000 federal Box2.
    if (year === 2025) expect([result.totalTax, result.refund].map(value => value.toFixed())).toEqual(['3898', '16610']);
    const allocations = input.qualifiedEducationExpenses!.sourceFacts!.allocations!;
    allocations[0]!.amount = '1500'; allocations[1]!.amount = '2000';
    const changed = calculateFederalTax(input);
    expect([changed.agi, changed.form1099Q!.netPenalty].map(value => value.toFixed())).toEqual(['51200', '90']);
    if (year === 2025) expect([changed.totalTax, changed.refund].map(value => value.toFixed())).toEqual(['3909', '16599']);
  }
  const original = await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');
  expect(() => original.getConstants(2026)).toThrow(/2026/);
});
