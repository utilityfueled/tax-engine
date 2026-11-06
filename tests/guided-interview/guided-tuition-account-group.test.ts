// @vitest-environment jsdom
// Spec: spec/federal/form-1099-q-tuition-account-group.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildEducationDistributionInputs } from '@/lib/guided-education-distributions';
import { loadGuidedFlowState, saveGuidedFlowState, updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedTuitionAccountGroup } from '../fixtures/guided-tuition-account-group';

it('preserves shared tuition and separate ESA histories through saved guided state', () => {
  const { state, data, original } = actualGuidedTuitionAccountGroup(), before = JSON.stringify(state);
  saveGuidedFlowState(localStorage, 'fictional-tuition-account-group', state);
  const loaded = loadGuidedFlowState(localStorage, 'fictional-tuition-account-group')!;
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(loaded));
  expect(input.form1099Q).toEqual(original.form1099Q);
  expect(input.qualifiedEducationExpenses).toEqual(original.qualifiedEducationExpenses);
  expect(calculateFederalTax(input).agi.toFixed()).toBe('51200');
  expect(JSON.stringify(state)).toBe(before);
  const edited = structuredClone(data);
  edited.allocations![0]!.amount = '1500'; edited.allocations![2]!.amount = '2500';
  const changed = updateSectionData(loaded, 'credits', { ...loaded.sectionData.credits!, educationDistributions: edited });
  expect(changed.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const confirmed = updateSectionData(changed, 'credits', { ...changed.sectionData.credits!, educationDistributions: { ...edited, sourceFactsConfirmed: true } });
  saveGuidedFlowState(localStorage, 'fictional-tuition-account-group', confirmed);
  const reloaded = loadGuidedFlowState(localStorage, 'fictional-tuition-account-group')!;
  expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reloaded))).agi.toFixed()).toBe('51267');
  edited.coverdellAccounts![1]!.priorYearBasis = '';
  expect(() => buildEducationDistributionInputs(edited, 2025, 'single', original.educationExpenses)).toThrow(/actual|basis/);
  localStorage.clear();
});
