// @vitest-environment jsdom
// Spec: spec/federal/form-1099-q-multiple-expense-esa.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildEducationDistributionInputs } from '@/lib/guided-education-distributions';
import { loadGuidedFlowState, saveGuidedFlowState, updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedMultipleEsa } from '../fixtures/guided-multiple-esa';

it('preserves the actual multiple-expense election through saved guided state', () => {
  const { state, data, original } = actualGuidedMultipleEsa(), before = JSON.stringify(state);
  saveGuidedFlowState(localStorage, 'fictional-multiple-esa', state);
  const loaded = loadGuidedFlowState(localStorage, 'fictional-multiple-esa')!;
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(loaded));
  expect(input.form1099Q).toEqual(original.form1099Q);
  expect(input.qualifiedEducationExpenses).toEqual(original.qualifiedEducationExpenses);
  expect(calculateFederalTax(input).agi.toFixed()).toBe('50950');
  expect(JSON.stringify(state)).toBe(before);
  const edited = structuredClone(data);
  edited.allocations![0]!.amount = '1500'; edited.allocations![1]!.amount = '2000';
  const changed = updateSectionData(loaded, 'credits', { ...loaded.sectionData.credits!, educationDistributions: edited });
  expect(changed.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const confirmed = updateSectionData(changed, 'credits', { ...changed.sectionData.credits!, educationDistributions: { ...edited, sourceFactsConfirmed: true } });
  saveGuidedFlowState(localStorage, 'fictional-multiple-esa', confirmed);
  const reloaded = loadGuidedFlowState(localStorage, 'fictional-multiple-esa')!;
  expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reloaded))).agi.toFixed()).toBe('51000');
  edited.expenses![1]!.taxFreeAssistance = '';
  expect(() => buildEducationDistributionInputs(edited, 2025, 'single', original.educationExpenses)).toThrow(/actual|assistance/);
  localStorage.clear();
});
