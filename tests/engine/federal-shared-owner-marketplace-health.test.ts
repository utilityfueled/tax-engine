// Spec: spec/federal/shared-owner-marketplace-health.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { sharedOwnerHealthInput } from '../fixtures/shared-owner-marketplace-health.js';

it('coordinates separate actual shared-plan owners through monthly credit and QBI', () => {
  for (const second of ['shared', 'household'] as const) {
    const input = sharedOwnerHealthInput(2025, second), before = structuredClone(input), result = calculateFederalTax(input);
    expect([result.marketplaceHealthInsurance!.step2Credit, result.marketplaceHealthInsurance!.maximumDeduction,
      result.schedule1!.seHealthInsurance, result.agi, result.form8962!.ptcAllowed].map(row => row.toFixed())).toEqual(['7908', '9000', '1092', '45376', '7116']);
    expect(result.allLines.filter(row => row.form === 'Pub974 Owner Allocation' && row.line.endsWith(':deduction'))
      .map(row => [row.line, row.value.toDecimalPlaces(2).toFixed()])).toEqual([['primary:deduction', '728'], ['spouse:deduction', '364']]);
    expect(result.allLines.filter(row => row.form === 'QBI Source Deductions' && ['scheduleC', 'scheduleF'].includes(row.line))
      .map(row => [row.line, row.inputs.Owner, row.inputs['SE health insurance'].toString()])).toEqual([['scheduleC', 'primary', '728'], ['scheduleF', 'spouse', '364']]);
    expect(result.allLines.filter(row => row.form === 'Form 8962' && row.line === '24')).toHaveLength(1);
    expect(input).toEqual(before);
  }
  const sameOwner = sharedOwnerHealthInput();
  sameOwner.scheduleF!.accountHolder = 'primary';
  sameOwner.form7206!.plans![1]!.accountHolder = 'primary';
  sameOwner.form7206!.plans![1]!.coveredPersons![0]!.relationshipToOwner = 'spouse';
  const sameOwnerResult = calculateFederalTax(sameOwner);
  // The combined owner's SE half rounds to3533, instead of the two independent
  // owners'2119+1413. The monthly credit and combined health deduction stay equal.
  expect([sameOwnerResult.schedule1!.seHealthInsurance, sameOwnerResult.agi, sameOwnerResult.form8962!.ptcAllowed].map(row => row.toFixed())).toEqual(['1092', '45375', '7116']);
  expect(sameOwnerResult.allLines.filter(row => row.form === 'QBI Source Deductions' && ['scheduleC', 'scheduleF'].includes(row.line))
    .map(row => [row.line, row.inputs.Owner, row.inputs['SE health insurance'].toString()])).toEqual([['scheduleC', 'primary', '655'], ['scheduleF', 'primary', '437']]);
});
it('preserves zero-advance family benchmarks and actual binding owner income', () => {
  for (const second of ['shared', 'household'] as const) {
    const input = sharedOwnerHealthInput(2025, second, 'no-advance');
    input.scheduleC!.grossReceipts = '1000'; input.scheduleF!.salesOfProductsRaised = '50000';
    const before = structuredClone(input), result = calculateFederalTax(input);
    expect([result.marketplaceHealthInsurance!.maximumDeduction, result.marketplaceHealthInsurance!.step2Credit,
      result.schedule1!.seHealthInsurance, result.agi, result.form8962!.ptcAllowed].map(row => row.toFixed())).toEqual(['3929', '7320', '1489', '45907', '7044']);
    expect(result.allLines.filter(row => row.form === 'Pub974 Owner Allocation' && row.line.endsWith(':deduction'))
      .map(row => [row.line, row.value.toDecimalPlaces(2).toFixed()])).toEqual([['primary:deduction', '929'], ['spouse:deduction', '560']]);
    expect(result.form8962!.sharedPolicyAllocation!.householdMonths[0]!.slcsp.toFixed()).toBe('700'); expect(input).toEqual(before);
  }
});
it('retains source order cents and the actual joint repayment boundary', () => {
  const input = sharedOwnerHealthInput(), result = calculateFederalTax(input);
  input.form7206!.plans!.reverse(); input.form7206!.plans!.forEach(plan => { plan.payments!.reverse(); plan.sharedMarketplaceSources!.persons!.reverse(); });
  expect(calculateFederalTax(input).agi.eq(result.agi)).toBe(true);
  const binding = sharedOwnerHealthInput(); binding.scheduleC!.grossReceipts = '1000';
  expect(() => calculateFederalTax(binding)).toThrow(/owner.*earned.income/i);
  const cap = sharedOwnerHealthInput();
  for (let i = 0; i < 2; i++) {
    const original = cap.form1095A[i]!, plan = cap.form7206!.plans![i]!;
    original.monthlyPremiums.forEach(row => { row.advancePremiumTaxCredit = row.enrolleePremium; });
    cap.form8962!.sharedPolicyAllocations!.policies![i]!.original = structuredClone(original);
    plan.payments!.forEach(payment => { payment.advancePremiumTaxCredit = payment.grossPremium; payment.ownerOrBusinessPaid = '0'; payment.otherPersonPaid = '0';
      payment.personAmounts!.forEach(person => { person.amountPaid = '0'; person.advancePremiumTaxCredit = i === 0 ? '500' : '250'; }); });
  }
  cap.form8962!.monthlyReconciliation!.forEach(row => { row.advancePremiumTaxCredit = '750'; });
  expect(() => calculateFederalTax(cap)).toThrow(/repayment.cap|binding.*cap/i);
});
