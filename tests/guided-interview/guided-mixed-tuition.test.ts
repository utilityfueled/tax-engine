// @vitest-environment jsdom
// Spec: spec/federal/form-1099-q-mixed-tuition.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { loadGuidedFlowState, saveGuidedFlowState, updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedMixedTuition } from '../fixtures/guided-mixed-tuition';

function required<T>(value: T | null | undefined): T { if (value == null) throw new Error('Missing actual fictional source'); return value; }
it('preserves mixed tuition originals and independent confirmation through reload', () => {
  const { state, data, original } = actualGuidedMixedTuition(), before = structuredClone(state), id = 'fictional-mixed-tuition';
  try {
    saveGuidedFlowState(localStorage, id, state);
    const loaded = required(loadGuidedFlowState(localStorage, id)), input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(loaded));
    expect(input.form1099Q).toEqual(original.form1099Q);
    expect(input.qualifiedEducationExpenses).toEqual(original.qualifiedEducationExpenses);
    expect(calculateFederalTax(input).agi.toFixed()).toBe('51500');
    expect(state).toEqual(before);
    const edited = structuredClone(data);
    required(edited.allocations?.find(row => row.sourceId === 'cash-qtp')).amount = '1500';
    required(edited.allocations?.find(row => row.sourceId === 'esa')).amount = '3500';
    const changed = updateSectionData(loaded, 'credits', { ...required(loaded.sectionData.credits), educationDistributions: edited });
    expect(changed.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
    const confirmed = updateSectionData(changed, 'credits', { ...required(changed.sectionData.credits), educationDistributions: { ...edited, sourceFactsConfirmed: true } });
    saveGuidedFlowState(localStorage, id, confirmed);
    const reloaded = required(loadGuidedFlowState(localStorage, id));
    expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reloaded))).agi.toFixed()).toBe('51350');
    const missing = structuredClone(required(reloaded.sectionData.credits?.educationDistributions));
    required(missing.coverdellAccounts?.[0]).priorYearBasis = '';
    const unknown = updateSectionData(reloaded, 'credits', { ...required(reloaded.sectionData.credits), educationDistributions: missing });
    expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
    saveGuidedFlowState(localStorage, id, unknown);
    expect(loadGuidedFlowState(localStorage, id)?.sectionData.credits?.educationDistributions?.coverdellAccounts?.[0]?.priorYearBasis).toBe('');
  } finally { localStorage.clear(); }
});
