// Spec: spec/federal/foreign-tax-state-allocation.yaml.
import { expect, it } from 'vitest';
import { buildGuidedForeignTaxCarryover } from '@/lib/guided-foreign-tax-carryover';
import { guidedCarryoverFixture } from '../fixtures/guided-foreign-tax-carryover';

it('preserves actual state country sources and rejects incomplete facts', () => {
  const { facts, investment } = guidedCarryoverFixture();
  const source = { ...facts.deductionYearCarryover, itemizedAllocation: {
    sourceReference: 'Actual allowed itemized deductions', sourceFactsConfirmed: true,
    incomeOrSalesTaxes: '6,000.00', homeRealPropertyTaxes: '0', personalPropertyTaxes: '0',
    stateIncomeTaxes: [{ stateCode: 'ny', deductibleAmount: '6,000', stateTaxableIncome: '90,000', foreignIncomeSpecificallyExempt: false,
      sourceReference: 'Actual state-source worksheet', countryIncomeConfirmed: true,
      countryIncome: [{ foreignCountry: 'Canada', stateTaxableIncome: '3,500.25', sourceReference: 'Actual country taxable income' }] }],
  } };
  const before = JSON.stringify(source);
  const result = buildGuidedForeignTaxCarryover(source, investment, 2025, 'single');
  expect(result?.itemizedAllocation?.stateIncomeTaxes?.[0]).toMatchObject({ stateCode: 'NY', countryIncomeConfirmed: true,
    countryIncome: [{ foreignCountry: 'Canada', stateTaxableIncome: '3500.25', sourceReference: 'Actual country taxable income' }] });
  expect(JSON.stringify(source)).toBe(before);
  const country = source.itemizedAllocation.stateIncomeTaxes[0].countryIncome[0];
  for (const patch of [
    { countryIncomeConfirmed: undefined }, { countryIncomeConfirmed: false }, { countryIncome: undefined }, { countryIncome: [] },
    { countryIncome: [{ ...country, stateTaxableIncome: '' }] }, { countryIncome: [{ ...country, sourceReference: '' }] },
    { countryIncome: [{ ...country, stateTaxableIncome: '-1' }] }, { countryIncome: [{ ...country, stateTaxableIncome: '5000.01' }] },
    { countryIncome: [{ ...country, foreignCountry: 'France' }] }, { countryIncome: [country, country] },
  ]) {
    const changed = structuredClone(source);
    Object.assign(changed.itemizedAllocation.stateIncomeTaxes[0], patch);
    expect(() => buildGuidedForeignTaxCarryover(changed, investment, 2025, 'single')).toThrow(/country|state|income|source/i);
  }
  const knownZero = structuredClone(source);
  knownZero.itemizedAllocation.stateIncomeTaxes[0].countryIncome[0].stateTaxableIncome = '0';
  expect(buildGuidedForeignTaxCarryover(knownZero, investment, 2025, 'single')?.itemizedAllocation?.stateIncomeTaxes?.[0].countryIncome?.[0].stateTaxableIncome).toBe('0');
});
