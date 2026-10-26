import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm7206 } from '@/engine/forms/form-7206.js';
import { d, roundDollar, sum } from '@/utils/decimal.js';
import { coverageFamilyHealthInput, sharedCoverageFamilyHealthInput } from '../fixtures/coverage-family-health.js';

describe('coverage-family canonical health', () => {
  it('keeps original enrollment and actual advances while deriving separate health premium classes', () => {
    for (const fixture of [coverageFamilyHealthInput(), sharedCoverageFamilyHealthInput(), sharedCoverageFamilyHealthInput(true)]) {
      const { input } = fixture; input.scheduleC!.grossReceipts = '100000'; const before = structuredClone(input);
      const result = calculateFederalTax(input), medical = result.form7206!;
      expect(roundDollar(medical.businesses[0].medicalPremiums).toFixed()).toBe('5000');
      expect(roundDollar(medical.businesses[0].specifiedPremiums).toFixed()).toBe('10000');
      expect(sum(...result.form8962!.lines.filter(line => /^(11|1[2-9]|2[0-3])a$/.test(line.line)).map(line => line.value)).toFixed()).toBe('15000');
      expect(result.form8962!.advancePTCTotal.toFixed()).toBe(input.form8962!.monthlyReconciliation![0].advancePremiumTaxCredit === '0' ? '0' : '6000');
      expect(roundDollar(result.marketplaceHealthInsurance!.businesses[0].allocatedCredit).eq(result.marketplaceHealthInsurance!.step2Credit)).toBe(true);
      expect(roundDollar(sum(...medical.sourceRecords.map(row => row.amountPaid))).eq(medical.paidSourcePremiums)).toBe(true);
      expect(input).toEqual(before);
    }
  });
  it('retains signed Step3 before adding nonspecified premiums and the once-only QBI transfer', () => {
    const { input } = coverageFamilyHealthInput(); input.scheduleC!.grossReceipts = '40000';
    const result = calculateFederalTax(input), health = result.marketplaceHealthInsurance!;
    expect(health.step2Credit.toFixed()).toBe('12000');
    expect(health.businesses[0].netPremiumsAfterCredit.toFixed(2)).toBe('-2000.00');
    expect(health.specifiedDeduction.toFixed(2)).toBe('-2000.00');
    expect(health.nonspecifiedDeduction.toFixed(2)).toBe('5000.00');
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('3000');
    expect(result.agi.toFixed()).toBe('34174');
    expect(result.schedule1!.seHealthInsurance.plus(result.form8962!.ptcAllowed).lte(15000)).toBe(true);
  });
  it('retains actual advances above the specified premium and signed WorksheetW', () => {
    const { input, coverageFamilySources } = coverageFamilyHealthInput(); input.scheduleC!.grossReceipts = '40000';
    for (const row of input.form1095A[0].monthlyPremiums) row.advancePremiumTaxCredit = '1000';
    coverageFamilySources.policies[0].original = structuredClone(input.form1095A[0]);
    for (const row of input.form8962!.monthlyReconciliation!) row.advancePremiumTaxCredit = '1000';
    for (const row of input.form7206!.plans![0].payments!) {
      row.ownerOrBusinessPaid = '250'; row.advancePremiumTaxCredit = '1000';
      row.personAmounts![0].amountPaid = '0'; row.personAmounts![0].advancePremiumTaxCredit = '1000'; row.personAmounts![1].amountPaid = '250';
    }
    const result = calculateFederalTax(input), w = result.marketplaceHealthInsurance!.historicalLimit!;
    expect(w.specifiedAdvances.toFixed()).toBe('12000');
    expect(w.lines.find(row => row.form === 'Pub974 Worksheet W' && row.line === '2')!.formula).toContain('actual source');
    expect(result.marketplaceHealthInsurance!.lines.find(row => row.form === 'Pub974 Simplified scheduleC' && row.line === '6')!.formula).toContain('Full corresponding');
    expect(w.preliminarySpecifiedDeduction.toFixed(2)).toBe('-2000.00');
    expect(w.lines.find(row => row.form === 'Pub974 Worksheet W' && row.line === '17')!.value.toFixed(2)).toBe('3000.00');
    expect(result.schedule1!.seHealthInsurance.gte(0)).toBe(true);
    expect(result.schedule1!.seHealthInsurance.plus(result.form8962!.ptcAllowed).lte(15000)).toBe(true);
  });
  it('retains signed premium cents while transferring zero printed health and QBI', () => {
    const { input, coverageFamilySources } = coverageFamilyHealthInput();
    input.scheduleC!.grossReceipts = '40000';
    input.form7206!.plans![0].allCoveredPersonsInCoverageFamilyConfirmed = true;
    for (const month of coverageFamilySources.months) {
      month.personFacts[1].otherMecEligible = false;
      month.coverageFamilySlcsp = '1500'; month.nonCoverageFamilySlcsp = '0';
      month.coverageFamilyMemberSsns = ['123-45-6789', '987-65-4321']; month.nonCoverageFamilyMemberSsns = [];
    }
    for (const month of input.form1095A[0].monthlyPremiums) Object.assign(month, { enrolleePremium: '1249.99', slcsp: '1500' });
    coverageFamilySources.policies[0].original = structuredClone(input.form1095A[0]);
    for (const month of input.form8962!.monthlyReconciliation!) Object.assign(month, { enrolleePremium: '1249.99', slcsp: '1500' });
    for (const payment of input.form7206!.plans![0].payments!) {
      payment.grossPremium = '1249.99'; payment.ownerOrBusinessPaid = '749.99'; payment.personAmounts![0].amountPaid = '349.99';
    }
    const before = structuredClone(input), result = calculateFederalTax(input);
    expect(result.form8962!.ptcAllowed.toFixed()).toBe('15000');
    expect(result.marketplaceHealthInsurance!.businesses[0].netPremiumsAfterCredit.toFixed()).toBe('-0.12');
    expect(result.marketplaceHealthInsurance!.specifiedDeduction.toFixed()).toBe('-0.12');
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('0');
    expect(result.allLines.find(row => row.form === 'QBI Source Deductions' && row.line === 'scheduleC')?.inputs['SE health insurance'].toString()).toBe('0');
    expect(result.form7206!.grossSourcePremiums.toFixed()).toBe('14999.88');
    expect(input).toEqual(before);
  });
  it('requires original context before completing any coverage-family business calculation', () => {
    const { input } = coverageFamilyHealthInput();
    expect(() => calculateForm7206({ facts: input.form7206!, taxYear: 2025, filingStatus: input.taxpayer.filingStatus, marketplaceHandling: 'separate-specified-premiums', businesses: [{sourceId:'scheduleC', accountHolder:'primary', kind:'self_employed', netIncome:d(50000),ownerPositiveBusinessIncome:d(50000),ownerDeductibleSelfEmploymentTax:d(0),attributableRetirementDeduction:d(0),attributableForeignExclusion:d(0)}] })).toThrow(/original|coverage.family/i);
  });
  it('preserves actual empty coverage months and excludes known health-ineligible advances', () => {
    const { input, coverageFamilySources } = coverageFamilyHealthInput();
    input.scheduleC!.grossReceipts = '100000';
    const month = coverageFamilySources.months[0];
    month.personFacts[0].otherMecEligible = true;
    month.coverageFamilySlcsp = '0'; month.coverageFamilyMemberSsns = [];
    month.nonCoverageFamilySlcsp = '1500'; month.nonCoverageFamilyMemberSsns = ['123-45-6789','987-65-4321'];
    Object.assign(input.form1095A[0].monthlyPremiums[0], { advancePremiumTaxCredit: '0', slcsp: '0' });
    coverageFamilySources.policies[0].original = structuredClone(input.form1095A[0]);
    Object.assign(input.form8962!.monthlyReconciliation![0], { advancePremiumTaxCredit: '0', slcsp: '0', coverageEligible: false });
    const paid = input.form7206!.plans![0].payments![0];
    paid.ownerOrBusinessPaid = '1250'; paid.advancePremiumTaxCredit = '0';
    paid.personAmounts![0].amountPaid = '850'; paid.personAmounts![0].advancePremiumTaxCredit = '0';
    const result = calculateFederalTax(input);
    expect(result.form7206!.coverageFamilyAllocations![0].specifiedPremium.toFixed()).toBe('0');
    expect(result.form7206!.coverageFamilyAllocations![0].nonspecifiedPremium.toFixed()).toBe('1250');
    expect(result.form8962!.advancePTCTotal.toFixed()).toBe('5500');
    expect(roundDollar(result.form7206!.businesses[0].specifiedPremiums).toFixed()).toBe('9167');
    const excluded = coverageFamilyHealthInput().input;
    excluded.form7206!.plans![0].establishedUnderBusiness = false;
    const noDeduction = calculateFederalTax(excluded);
    expect(noDeduction.schedule1!.seHealthInsurance.toFixed()).toBe('0');
    expect(noDeduction.marketplaceHealthInsurance!.historicalLimit!.specifiedAdvances.toFixed()).toBe('0');
    expect(noDeduction.form8962!.advancePTCTotal.toFixed()).toBe('6000');
  });
});
