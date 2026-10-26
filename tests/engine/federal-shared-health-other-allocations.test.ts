// Spec: spec/federal/shared-marketplace-health-other-allocations.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { defaultSharedHealthInput, noAdvanceSharedHealthInput } from '../fixtures/shared-marketplace-health-other-allocations';

it('coordinates default and no-advance health allocations once through final monthly credit', () => {
  for (const [input, expected] of [
    [defaultSharedHealthInput(), ['2340','44127','3480','120']],
    [noAdvanceSharedHealthInput(), ['1080','45387','9264','0']],
  ] as const) {
    const original=structuredClone(input), result=calculateFederalTax(input);
    expect([result.schedule1!.seHealthInsurance.toFixed(),result.agi.toFixed(),result.form8962!.ptcAllowed.toFixed(),result.form8962!.excessAPTCRepayment.toFixed()]).toEqual(expected);
    expect(result.allLines.find(row=>row.form==='QBI Source Deductions' && row.line==='scheduleC')?.inputs?.['SE health insurance']?.toString()).toBe(expected[0]);
    expect(input).toEqual(original);
  }
  const noAdvance=noAdvanceSharedHealthInput(), result=calculateFederalTax(noAdvance);
  expect(result.marketplaceHealthInsurance!.maximumDeduction.toFixed()).toBe('12000');
  expect(result.form8962!.fplPercentageForTable.toFixed()).toBe('301');
  expect(result.form8962!.contributionRate.toFixed()).toBe('0.0603');
  expect(result.form7206!.grossSourcePremiums.toFixed()).toBe('18000');
  expect(result.form7206!.paidSourcePremiums.toFixed()).toBe('12000');
  noAdvance.scheduleC!.grossReceipts='1000000';
  const noCredit=calculateFederalTax(noAdvance);
  expect([noCredit.schedule1!.seHealthInsurance.toFixed(),noCredit.form8962!.ptcAllowed.toFixed(),noCredit.form8962!.excessAPTCRepayment.toFixed()]).toEqual(['12000','0','0']);
  expect(noAdvance.form1095A![0].monthlyPremiums[0].enrolleePremium).toBe('1500');
  expect(noAdvance.form1095A![0].monthlyPremiums[0].slcsp).toBeNull();
});
