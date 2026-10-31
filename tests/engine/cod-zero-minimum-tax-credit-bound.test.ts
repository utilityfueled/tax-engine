// Spec: spec/federal/cod-zero-minimum-tax-credit-bound.yaml.
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateCodZeroMinimumTaxCreditBound } from '@/engine/forms/cod-zero-minimum-tax-credit-bound.js';
import { codAttributeRecord } from '../fixtures/cod-ordinary-attributes.js';
import { partialPersonalLegacyNolInput, partialPersonalLargeNolInput } from '../fixtures/cod-partial-personal.js';
import { partialPersonalLegacyNolZeroPoolInput, partialPersonalLargeNolZeroPoolInput } from '../fixtures/cod-zero-minimum-tax-credit-bound.js';

it('proves the zero next pool without inventing signed generation for actual positive NOL sources', () => {
  for (const [incomplete, complete] of [
    [partialPersonalLegacyNolInput, partialPersonalLegacyNolZeroPoolInput],
    [partialPersonalLargeNolInput, partialPersonalLargeNolZeroPoolInput],
  ]) {
    expect(() => calculateFederalTax(incomplete!())).toThrow(/COD current-year minimum tax credit/);
    const input = complete!(), original = JSON.stringify(input), result = calculateFederalTax(input);
    expect(result).toMatchObject({ codZeroMinimumTaxCreditBound: {
      method: 'zero_available_pool_bound', sourceFactsVerified: true, sourceTaxYear: 2025,
      currentAmt: new Decimal(0), currentFormCarry: new Decimal(0), currentYearUnallowedQualifiedElectricVehicleCredit: new Decimal(0),
      followingYearPool: new Decimal(0),
    } });
    expect(result.currentMinimumTaxCredit).toBeUndefined();
    expect(result.allLines.some(row => row.form === 'Minimum tax credit source year')).toBe(false);
    expect(result.form8801!.sourceFactsVerified).toBe(true);
    expect(result.form8801!.carryforwardToNextYear.toFixed()).toBe('0');
    expect(result.codAttributeReduction!.regular.minimumTaxCreditPool).toBeUndefined();
    expect(result.codAttributeReduction!.regular.stages.find(row => row.kind === 'minimum_tax_credit')!.attributeReduction.toFixed()).toBe('0');
    expect(JSON.stringify(input)).toBe(original);
  }
});

it('retains ordinary prior credit sources that were fully used before the zero pool bound', () => {
  const input = partialPersonalLegacyNolZeroPoolInput();
  input.form8801!.unusedMinimumTaxCreditCarryforward = '1000';
  input.form982AttributeSources!.regular!.records = [codAttributeRecord('minimum_tax_credit', '1000', '1000')];
  const result = calculateFederalTax(input);
  expect(result.form8801!.totalAvailableCredit.toFixed()).toBe('1000');
  expect(result.form8801!.creditAllowed.toFixed()).toBe('1000');
  expect(result.form8801!.carryforwardToNextYear.toFixed()).toBe('0');
  const row = result.codAttributeReduction!.regular.records.find(record => record.kind === 'minimum_tax_credit')!;
  expect(row.opening.toFixed()).toBe('1000'); expect(row.currentUse.toFixed()).toBe('1000');
  expect(row.attributeReduction.toFixed()).toBe('0'); expect(row.remaining.toFixed()).toBe('0');
  expect(result.codAttributeReduction!.regular.minimumTaxCreditPool).toBeUndefined();
  expect(result.currentMinimumTaxCredit).toBeUndefined();
});

it('rejects absent or contradictory premises without treating unknown current legacy credit as zero', () => {
  for (const change of [
    (input: ReturnType<typeof partialPersonalLegacyNolZeroPoolInput>) => { delete input.form8801; },
    (input: ReturnType<typeof partialPersonalLegacyNolZeroPoolInput>) => { Reflect.deleteProperty(input.form982AttributeSources!.currentMinimumTaxCredit!, 'currentYearUnallowedQualifiedElectricVehicleCredit'); },
    (input: ReturnType<typeof partialPersonalLegacyNolZeroPoolInput>) => { Object.assign(input.form982AttributeSources!.currentMinimumTaxCredit!, { currentYearUnallowedQualifiedElectricVehicleCredit: '1' }); },
    (input: ReturnType<typeof partialPersonalLegacyNolZeroPoolInput>) => { input.form982AttributeSources!.currentMinimumTaxCredit!.sourceFactsConfirmed = false; },
    (input: ReturnType<typeof partialPersonalLegacyNolZeroPoolInput>) => { input.form8801!.unusedMinimumTaxCreditCarryforward = '100000'; },
  ]) {
    const input = partialPersonalLegacyNolZeroPoolInput(); change(input);
    expect(() => calculateFederalTax(input)).toThrow(/COD.*minimum tax credit|COD.*zero.*pool/i);
  }
});

it('rejects a positive current AMT and a stale full Form8801 at the bound itself', () => {
  const input = partialPersonalLegacyNolZeroPoolInput(), result = calculateFederalTax(input);
  const form6251 = result.form6251!, form8801 = result.form8801!;
  expect(calculateCodZeroMinimumTaxCreditBound(input, { form6251, form8801 })?.followingYearPool.toFixed()).toBe('0');
  expect(() => calculateCodZeroMinimumTaxCreditBound(input, { form6251: { ...form6251, amt: new Decimal(1) }, form8801 })).toThrow(/zero minimum tax credit pool/);
  expect(() => calculateCodZeroMinimumTaxCreditBound(input, { form6251, form8801: { ...form8801, carryforwardToNextYear: new Decimal(1) } })).toThrow(/zero minimum tax credit pool/);
  expect(() => calculateCodZeroMinimumTaxCreditBound(input, { form6251, form8801: { ...form8801, sourceFactsVerified: false } })).toThrow(/zero minimum tax credit pool/);
  expect(() => calculateCodZeroMinimumTaxCreditBound(input, { form6251 })).toThrow(/zero minimum tax credit pool/);
  // High regular tax leaves AMT at zero, so wages alone never defeat the proof.
  const high = partialPersonalLegacyNolZeroPoolInput(); high.w2s[0]!.wages = '1000000'; high.w2s[0]!.federalWithheld = '600000';
  expect(calculateFederalTax(high).codZeroMinimumTaxCreditBound?.currentAmt.toFixed()).toBe('0');
});
