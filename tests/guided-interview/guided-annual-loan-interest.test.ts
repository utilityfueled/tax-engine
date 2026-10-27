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
