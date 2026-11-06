// Spec: spec/federal/marketplace-binding-owner-full-repayment.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { bindingOwnerFullRepaymentInput } from '../fixtures/marketplace-binding-owner-full-repayment.js';
import { twoOwnerMarketplaceHealthInput } from '../fixtures/marketplace-health-owners.js';

function check(bindingOwner: 'primary' | 'spouse', reversePlans = false) {
  const input = bindingOwnerFullRepaymentInput(bindingOwner);
  if (reversePlans) input.form7206?.plans?.reverse();
  const original = JSON.stringify(input);
  const result = calculateFederalTax(input);
  const own = bindingOwner === 'primary'
    ? [['primary', '929', '929'], ['spouse', '148696', '3000']]
    : [['primary', '148696', '6000'], ['spouse', '929', '929']];
  expect(result.form7206?.businesses.map(row => [row.accountHolder,
    row.earnedIncomeLimit?.toFixed(), row.deduction?.toFixed()]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual(own);
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe(bindingOwner === 'primary' ? '3929' : '6929');
  expect(result.agi.toFixed()).toBe(bindingOwner === 'primary' ? '145696' : '142696');
  expect(result.form8962?.ptcAllowed.toFixed()).toBe('0');
  expect(result.form8962?.netPTC.toFixed()).toBe('0');
  expect(result.form8962?.advancePTCTotal.toFixed()).toBe('9000');
  expect(result.form8962?.excessAPTC.toFixed()).toBe('9000');
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe('9000');
  expect(result.form8962?.lines.filter(row => row.form === 'Form 8962' && row.line === '24')).toHaveLength(1);
  expect(result.form7206?.sourceFactsVerified).toBe(true);
  expect(result.form7206?.calculationComplete).toBe(true);
  expect(JSON.stringify(input)).toBe(original);
}
it("keeps the primary owner's own capacity in the independently full repayment case", () => check('primary'));
it("keeps the spouse's own capacity in the independently full repayment case", () => check('spouse'));
it.each(['primary', 'spouse'] as const)('preserves actual owner outcomes when original plan order is reversed: %s', owner => check(owner, true));
it.each(['positive-credit', 'capped', 'missing-advance', 'duplicate-month'] as const)('rejects unresolved or incomplete original facts: %s', variant => {
  const input = variant === 'capped' ? twoOwnerMarketplaceHealthInput(2025, 'full') : bindingOwnerFullRepaymentInput();
  if (!input.scheduleF || !input.form7206?.plans?.[0]?.payments?.[0] || !input.form1095A[0]) throw new Error('Actual source fixture missing');
  if (variant === 'positive-credit') input.scheduleF.salesOfProductsRaised = '100000';
  if (variant === 'missing-advance') delete input.form7206.plans[0].payments[0].advancePremiumTaxCredit;
  if (variant === 'duplicate-month') input.form1095A[0].monthlyPremiums.push(structuredClone(input.form1095A[0].monthlyPremiums[0]));
  const before = JSON.stringify(input);
  expect(() => calculateFederalTax(input)).toThrow();
  expect(JSON.stringify(input)).toBe(before);
});

it('preserves the already supported method when neither actual owner limit binds', () => {
  const input = bindingOwnerFullRepaymentInput();
  if (!input.scheduleC) throw new Error('Actual proprietor source required');
  input.scheduleC.grossReceipts = '160000';
  const before = JSON.stringify(input), result = calculateFederalTax(input);
  expect(result.marketplaceFullRepaymentHealth).toBeUndefined();
  expect(result.marketplaceHealthInsurance).toBeDefined();
  if (!result.scheduleSE) throw new Error('The original two businesses require their actual Schedule SE result');
  expect(result.scheduleSE.perTaxpayer.map(row => row.deductibleHalf.toFixed())).toEqual(['11304', '11304']);
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe('9000');
  expect(result.agi.toFixed()).toBe('288392');
  expect(result.form8962?.ptcAllowed.toFixed()).toBe('0');
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe('9000');
  expect(JSON.stringify(input)).toBe(before);
});
