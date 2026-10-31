// Spec: spec/federal/qof-deferred-gain-inclusion.yaml isolated-2026.
// Draft constants exist only in this isolated module. Production gates stay closed.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm8949 } from '@/engine/forms/form-8949.js';
import { qofFacts, qofInvestment } from '../fixtures/qof-inclusion.js';
import { qofInclusion2026Input } from '../fixtures/qof-inclusion-2026.js';

it('includes deferred gain at the statutory date without a sale', () => {
  const input = qofInclusion2026Input(), result = calculateFederalTax(input);
  expect(result.qofInclusion!.totalIncludedGain.toFixed()).toBe('90000');
  expect(result.scheduleD!.netLongTerm.toFixed()).toBe('90000');
  expect(result.agi.toFixed()).toBe('175000');
  expect(calculateForm8949(input).longTermBoxF.transactions[0]).toMatchObject({ dateSold: '2026-12-31', adjustmentCode: 'Y' });
  expect(calculateForm8949(input).longTermBoxF.transactions[0]!.gainLoss.toFixed()).toBe('90000');
  const held = qofInclusion2026Input(); held.qofDispositionFacts = qofFacts(2026, [qofInvestment({ investmentDate: '2019-12-31' })], false);
  expect(calculateFederalTax(held).qofInclusion!.totalIncludedGain.toFixed()).toBe('85000');
});
