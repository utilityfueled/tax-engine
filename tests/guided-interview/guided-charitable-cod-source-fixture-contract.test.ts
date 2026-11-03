// Spec: spec/federal/guided-charitable-cod-source-fixture-contract.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { guidedCurrentCharitableOriginals } from '../fixtures/guided-form-172-charitable-origin-sources';
import { guidedCharitableCodModifiedState } from '../fixtures/guided-charitable-cod-modified';
import { guidedCodEmptyNolForeignState } from '../fixtures/guided-cod-empty-nol-foreign';

it('charitable COD fixture records the actual original year without changing amounts', () => {
  const source = guidedCurrentCharitableOriginals(), state = guidedCharitableCodModifiedState();
  expect(source.interest).toHaveProperty('sourceTaxYear', '2025');
  expect(source.interest.interestIncome).toBe('30000');
  expect(state.sectionData['income-investments']?.interestEntries[0]).toHaveProperty('sourceTaxYear', '2025');
  const before = structuredClone(state);
  expect(buildTaxInputFromGuidedData(state)).not.toBeNull();
  expect(state).toEqual(before);
});
it('independent foreign COD fixture retains explicit original2025 and identities', () => {
  for (const method of ['ordinary', 'deduction'] as const) {
    const state = guidedCodEmptyNolForeignState(method), before = structuredClone(state);
    expect(state.taxYear).toBe(2025);
    expect(state.sectionData['income-investments']?.interestEntries[0]).toMatchObject({ sourceTaxYear: '2025', interestIncome: '5000', payerTin: '112233445', accountReference: 'Private synthetic account A' });
    expect(buildTaxInputFromGuidedData(state)).not.toBeNull();
    expect(state).toEqual(before);
  }
});
it.each(['missing', 'wrong'])('charitable COD original year remains mandatory: %s', kind => {
  const state = guidedCharitableCodModifiedState(), row = state.sectionData['income-investments']?.interestEntries[0];
  if (!row) throw new Error('Actual fictional investment original missing');
  if (kind === 'missing') Reflect.deleteProperty(row, 'sourceTaxYear'); else row.sourceTaxYear = '2024';
  const before = structuredClone(state);
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  expect(state).toEqual(before);
});
