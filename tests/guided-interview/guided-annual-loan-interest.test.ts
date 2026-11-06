// @vitest-environment jsdom
// Spec: spec/federal/education-annual-loan-interest.yaml guided-sources.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { loadGuidedFlowState, saveGuidedFlowState, updateSectionData } from '@/lib/guided-interview-flow';
import { actualGuidedAnnualLoanInterest } from '../fixtures/guided-annual-loan-interest';
import { requiredPeriodSource as required } from '../fixtures/guided-room-board-periods';

it('preserves actual lender links without entering an annual computed reduction', () => {
  const { state } = actualGuidedAnnualLoanInterest(), id = 'annual-interest-actual-source';
  try {
    saveGuidedFlowState(localStorage, id, state);
    const loaded = required(loadGuidedFlowState(localStorage, id));
    const input = required(buildTaxInputFromGuidedData(loaded));
    expect(input.studentLoanInterestFacts?.loans?.[0]?.qtpTaxFreeEarningsUsedForInterest).toBeUndefined();
    expect(calculateFederalTax(TaxYearInputSchema.parse(input)).agi.toFixed()).toBe('58000');
    expect(loaded.sectionData.adjustments?.studentLoanFacts?.loans?.[0]?.qtpTaxFreeEarningsUsedForInterest).toBe('');
    const incorrect = structuredClone(required(loaded.sectionData.adjustments));
    required(incorrect.studentLoanFacts?.loans?.[0]).qtpTaxFreeEarningsUsedForInterest = '0';
    // The actual loan component revokes its own confirmation on this edit.
    required(incorrect.studentLoanFacts).sourceFactsConfirmed = null;
    let edited = updateSectionData(loaded, 'adjustments', incorrect);
    expect(edited.sectionData.adjustments?.studentLoanFacts?.sourceFactsConfirmed).toBeNull();
    edited = updateSectionData(edited, 'adjustments', { ...required(edited.sectionData.adjustments), studentLoanFacts: {
      ...required(edited.sectionData.adjustments?.studentLoanFacts), sourceFactsConfirmed: true } });
    expect(buildTaxInputFromGuidedData(edited)).toBeNull();
    const changedCredits = structuredClone(required(loaded.sectionData.credits));
    required(changedCredits.educationDistributions?.forms?.[0]).fields.earnings = '3001';
    required(changedCredits.educationDistributions?.forms?.[0]).fields.basis = '11999';
    const changed = updateSectionData(loaded, 'credits', changedCredits);
    expect(changed.sectionData.adjustments?.studentLoanFacts?.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
    saveGuidedFlowState(localStorage, id, changed);
    expect(required(loadGuidedFlowState(localStorage, id)).sectionData.credits?.educationDistributions?.forms?.[0]?.fields.earnings).toBe('3001');
  } finally { localStorage.clear(); }
});

// Spec: education-annual-loan-interest.yaml mixed-guided-currentness.
it('reconfirms actual mixed-purpose originals through saved reload', () => {
  const { state, data } = actualGuidedAnnualLoanInterest(), id = 'mixed-interest-originals';
  data.expenses?.push({ id: 'actual-separate-tuition', beneficiaryId: 'educator', category: 'postsecondary_tuition', amount: '5000',
    paidDate: '2025-09-01', qualificationConfirmed: true, refundedAmount: '0', taxFreeAssistance: '0', educationCreditAmount: '0', otherTaxBenefitAmount: '0' });
  const amount = (value: typeof state) => calculateFederalTax(TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(value)))).agi.toFixed();
  try {
    saveGuidedFlowState(localStorage, id, state);
    let loaded = required(loadGuidedFlowState(localStorage, id));
    expect(amount(loaded)).toBe('56500');
    expect(loaded.sectionData.credits?.educationDistributions?.expenses?.[1]?.amount).toBe('5000');
    expect(loaded.sectionData.adjustments?.studentLoanFacts?.loans?.[0]?.qtpTaxFreeEarningsUsedForInterest).toBe('');
    const credits = structuredClone(required(loaded.sectionData.credits));
    required(credits.educationDistributions?.expenses?.[1]).amount = '6000';
    loaded = updateSectionData(loaded, 'credits', credits);
    expect(loaded.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
    expect(loaded.sectionData.adjustments?.studentLoanFacts?.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(loaded)).toBeNull();
    saveGuidedFlowState(localStorage, id, loaded); loaded = required(loadGuidedFlowState(localStorage, id));
    expect(loaded.sectionData.credits?.educationDistributions?.expenses?.[1]?.amount).toBe('6000');
    loaded = updateSectionData(loaded, 'credits', { ...required(loaded.sectionData.credits), educationDistributions: {
      ...required(loaded.sectionData.credits?.educationDistributions), sourceFactsConfirmed: true } });
    expect(buildTaxInputFromGuidedData(loaded)).toBeNull();
    loaded = updateSectionData(loaded, 'adjustments', { ...required(loaded.sectionData.adjustments), studentLoanFacts: {
      ...required(loaded.sectionData.adjustments?.studentLoanFacts), sourceFactsConfirmed: true } });
    expect(amount(loaded)).toBe('56200');
    saveGuidedFlowState(localStorage, id, loaded); loaded = required(loadGuidedFlowState(localStorage, id));
    expect(amount(loaded)).toBe('56200');
    expect(loaded.sectionData.adjustments?.studentLoanFacts?.loans?.[0]?.qtpTaxFreeEarningsUsedForInterest).toBe('');
    const unknown = structuredClone(required(loaded.sectionData.credits));
    required(unknown.educationDistributions?.expenses?.[1]).qualificationConfirmed = null;
    loaded = updateSectionData(loaded, 'credits', unknown);
    expect(buildTaxInputFromGuidedData(loaded)).toBeNull();
    saveGuidedFlowState(localStorage, id, loaded);
    expect(required(loadGuidedFlowState(localStorage, id)).sectionData.credits?.educationDistributions?.expenses?.[1]?.qualificationConfirmed).toBeNull();
  } finally { localStorage.clear(); }
});

// Spec: education-annual-loan-interest.yaml mixed-guided-currentness.
it('revokes mixed-interest confirmation on equal-cash lexical original changes', () => {
  const { state, data } = actualGuidedAnnualLoanInterest();
  data.expenses?.push({ id: 'actual-separate-tuition', beneficiaryId: 'educator', category: 'postsecondary_tuition', amount: '5000',
    paidDate: '2025-09-01', qualificationConfirmed: true, refundedAmount: '0', taxFreeAssistance: '0', educationCreditAmount: '0', otherTaxBenefitAmount: '0' });
  expect(calculateFederalTax(TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state)))).agi.toFixed()).toBe('56500');
  const credits = structuredClone(required(state.sectionData.credits));
  required(credits.educationDistributions?.expenses?.[1]).amount = '5000.00';
  const edited = updateSectionData(state, 'credits', credits);
  expect(edited.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
  expect(edited.sectionData.adjustments?.studentLoanFacts?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(edited)).toBeNull();
  expect(edited.sectionData.credits?.educationDistributions?.expenses?.[1]?.amount).toBe('5000.00');
});
