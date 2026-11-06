// Spec: spec/federal/education-ordinary-expense-composition.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { educatorInKindFixture } from '../fixtures/educator-in-kind.js';
import { ordinaryEducationExpenseFixture, ordinaryEducationRefundFixture, required } from '../fixtures/education-ordinary-expense-composition.js';

it('carries ordinary source earnings into the return and educator worksheet once', async () => {
  for (const year of [2025, 2026]) {
    const input = ordinaryEducationExpenseFixture(year), before = structuredClone(input);
    expect(calculateFederalTax(input).agi.toFixed()).toBe('50200');
    expect(input).toEqual(before);
    input.adjustments = educatorInKindFixture(year).adjustments;
    required(input.adjustments?.educatorExpenseSources?.[0]).nontaxableQualifiedTuitionProgramAmount = '600';
    const result = calculateFederalTax(input);
    expect([result.agi, result.form1099Q?.netPenalty].map(value => value?.toFixed())).toEqual([year === 2025 ? '49900' : '49850', '20']);
    required(input.adjustments?.educatorExpenseSources?.[0]).nontaxableQualifiedTuitionProgramAmount = '800';
    expect(() => calculateFederalTax(input)).toThrow(/QTP|exclu|reconcil/i);
    const refunded = calculateFederalTax(ordinaryEducationRefundFixture(year));
    expect([refunded.agi, refunded.form1099Q?.netPenalty].map(value => value?.toFixed())).toEqual(['50300', '30']);
  }
  const original = await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');
  expect(() => original.getConstants(2026)).toThrow(/2026/);
});
