// @vitest-environment jsdom
// Spec: spec/federal/education-ordinary-expense-composition.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { loadGuidedFlowState, saveGuidedFlowState, updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedOrdinaryEducationExpenses } from '../fixtures/guided-ordinary-education-expenses';

function required<T>(value: T | null | undefined): T { if (value == null) throw new Error('Missing fictional original source'); return value; }
it('preserves ordinary expense originals and invalidates changed refund sources', () => {
  const { state, original } = actualGuidedOrdinaryEducationExpenses(), before = structuredClone(state), id = 'fictional-ordinary-education';
  try {
    saveGuidedFlowState(localStorage, id, state);
    const loaded = required(loadGuidedFlowState(localStorage, id));
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(loaded));
    expect(input.form1099Q).toEqual(original.form1099Q); expect(input.qualifiedEducationExpenses).toEqual(original.qualifiedEducationExpenses);
    expect(calculateFederalTax(input).agi.toFixed()).toBe('50300'); expect(state).toEqual(before);
    const edited = structuredClone(required(loaded.sectionData.credits?.educationDistributions));
    required(edited.expenseRefunds?.[0]).receivedDate = '2025-10-01';
    const changed = updateSectionData(loaded, 'credits', { ...required(loaded.sectionData.credits), educationDistributions: edited });
    const pending = required(changed.sectionData.credits?.educationDistributions);
    expect(pending.sourceFactsConfirmed).toBeNull(); expect(pending.expenseRefunds?.[0]?.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
    const rootOnly = updateSectionData(changed, 'credits', { ...required(changed.sectionData.credits), educationDistributions: { ...pending, sourceFactsConfirmed: true } });
    expect(buildTaxInputFromGuidedData(rootOnly)).toBeNull();
    const confirmed = updateSectionData(rootOnly, 'credits', { ...required(rootOnly.sectionData.credits), educationDistributions: { ...pending, sourceFactsConfirmed: true,
      expenseRefunds: pending.expenseRefunds?.map(row => ({ ...row, sourceFactsConfirmed: true })) } });
    saveGuidedFlowState(localStorage, id, confirmed);
    expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(required(loadGuidedFlowState(localStorage, id))))).agi.toFixed()).toBe('50300');
    for (const amount of ['', '0']) {
      const next = structuredClone(required(confirmed.sectionData.credits?.educationDistributions));
      required(next.expenseRefunds?.[0]).amount = amount;
      const changedAmount = updateSectionData(confirmed, 'credits', { ...required(confirmed.sectionData.credits), educationDistributions: next });
      expect(buildTaxInputFromGuidedData(changedAmount)).toBeNull();
      saveGuidedFlowState(localStorage, id, changedAmount);
      expect(loadGuidedFlowState(localStorage, id)?.sectionData.credits?.educationDistributions?.expenseRefunds?.[0]?.amount).toBe(amount);
    }
    const zero = structuredClone(required(confirmed.sectionData.credits?.educationDistributions));
    zero.expenseRefunds = []; required(zero.expenses?.[0]).refundedAmount = '0'; required(zero.allocations?.[0]).amount = '3000';
    const zeroDraft = updateSectionData(confirmed, 'credits', { ...required(confirmed.sectionData.credits), educationDistributions: zero });
    const zeroConfirmed = updateSectionData(zeroDraft, 'credits', { ...required(zeroDraft.sectionData.credits), educationDistributions: { ...zero, sourceFactsConfirmed: true } });
    expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(zeroConfirmed))).agi.toFixed()).toBe('50200');
  } finally { localStorage.clear(); }
});
