// Spec: spec/federal/form-8960-ordinary-sources.yaml.
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { ordinaryNiitSourceFixture } from '../fixtures/niit-ordinary-sources.js';

describe('Canonical ordinary NIIT source handoff', () => {
  it('includes actual annuity income and allowed tax expenses in canonical NIIT once', () => {
    for (const year of [2025, 2026]) {
      const actual = ordinaryNiitSourceFixture(year);
      const result = calculateFederalTax(actual);
      //250000 wages +20000 interest +10000 taxable annuity. 30000 NII-2501taxes=27499; *.038=1044.962 ->1045.
      expect(result.agi.toFixed(), String(year)).toBe('280000');
      expect(result.form8960.lines.find(line => line.line === '3')?.value.toFixed()).toBe('10000');
      expect(result.form8960.lines.find(line => line.line === '9b')?.value.toFixed()).toBe('2501');
      expect(result.form8960.netInvestmentIncome.toFixed()).toBe('27499');
      expect(result.niitTax.toFixed()).toBe('1045');
    }
  });
});
