// @vitest-environment jsdom
// Spec: spec/federal/form-1099-q-distinct-qtp-esa.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildEducationDistributionInputs } from '@/lib/guided-education-distributions';
import { loadGuidedFlowState, saveGuidedFlowState, updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedDistinctQtpEsa } from '../fixtures/guided-distinct-qtp-esa';

it('preserves distinct prepaid and ESA sources through saved guided state', () => {
  const { state, data, original } = actualGuidedDistinctQtpEsa(), before = JSON.stringify(state);
  saveGuidedFlowState(localStorage, 'fictional-distinct-qtp-esa', state);
  const loaded = loadGuidedFlowState(localStorage, 'fictional-distinct-qtp-esa')!;
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(loaded));
  expect(input.form1099Q).toEqual(original.form1099Q);
  expect(input.qualifiedEducationExpenses).toEqual(original.qualifiedEducationExpenses);
  expect(calculateFederalTax(input).agi.toFixed()).toBe('51150');
  expect(JSON.stringify(state)).toBe(before);
  const edited = structuredClone(data);
  edited.allocations![0]!.amount = '1500'; edited.allocations![1]!.amount = '2000';
  const changed = updateSectionData(loaded, 'credits', { ...loaded.sectionData.credits!, educationDistributions: edited });
  expect(changed.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const confirmed = updateSectionData(changed, 'credits', { ...changed.sectionData.credits!, educationDistributions: { ...edited, sourceFactsConfirmed: true } });
  saveGuidedFlowState(localStorage, 'fictional-distinct-qtp-esa', confirmed);
  const reloaded = loadGuidedFlowState(localStorage, 'fictional-distinct-qtp-esa')!;
  expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reloaded))).agi.toFixed()).toBe('51200');
  edited.expenses![1]!.taxFreeAssistance = '';
  expect(() => buildEducationDistributionInputs(edited, 2025, 'single', original.educationExpenses)).toThrow(/actual|assistance/);
  localStorage.clear();
});
