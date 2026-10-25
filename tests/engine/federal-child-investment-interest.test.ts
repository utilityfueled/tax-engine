// Spec: spec/federal/form-4952-child-sources.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async originalImport => {
  const original = await originalImport<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { syntheticChildInvestmentInput } from '../fixtures/child-investment-interest.js';

it('rejects an omitted child partition and a doubled combined amount', () => {
  const input = syntheticChildInvestmentInput();
  expect(() => calculateFederalTax({ ...input, form4952: { ...input.form4952, childIncomeSources: undefined } })).toThrow(/child.*source/i);
  expect(() => calculateFederalTax({ ...input, form4952: { ...input.form4952, grossInvestmentIncome: '4400' } })).toThrow(/reconcile/i);
});

it('requires separate actual AMT child sources for the historical year too', () => {
  const input = syntheticChildInvestmentInput();
  expect(() => calculateFederalTax({ ...input, form4952Amt: undefined })).toThrow(/AMT.*actual|AMT.*source/i);
});

it('uses complete regular and AMT child sources once in both years', () => {
  for (const year of [2025, 2026]) {
    const input = syntheticChildInvestmentInput(year), before = JSON.stringify(input);
    const result = calculateFederalTax(input);
    expect(result.form4952?.line4a.toFixed()).toBe('2200');
    expect(result.form4952?.line8.toFixed()).toBe('2200');
    expect(result.form4952Amt?.line4a.toFixed()).toBe('3000');
    expect(result.form4952Amt?.line8.toFixed()).toBe('3000');
    expect(result.allLines.find(line => line.form === 'Form 6251' && line.line === '2c')?.value.toFixed()).toBe('-800');
    expect(result.allLines.find(line => line.form === 'Form 6251' && line.line === '2g')?.value.toFixed()).toBe('800');
    expect(result.allLines.filter(line => line.form === 'Form 4952 child sources' && line.line === '4a')).toHaveLength(1);
    expect(result.allLines.filter(line => line.form === 'Form 4952 AMT child sources' && line.line === '4a')).toHaveLength(1);
    expect(JSON.stringify(input)).toBe(before);
    expect(() => calculateFederalTax({ ...input, form4952: { ...input.form4952, childIncomeSources: undefined } })).toThrow(/child.*source/i);
    expect(() => calculateFederalTax({ ...input, form4952Amt: { ...input.form4952Amt, grossInvestmentIncome: '2200' } })).toThrow(/reconcile/i);
  }
});
