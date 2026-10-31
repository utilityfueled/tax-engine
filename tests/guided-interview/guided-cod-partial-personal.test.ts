// Spec: spec/federal/cod-partial-personal-insolvency.yaml guide.
import { expect, it } from 'vitest';
import { buildGuidedCodNol, updateGuidedCodNol } from '@/lib/guided-cod-nol';
import { buildGuidedCodAttributes, invalidateGuidedCodAttributes } from '@/lib/guided-cod-attributes';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { guidedCodPartialPersonalState } from '../fixtures/guided-cod-partial-personal';
import { partialPersonalBasisInput } from '../fixtures/cod-partial-personal';

it('binds the original personal use and interest records after actual reconfirmation', () => {
  const state = guidedCodPartialPersonalState(), data = state.sectionData.adjustments!.codNolSources!, original = JSON.stringify(state);
  const canonical = partialPersonalBasisInput(), built = buildGuidedCodNol(data, state);
  expect(built!.form1099C).toEqual(canonical.form1099C);
  expect(built!.form982NolSources).toEqual(canonical.form982NolSources);
  expect(built!.form982AttributeSources).toEqual(canonical.form982AttributeSources);
  expect(built!.form982NolSources.debts![0]!.personalDebt).not.toHaveProperty('excludedAmount');
  const raw = buildTaxInputFromGuidedData(state); expect(raw).not.toBeNull();
  const result = calculateFederalTax(TaxYearInputSchema.parse(raw));
  expect(result.schedule1!.cancelledDebtIncome.toFixed()).toBe('8000');
  expect(result.codAttributeReduction!.regular.property.remainingBasis.toFixed()).toBe('72000');
  expect(JSON.stringify(state)).toBe(original);
  const debts = structuredClone(data.debts!);
  debts[0]!.personalDebt!.useSourceReference = 'Different original source for the same personal purchase amounts';
  const changed = updateGuidedCodNol(data, { debts });
  expect(changed.sourceFactsConfirmed).toBeNull();
  expect(changed.debts![0]!.sourceFactsConfirmed).toBeNull();
  expect(changed.debts![0]!.personalDebt!.sourceFactsConfirmed).toBeNull();
  expect(() => buildGuidedCodNol(changed, state)).toThrow();
});

it('retains the separate current-year legacy vehicle credit fact without defaulting zero', () => {
  // Spec: cod-zero-minimum-tax-credit-bound.yaml guide.
  const state = guidedCodPartialPersonalState(), data = state.sectionData.adjustments!.codNolSources!;
  const current = data.attributeSources!.currentMinimumTaxCredit!;
  expect(buildGuidedCodAttributes(data.attributeSources)!.currentMinimumTaxCredit).not.toHaveProperty('currentYearUnallowedQualifiedElectricVehicleCredit');
  const entered = { ...data.attributeSources!, currentMinimumTaxCredit: { ...current, currentYearUnallowedQualifiedElectricVehicleCredit: '0' } };
  expect(buildGuidedCodAttributes(entered)!.currentMinimumTaxCredit!.currentYearUnallowedQualifiedElectricVehicleCredit).toBe('0');
  const blank = { ...entered, currentMinimumTaxCredit: { ...current, currentYearUnallowedQualifiedElectricVehicleCredit: ' ' } };
  expect(() => buildGuidedCodAttributes(blank)).toThrow(/actual later-attribute/);
  const changed = invalidateGuidedCodAttributes(entered);
  expect(changed.sourceFactsConfirmed).toBeNull();
  expect(changed.currentMinimumTaxCredit!.sourceFactsConfirmed).toBeNull();
  expect(changed.currentMinimumTaxCredit!.currentYearUnallowedQualifiedElectricVehicleCredit).toBe('0');
});

it('keeps missing debt-use and actual interest amounts unknown', () => {
  const state = guidedCodPartialPersonalState(), original = state.sectionData.adjustments!.codNolSources!;
  for (const mutate of [
    (value: typeof original) => { value.debts![0]!.personalDebt = undefined; },
    (value: typeof original) => { value.debts![0]!.personalDebt!.actualDischargedInterest = ''; },
    (value: typeof original) => { value.debts![0]!.personalDebt!.interestTreatment = undefined; },
    (value: typeof original) => { value.debts![0]!.personalDebt!.borrowingNotDeductibleUnpaidExpenseConfirmed = null; },
  ]) {
    const changed = structuredClone(original); mutate(changed);
    expect(() => buildGuidedCodNol(changed, state)).toThrow();
    expect(JSON.stringify(original)).toBe(JSON.stringify(state.sectionData.adjustments!.codNolSources));
  }
});
