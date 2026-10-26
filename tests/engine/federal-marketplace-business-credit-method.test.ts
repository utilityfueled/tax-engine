// Spec: spec/federal/marketplace-business-credit-method.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { marketplaceBusinessCreditMethodInput, sharedMarketplaceBusinessCreditMethodInput } from '../fixtures/marketplace-business-credit-method.js';
import { d } from '@/utils/decimal.js';
import { Form1099IntSchema } from '@/models/inputs.js';

it('combines signed business worksheets using the recorded monthly premium method', () => {
  const input = marketplaceBusinessCreditMethodInput(), before = structuredClone(input), result = calculateFederalTax(input);
  const health = result.marketplaceHealthInsurance!;
  expect(health.step2Credit.toFixed()).toBe('12000');
  expect(health.businesses.map(row => [row.businessSourceId, row.allocatedCredit.toFixed(2), row.netPremiumsAfterCredit.toFixed(2)]))
    .toEqual([['scheduleC', '7200.00', '-4200.00'], ['scheduleF', '4800.00', '1200.00']]);
  expect([health.specifiedDeduction.toFixed(2), health.nonspecifiedDeduction.toFixed(2), result.schedule1!.seHealthInsurance.toFixed()]).toEqual(['-3000.00', '6000.00', '3000']);
  expect(result.allLines.filter(row => row.form === 'QBI Source Deductions' && ['scheduleC', 'scheduleF'].includes(row.line))
    .map(row => [row.line, row.inputs['SE health insurance'].toString()])).toEqual([['scheduleC','1500'],['scheduleF','1500']]);
  expect(result.schedule1!.seHealthInsurance.plus(result.form8962!.ptcAllowed).lte(15000)).toBe(true);
  expect(input).toEqual(before);
});
it('does not invent an allocation choice or missing method facts', () => {
  for (const property of ['choice', 'sourceFactsConfirmed', 'sourceTaxYear', 'sourceReference', 'sameMethodForAllCalculationsConfirmed']) {
    const input = marketplaceBusinessCreditMethodInput();
    const facts = input.form7206 as unknown as { marketplaceCreditAllocation?: Record<string, unknown> };
    if (property === 'choice') delete facts.marketplaceCreditAllocation;
    else delete facts.marketplaceCreditAllocation![property];
    expect(() => calculateFederalTax(input)).toThrow(/method|allocation|source|choice/i);
  }
});
it('preserves original policy and payment order independence', () => {
  const input = marketplaceBusinessCreditMethodInput();
  input.form7206!.plans!.reverse(); input.form7206!.plans!.forEach(plan => plan.payments!.reverse());
  const result = calculateFederalTax(input);
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('3000');
  expect(result.marketplaceHealthInsurance!.businesses.map(row => [row.businessSourceId,row.allocatedCredit.toFixed(2)]).sort())
    .toEqual([['scheduleC','7200.00'],['scheduleF','4800.00']]);
});

it('attributes the combined signed claim to its actual owner without borrowing spouse income', () => {
  for (const year of [2025, 2026]) {
    const input = marketplaceBusinessCreditMethodInput(year); input.scheduleF!.accountHolder = 'spouse';
    const plan = input.form7206!.plans![1]; plan.accountHolder = 'spouse'; plan.coveredPersons![0].relationshipToOwner = 'spouse';
    const result = calculateFederalTax(input);
    // 2026 Step2 AGI22,174 is below133%FPL: RevProc2025-25 rate.0210
    // gives466 contribution and11,534 credit. 60/40 credit shares produce
    // owner combined2,079.60/1,386.40, transferred once as2,080/1,386.
    expect(result.marketplaceHealthInsurance!.step2Credit.toFixed()).toBe(year === 2025 ? '12000' : '11534');
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe(year === 2025 ? '3000' : '3466');
    expect(result.allLines.filter(row => row.form === 'QBI Source Deductions' && ['scheduleC', 'scheduleF'].includes(row.line))
      .map(row => [row.line, row.inputs['SE health insurance'].toString()])).toEqual(year === 2025 ? [['scheduleC','1800'],['scheduleF','1200']] : [['scheduleC','2080'],['scheduleF','1386']]);
  }
});
it('excludes a known health-ineligible business from income limits and QBI attribution', () => {
  const input = marketplaceBusinessCreditMethodInput(); input.form7206!.plans![1].establishedUnderBusiness = false;
  const result = calculateFederalTax(input);
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('1800');
  expect(result.allLines.filter(row => row.form === 'QBI Source Deductions' && ['scheduleC', 'scheduleF'].includes(row.line))
    .map(row => [row.line, row.inputs['SE health insurance'].toString()])).toEqual([['scheduleC','1800'],['scheduleF','0']]);
});
it('conserves three partial-year policy sources and original cents independent of order', () => {
  const input = marketplaceBusinessCreditMethodInput();
  input.scheduleC!.grossReceipts = '22000'; input.scheduleF!.salesOfProductsRaised = '22000';
  const thirdOriginal = structuredClone(input.form1095A[1]);
  thirdOriginal.policyNumber = 'Actual July through December policy';
  thirdOriginal.coveredIndividuals!.forEach(person => { person.firstMonth = 7; });
  thirdOriginal.monthlyPremiums = thirdOriginal.monthlyPremiums.filter(row => row.month >= 7).map(row => ({ ...row, enrolleePremium: '250' }));
  input.form1095A.push(thirdOriginal);
  const third = structuredClone(input.form7206!.plans![1]);
  Object.assign(third, { planId: 'second-c-plan', businessSourceId: 'scheduleC', policyReference: 'Actual second business policy', marketplacePolicySourceIds: ['form1095A:2'] });
  third.months = third.months!.filter(row => row.month! >= 7);
  third.payments = third.payments!.filter(row => row.coverageMonth! >= 7).map(row => ({ ...row, sourceId: `third:${row.sourceId}`, grossPremium: '250', ownerOrBusinessPaid: '250', personAmounts: row.personAmounts!.map(person => ({ ...person, amountPaid: '250' })) }));
  third.coverageFamilySources!.policies = [{ sourceId: 'form1095A:2', original: structuredClone(thirdOriginal) }];
  third.coverageFamilySources!.months = third.coverageFamilySources!.months!.filter(row => row.month! >= 7);
  input.form7206!.plans!.push(third);
  input.form8962!.monthlyReconciliation!.filter(row => row.month >= 7).forEach(row => { row.enrolleePremium = '1500'; });
  input.form1095A[0].monthlyPremiums[0].enrolleePremium = '750.01';
  const first = input.form7206!.plans![0];
  first.payments![0].grossPremium = first.payments![0].ownerOrBusinessPaid = '750.01';
  first.payments![0].personAmounts![0].amountPaid = '250.01';
  first.coverageFamilySources!.policies![0].original = structuredClone(input.form1095A[0]);
  input.form8962!.monthlyReconciliation![0].enrolleePremium = '1250.01';
  const before = structuredClone(input), result = calculateFederalTax(input);
  expect(result.marketplaceHealthInsurance!.step2Credit.toFixed()).toBe('12000');
  expect(result.marketplaceHealthInsurance!.businesses.map(row => [row.businessSourceId, row.allocatedCredit.toFixed(10)]).sort()).toEqual([['scheduleC', '7600.0031999744'], ['scheduleF', '4399.9968000256']]);
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('4500');
  const qbi = (value: typeof result) => value.allLines.filter(row => row.form === 'QBI Source Deductions' && ['scheduleC','scheduleF'].includes(row.line)).map(row => [row.line, d(row.inputs['SE health insurance'].toString()).toFixed()]).sort();
  expect(qbi(result)).toEqual([['scheduleC','2250'],['scheduleF','2250']]);
  const reversed = structuredClone(input); reversed.form7206!.plans!.reverse(); reversed.form7206!.plans!.forEach(plan => plan.payments!.reverse());
  const again = calculateFederalTax(reversed);
  expect(again.schedule1!.seHealthInsurance.eq(result.schedule1!.seHealthInsurance)).toBe(true); expect(qbi(again)).toEqual(qbi(result));
  expect(input).toEqual(before);
});
it('limits each actual owner after signed allocation and preserves independent advances', () => {
  for (const year of [2025,2026]) for (const advances of [false,true]) {
    const input = marketplaceBusinessCreditMethodInput(year);
    input.scheduleC!.grossReceipts = '30000'; input.scheduleF!.salesOfProductsRaised = '1000'; input.scheduleF!.accountHolder = 'spouse';
    const second = input.form7206!.plans![1]; second.accountHolder = 'spouse'; second.coveredPersons![0].relationshipToOwner = 'spouse';
    input.form1099Int.push(Form1099IntSchema.parse({ payer: 'Actual bank', interestIncome: '10000' }));
    if (advances) {
      for (const [index, plan] of input.form7206!.plans!.entries()) {
        const amount = index === 0 ? '200' : '500';
        for (const row of input.form1095A[index].monthlyPremiums) row.advancePremiumTaxCredit = amount;
        plan.coverageFamilySources!.policies![0].original = structuredClone(input.form1095A[index]);
        for (const payment of plan.payments!) {
          payment.advancePremiumTaxCredit = amount; payment.ownerOrBusinessPaid = index === 0 ? '550' : '0';
          payment.personAmounts![0].advancePremiumTaxCredit = amount; payment.personAmounts![0].amountPaid = index === 0 ? '50' : '0';
        }
      }
      for (const row of input.form8962!.monthlyReconciliation!) row.advancePremiumTaxCredit = '700';
    }
    const before = structuredClone(input);
    if (year === 2025 && advances) {
      expect(() => calculateFederalTax(input)).toThrow(/owner.*capped|capped.*owner|capped-repayment/i);
    } else {
      const result = calculateFederalTax(input);
      expect(result.marketplaceHealthInsurance!.maximumDeduction.toFixed()).toBe('9929');
      expect(result.marketplaceHealthInsurance!.step2Credit.toFixed()).toBe(year === 2025 ? '12000' : '11038');
      expect(result.schedule1!.seHealthInsurance.toFixed()).toBe(year === 2025 ? '2729' : '3306');
      expect(result.allLines.filter(row => row.form === 'QBI Source Deductions' && ['scheduleC','scheduleF'].includes(row.line)).map(row => [row.line,row.inputs['SE health insurance'].toString()])).toEqual([['scheduleC',year === 2025 ? '1800' : '2377'],['scheduleF','929']]);
      expect(result.form8962!.advancePTCTotal.toFixed()).toBe(advances ? '8400' : '0');
    }
    expect(input).toEqual(before);
  }
});
it('keeps rounded QBI attribution stable when actual plan order changes', () => {
  const input = marketplaceBusinessCreditMethodInput();
  input.form1095A[0].monthlyPremiums[0].enrolleePremium = '751';
  const plan = input.form7206!.plans![0]; plan.payments![0].grossPremium = plan.payments![0].ownerOrBusinessPaid = '751';
  plan.payments![0].personAmounts![0].amountPaid = '251'; plan.coverageFamilySources!.policies![0].original = structuredClone(input.form1095A[0]);
  input.form8962!.monthlyReconciliation![0].enrolleePremium = '1251';
  const sourceClaims = (reversed: boolean) => {
    const changed = structuredClone(input); if (reversed) changed.form7206!.plans!.reverse();
    const result = calculateFederalTax(changed); expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('3001');
    return result.allLines.filter(row => row.form === 'QBI Source Deductions' && ['scheduleC','scheduleF'].includes(row.line)).map(row => [row.line,row.inputs['SE health insurance'].toString()]).sort();
  };
  expect(sourceClaims(false)).toEqual([['scheduleC','1501'],['scheduleF','1500']]);
  expect(sourceClaims(true)).toEqual(sourceClaims(false));
});

it('composes original shared allocation sources before the recorded business method', () => {
  for (const noAdvance of [false,true]) {
    const input = sharedMarketplaceBusinessCreditMethodInput(noAdvance), before = structuredClone(input), result = calculateFederalTax(input);
    expect(result.marketplaceHealthInsurance!.businesses.map(row => [row.businessSourceId,row.allocatedCredit.toFixed(2)])).toEqual([['scheduleC','7200.00'],['scheduleF','4800.00']]);
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('3000');
    expect(result.form8962!.annualPremium.toFixed()).toBe('15000');
    const wrong = structuredClone(input); wrong.form7206!.plans![0].payments![0].ownerOrBusinessPaid = '749.99';
    expect(() => calculateFederalTax(wrong)).toThrow(/paid|payment|reconcile|source/i);
    expect(input).toEqual(before);
  }
});
