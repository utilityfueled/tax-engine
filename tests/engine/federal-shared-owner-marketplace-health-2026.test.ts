// Spec: spec/federal/shared-owner-marketplace-health.yaml. Isolated method only.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { sharedOwnerHealthInput } from '../fixtures/shared-owner-marketplace-health.js';

it('preserves isolated2026 separate-plan owners and the qualification gate', async () => {
  for (const second of ['shared', 'household'] as const) {
    const input = sharedOwnerHealthInput(2026, second), before = structuredClone(input), result = calculateFederalTax(input);
    // 37468/21150 ->177%,.0549 ->2057/year,171/month. Step2=(700-171)*12.
    // 43816/21150 ->207%,.0686 ->3006/year,251/month. Final=(700-251)*12.
    expect([result.marketplaceHealthInsurance!.step2Credit, result.schedule1!.seHealthInsurance, result.agi, result.form8962!.ptcAllowed].map(row => row.toFixed()))
      .toEqual(['6348', '2652', '43816', '5388']);
    expect(result.allLines.filter(row => row.form === 'Pub974 Owner Allocation' && row.line.endsWith(':deduction')).map(row => [row.line, row.value.toDecimalPlaces(2).toFixed()])).toEqual([['primary:deduction', '1768'], ['spouse:deduction', '884']]);
    expect(input).toEqual(before);
  }
  const original = await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');
  expect(() => original.getConstants(2026)).toThrow(/2026|qualified|supported/i);
});
