import { describe, expect, it } from 'vitest';
import { estimateOhio2026FarmerFisherTaxTiming } from '@/engine/state/oh-2026-farmer-fisher-estimated-tax.js';

type Source = Parameters<typeof estimateOhio2026FarmerFisherTaxTiming>[0];
const source = {
  taxYear: 2026,
  calendarYearIndividualConfirmed: true,
  classifiedCurrentYearGrossEstimatesConfirmed: true,
  ordinaryOhioDeclarationRequiredConfirmed: true,
  noExtensionOrOtherReliefConfirmed: true,
  schoolDistrictTaxApplicability: 'tax-applies',
  estimatedGrossFarmIncome: '20000',
  estimatedGrossFishingIncome: '0.00',
  estimatedTotalGrossIncome: '30000',
  federalMethod: { taxYear: 2026, usedBySameIndividualConfirmed: true, method: 'full-estimate' },
} satisfies Source;

function estimate(change: object = {}) {
  return estimateOhio2026FarmerFisherTaxTiming({ ...source, ...change });
}

describe('2026 Ohio farmer and fisherman alternative estimated-tax timing', () => {
  it('uses the exact current two-thirds floor separately for farming and fishing', () => {
    for (const [qualifying, other] of [
      ['estimatedGrossFarmIncome', 'estimatedGrossFishingIncome'],
      ['estimatedGrossFishingIncome', 'estimatedGrossFarmIncome'],
    ] as const) {
      const only = (amount: string, estimatedTotalGrossIncome = '30000') =>
        estimate({ [qualifying]: amount, [other]: '0', estimatedTotalGrossIncome });
      expect(only('19999.99').timetable).toBeNull();
      expect(only('20000').timetable?.method).toBe('full-estimate');
      expect(only('20000.01').timetable?.method).toBe('full-estimate');
      expect(only('20000', '30000.01').timetable).toBeNull();
      expect(only('20000', '29999.99').timetable?.method).toBe('full-estimate');
      expect(only('0', '0.00').timetable).toBeNull();
      expect(only('0', '30000').timetable).toBeNull();
      expect(() => only('30000.01')).toThrow();
    }
  });

  it('uses January and April dates for the confirmed federal full-estimate method', () => {
    const result = estimate();
    expect(result.kind).toBe('oh-2026-farmer-fisher-estimated-tax-timing-only');
    expect(result.timetable).toEqual({
      method: 'full-estimate',
      requirements: [
        { tax: 'ohio-individual', fullEstimatedTaxDueBy: '2027-01-15', annualReturnAndRemainingBalanceDueBy: '2027-04-15' },
        { tax: 'ohio-school-district', fullEstimatedTaxDueBy: '2027-01-15', annualReturnAndRemainingBalanceDueBy: '2027-04-15' },
      ],
    });
    expect(estimate({ schoolDistrictTaxApplicability: 'no-tax-applies' }).timetable?.requirements).toEqual([
      { tax: 'ohio-individual', fullEstimatedTaxDueBy: '2027-01-15', annualReturnAndRemainingBalanceDueBy: '2027-04-15' },
    ]);
  });

  it('uses March 1 for each required return and full tax under the confirmed federal early-return method', () => {
    const federalMethod = { ...source.federalMethod, method: 'early-return-and-full-tax' };
    expect(estimate({ federalMethod }).timetable).toEqual({
      method: 'early-return-and-full-tax',
      requirements: [
        { tax: 'ohio-individual', annualReturnAndFullTaxDueBy: '2027-03-01' },
        { tax: 'ohio-school-district', annualReturnAndFullTaxDueBy: '2027-03-01' },
      ],
    });
    expect(estimate({ federalMethod, schoolDistrictTaxApplicability: 'no-tax-applies' }).timetable?.requirements).toEqual([
      { tax: 'ohio-individual', annualReturnAndFullTaxDueBy: '2027-03-01' },
    ]);
  });

  it('rejects ambiguous categories, sources and federal method claims', () => {
    for (const patch of [
      { taxYear: 2025 }, { calendarYearIndividualConfirmed: false }, { classifiedCurrentYearGrossEstimatesConfirmed: false },
      { ordinaryOhioDeclarationRequiredConfirmed: false }, { ordinaryOhioDeclarationRequiredConfirmed: undefined },
      { noExtensionOrOtherReliefConfirmed: null }, { schoolDistrictTaxApplicability: null },
      { estimatedGrossFishingIncome: '0.01' }, { estimatedGrossFishingIncome: undefined },
      { estimatedGrossFarmIncome: '20000.001' }, { estimatedGrossFarmIncome: '-0.01' },
      { estimatedTotalGrossIncome: 30000 }, { estimatedTotalGrossIncome: 'NaN' }, { estimatedTotalGrossIncome: '0' },
      { federalMethod: undefined }, { federalMethod: { ...source.federalMethod, taxYear: 2025 } },
      { federalMethod: { ...source.federalMethod, usedBySameIndividualConfirmed: false } },
      { federalMethod: { ...source.federalMethod, method: 'federal-no-installment-due' } },
      { federalMethod: { ...source.federalMethod, method: 'quarterly' } },
      { chosenStateMethod: 'early-return-and-full-tax' },
    ]) expect(() => estimate(patch), JSON.stringify(patch)).toThrow();
  });
});
