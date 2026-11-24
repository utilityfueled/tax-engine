/** Spec: federal/charitable-tangible-property-use.yaml. */
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateScheduleA } from '@/engine/schedules/schedule-a.js';
import { getConstants } from '@/models/constants.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { readCurrentCharitableReceiptAmounts } from '@/utils/charitable-current-receipts.js';
import { d } from '@/utils/decimal.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';

const reference = 'PRIVATE-TANGIBLE-DONEE-USE-EVIDENCE';
const unrelatedUse = {
  sourceReference: reference, doneeUse: 'unrelated', ordinaryWholeInterestConfirmed: true,
  noAdditionalValuationRuleConfirmed: true,
};
const painting = {
  organization: 'Fictional University', type: 'property', amount: '500', costBasis: '100',
  dateOfDonation: '2025-07-01', isLongTermCapitalGain: true, qualifiedOrganization: true,
  recipientCategory: 'fifty-percent',
};
function inputWithGift(gift: unknown, year = 2025) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
    deductionElection: 'itemized', donations: [gift] });
}

describe('ordinary tangible personal property gifted directly to a 50% organization', () => {
  it('reduces unrelated use to adjusted basis through the canonical 2025 return', () => {
    const input = inputWithGift({ ...painting, tangiblePropertyUse: unrelatedUse });
    const result = calculateFederalTax(input);
    expect(result.scheduleA?.charitableCurrentNoncash.toFixed()).toBe('100');
    expect(result.scheduleA?.charitableTotal.toFixed()).toBe('100');
    expect(result.taxableIncome.toFixed()).toBe('84900');
    expect(input.donations[0]).toMatchObject({ amount: '500', costBasis: '100', isLongTermCapitalGain: true });
    expect(JSON.stringify(result)).not.toContain(reference);
  });

  it('applies the 50% noncash limit to basis and the 30% capital-gain limit to related-use FMV', () => {
    const gift = { ...painting, amount: '800', costBasis: '600' };
    const unrelated = inputWithGift({ ...gift, tangiblePropertyUse: unrelatedUse });
    const related = inputWithGift({ ...gift, tangiblePropertyUse: { ...unrelatedUse, doneeUse: 'related' } });
    const underLimit = d('1000');
    const constants = getConstants(2025);
    const reduced = calculateScheduleA(unrelated, underLimit, 'single', constants);
    const fullFmv = calculateScheduleA(related, underLimit, 'single', constants);
    expect(reduced.nonCashCharitable.toFixed()).toBe('500');
    expect(reduced.charitableCarryforwardByYear.map(row => [row.category, row.amount.toFixed()])).toEqual([['noncash_50','100']]);
    expect(fullFmv.nonCashCharitable.toFixed()).toBe('300');
    expect(fullFmv.charitableCarryforwardByYear.map(row => [row.category, row.amount.toFixed()])).toEqual([['capital_gain_30','500']]);
  });

  it('applies the 2026 floor to the reduced amount', () => {
    const reduced = inputWithGift({ ...painting, amount: '800', costBasis: '400', dateOfDonation: '2026-07-01', tangiblePropertyUse: unrelatedUse }, 2026);
    const result = calculateScheduleA(reduced, d('1000'), 'single', FEDERAL_2026_CONSTANTS);
    expect(result.nonCashCharitable.toFixed()).toBe('395');
    expect(result.charitableCurrentNoncash.toFixed()).toBe('395');
  });

  it('holds an unclassified appreciated property gift and preserves the original values', () => {
    const input = inputWithGift(painting);
    const before = JSON.stringify(input);
    expect(() => calculateFederalTax(input)).toThrow(/actual ordinary tangible property and donee use/i);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('keeps the stock-only reader closed to this newly qualified property', () => {
    const input = inputWithGift({ ...painting, tangiblePropertyUse: unrelatedUse });
    expect(() => readCurrentCharitableReceiptAmounts(input, { capitalStockOnly: true })).toThrow(
      /requires the separate tangible-property or special valuation source method/,
    );
  });
});
