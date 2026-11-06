// Spec: spec/federal/shared-marketplace-health.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { sharedMarketplaceHealthInput } from '../fixtures/shared-marketplace-health.js';

it('coordinates actual shared health sources through monthly credit and QBI once', () => {
  const input = sharedMarketplaceHealthInput(), original = structuredClone(input), result = calculateFederalTax(input);
  // Source-derived monthly method: Wmax3375, Step2 43092/286%/.0544 ->195 monthly contribution,3660 PTC;6000-3660=2340.
  // Final44127/15060=293.0079%; actual293% row .0572 ->2524 annual,210 monthly,3480 PTC and120 repayment.
  expect(result.marketplaceHealthInsurance!.maximumDeduction.toFixed()).toBe('3375');
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('2340'); expect(result.agi.toFixed()).toBe('44127');
  expect(result.form8962!.fplPercentageForTable.toFixed()).toBe('293');
  expect(result.form8962!.contributionRate.toFixed()).toBe('0.0572');
  expect(result.form8962!.ptcAllowed.toFixed()).toBe('3480'); expect(result.form8962!.excessAPTCRepayment.toFixed()).toBe('120');
  expect(result.form7206!.grossSourcePremiums.toFixed()).toBe('12000'); expect(result.form7206!.paidSourcePremiums.toFixed()).toBe('2400');
  expect(result.allLines.find(row => row.form === 'QBI Source Deductions' && row.line === 'scheduleC')?.inputs?.['SE health insurance']?.toString()).toBe('2340');
  expect(input).toEqual(original);
});
it('preserves original shared payments through no-credit re-entry and rejects stale sources', () => {
  const input = sharedMarketplaceHealthInput(); input.scheduleC!.grossReceipts = '1000000';
  const result = calculateFederalTax(input);
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('6000'); expect(result.form8962!.ptcAllowed.toFixed()).toBe('0');
  expect(result.form8962!.excessAPTCRepayment.toFixed()).toBe('3600'); expect(input.form7206!.plans![0].payments![0].grossPremium).toBe('1000');
  input.form7206!.plans![0].payments![0].ownerOrBusinessPaid = '201'; input.form7206!.plans![0].payments![0].otherPersonPaid = '199'; input.form7206!.plans![0].payments![0].personAmounts![0].amountPaid = '201';
  expect(() => calculateFederalTax(input)).toThrow(/source|paid|reconcile|allocation/i);
});
