// @vitest-environment jsdom
// Spec: spec/federal/form-1099-q-cash-assistance.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { loadGuidedFlowState, saveGuidedFlowState, updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedCashAssistance } from '../fixtures/guided-cash-assistance';

function required<T>(value: T | null | undefined): T { if (value == null) throw new Error('Missing actual fictional source'); return value; }
it('retains actual cash assistance records and independent confirmations', () => {
  const { state, data, original } = actualGuidedCashAssistance(), before = structuredClone(state), id = 'fictional-cash-assistance';
  try {
    saveGuidedFlowState(localStorage, id, state);
    const loaded = required(loadGuidedFlowState(localStorage, id)), input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(loaded));
    expect(input.form1099Q).toEqual(original.form1099Q);
    expect(input.qualifiedEducationExpenses).toEqual(original.qualifiedEducationExpenses);
    expect(calculateFederalTax(input).agi.toFixed()).toBe('50975'); expect(state).toEqual(before);
    const edited = structuredClone(data);
    required(edited.expenses?.[0]).taxFreeAssistance = '2000';
    required(edited.allocations?.find(row => row.sourceId === 'cash-qtp')).amount = '3500';
    const changed = updateSectionData(loaded, 'credits', { ...required(loaded.sectionData.credits), educationDistributions: edited });
    expect(changed.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
    const confirmed = updateSectionData(changed, 'credits', { ...required(changed.sectionData.credits), educationDistributions: { ...edited, sourceFactsConfirmed: true } });
    saveGuidedFlowState(localStorage, id, confirmed);
    expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(required(loadGuidedFlowState(localStorage, id))))).agi.toFixed()).toBe('51225');
    const missing = structuredClone(edited); required(missing.expenses?.[0]).taxFreeAssistance = '';
    const unknown = updateSectionData(confirmed, 'credits', { ...required(confirmed.sectionData.credits), educationDistributions: missing });
    expect(buildTaxInputFromGuidedData(unknown)).toBeNull(); saveGuidedFlowState(localStorage, id, unknown);
    expect(loadGuidedFlowState(localStorage, id)?.sectionData.credits?.educationDistributions?.expenses?.[0]?.taxFreeAssistance).toBe('');
    const zero = structuredClone(missing); required(zero.expenses?.[0]).taxFreeAssistance = '0';
    required(zero.allocations?.find(row => row.sourceId === 'cash-qtp')).amount = '5500';
    const zeroDraft = updateSectionData(unknown, 'credits', { ...required(unknown.sectionData.credits), educationDistributions: zero });
    expect(buildTaxInputFromGuidedData(zeroDraft)).toBeNull();
    const zeroConfirmed = updateSectionData(zeroDraft, 'credits', { ...required(zeroDraft.sectionData.credits), educationDistributions: { ...zero, sourceFactsConfirmed: true } });
    expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(zeroConfirmed))).agi.toFixed()).toBe('50725');
  } finally { localStorage.clear(); }
});
