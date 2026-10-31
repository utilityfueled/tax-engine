// Spec: spec/federal/cod-title-11-chapter-13.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildForm982ReferenceSummary } from '@/pdf/mappings/2025/fill-form-982.js';
import { actualPartialPersonalCodInput } from '../fixtures/cod-partial-personal.js';

const court = { sourceReference: 'Fictional chapter 13 discharge order', sourceFactsConfirmed: true, debtorUnderCourtJurisdictionConfirmed: true, dischargeByCourtOrApprovedPlanConfirmed: true };
function title11(options: Parameters<typeof actualPartialPersonalCodInput>[0] = {}, patch: Record<string, unknown> = {}) {
  const input = actualPartialPersonalCodInput({ debt: '18000', interest: '0', liabilities: '90000', assets: '80000', eventCode: 'A', ...options });
  Object.assign(input.form982NolSources!, { title11Case: true, title11Chapter: '13', title11Source: court, ...patch });
  input.codExclusion!.bankruptcy = true;
  return input;
}

it('excludes the complete chapter 13 discharge', () => {
  const insolvent = calculateFederalTax(title11());
  expect(insolvent.schedule1!.cancelledDebtIncome.toFixed()).toBe('0');
  expect(insolvent.codNolReduction!.sourceExcludedAmount.toFixed()).toBe('18000');
  expect(insolvent.codNolReduction!.reportedExcludedAmount.toFixed()).toBe('18000');
  expect(insolvent.codNolReduction!.title11).toBe(true);
  const solvent = calculateFederalTax(title11({ assets: '200000' }));
  expect(solvent.schedule1!.cancelledDebtIncome.toFixed()).toBe('0');
  expect(solvent.codNolReduction!.sourceExcludedAmount.toFixed()).toBe('18000');
  const insolvency = actualPartialPersonalCodInput({ debt: '18000', interest: '0', liabilities: '90000', assets: '80000' });
  expect(calculateFederalTax(insolvency).schedule1!.cancelledDebtIncome.toFixed()).toBe('8000');
});

it('requires the chapter, court and code facts', () => {
  for (const title11Chapter of ['7', '11', '12', undefined]) expect(() => calculateFederalTax(title11({}, { title11Chapter })), String(title11Chapter)).toThrow(/separate bankruptcy estate method/);
  for (const patch of [{ sourceReference: ' ' }, { sourceFactsConfirmed: false }, { debtorUnderCourtJurisdictionConfirmed: undefined }, { dischargeByCourtOrApprovedPlanConfirmed: false }]) {
    expect(() => calculateFederalTax(title11({}, { title11Source: { ...court, ...patch } })), JSON.stringify(patch)).toThrow(/court record/);
  }
  expect(() => calculateFederalTax(title11({}, { title11Source: undefined }))).toThrow(/court record/);
  expect(() => calculateFederalTax(title11({ eventCode: 'G' }))).toThrow(/personal recourse debt/);
  const noExclusion = title11(); noExclusion.codExclusion!.bankruptcy = false;
  expect(() => calculateFederalTax(noExclusion)).toThrow(/actual insolvency-only exclusion|title11 exclusion/);
  const noAnswer = title11({}, { title11Case: undefined }); noAnswer.codExclusion!.bankruptcy = false;
  expect(() => calculateFederalTax(noAnswer)).toThrow(/COD title11/);
  const outside = actualPartialPersonalCodInput({ debt: '18000', interest: '0', liabilities: '90000', assets: '80000', eventCode: 'A' });
  expect(() => calculateFederalTax(outside)).toThrow(/personal recourse debt/);
  const legacy = actualPartialPersonalCodInput({ debt: '18000', interest: '0', liabilities: '90000', assets: '80000' }); legacy.codExclusion!.bankruptcy = true;
  expect(() => calculateFederalTax(legacy)).toThrow(/actual insolvency-only exclusion|title11 exclusion/);
});

it('reduces attributes from the full exclusion', () => {
  const result = calculateFederalTax(title11());
  expect(result.codAttributeReduction!.regular.property.immediatelyAfterLiabilities.toFixed()).toBe('72000');
  expect(result.codAttributeReduction!.alternativeTax.property.immediatelyAfterLiabilities.toFixed()).toBe('72000');
});

it('reports line 1a on the review summary', () => {
  const result = calculateFederalTax(title11()), summary = buildForm982ReferenceSummary(result);
  expect(summary.exclusions).toEqual([{ line: '1a', description: 'Title 11 exclusion', value: '18000' }]);
  expect(summary.title).toContain('Title 11');
  expect(JSON.stringify(summary)).not.toContain('Insolvency exclusion');
  const insolvency = buildForm982ReferenceSummary(calculateFederalTax(actualPartialPersonalCodInput({ debt: '18000', interest: '0', liabilities: '90000', assets: '80000' })));
  expect(insolvency.exclusions[0]!.line).toBe('1b');
  const tampered = { ...result, codNolReduction: { ...result.codNolReduction!, sourceExcludedAmount: result.codNolReduction!.sourceExcludedAmount.minus(1), sourceTaxableAmount: result.codNolReduction!.sourceTaxableAmount.plus(1), reportedExcludedAmount: result.codNolReduction!.reportedExcludedAmount.minus(1) } };
  expect(() => buildForm982ReferenceSummary(tampered)).toThrow(/do not reconcile/);
});
