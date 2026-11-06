// Spec: spec/federal/nonitemized-charitable-election.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyDeductionData, emptyDonationEntry, validateSection } from '@/lib/guided-interview-flow';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { startCompleteInterview, completeW2Entry, completeMortgageSource } from './complete-facts';

export function actualNonitemizedGuide() {
  const state = startCompleteInterview({ filingStatus: 'mfs', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  const personal = state.sectionData['personal-info'];
  if (!personal?.standardDeductionFacts) throw new Error('Missing synthetic source');
  personal.standardDeductionFacts.spouseItemizes = true;
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '75000', federalWithheld: '15000' }] };
  state.sectionData.deductions = { ...emptyDeductionData, method: 'nonitemized', gamblingWinnings: '0',
    nonW2IncomeTaxesDeductedElsewhere: '0', charitableContributions: '1500',
    donationEntries: [{ ...emptyDonationEntry, organization: 'Actual public charity', type: 'cash', amount: '1500', date: '2026-05-15',
      qualifiedOrganization: true, isPrivateFoundation: false, supportingOrganization: false, donorAdvisedFund: false }] };
  return state;
}
it('preserves the explicit election and rejects contradictory or missing eligibility', () => {
  const state = actualNonitemizedGuide(), before = JSON.stringify(state);
  expect(validateSection(state, 'deductions').status).toBe('complete');
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.deductionElection).toBe('nonitemized');
  expect(input?.standardDeductionFacts?.spouseItemizes).toBe(true);
  expect(input?.donations[0].amount).toBe('1500');
  expect(input?.donations[0].donorAdvisedFund).toBe(false);
  expect(computeGuidedPreview(state)).toBeNull(); // The real2026 gate stays closed.
  expect(JSON.stringify(state)).toBe(before);
  for (const answer of [false, null]) {
    const invalid = actualNonitemizedGuide(), personal = invalid.sectionData['personal-info'];
    if (!personal?.standardDeductionFacts) throw new Error('Missing synthetic source');
    personal.standardDeductionFacts.spouseItemizes = answer;
    expect(validateSection(invalid, 'deductions').status).toBe('partial');
    expect(buildTaxInputFromGuidedData(invalid)).toBeNull();
  }
  const unknown = actualNonitemizedGuide(), donation = unknown.sectionData.deductions?.donationEntries?.[0];
  if (!donation) throw new Error('Missing synthetic source'); donation.supportingOrganization = null;
  expect(validateSection(unknown, 'deductions').status).toBe('partial'); expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
  const past = actualNonitemizedGuide(); past.taxYear = 2025;
  const pastDonation = past.sectionData.deductions?.donationEntries?.[0]; if (pastDonation) pastDonation.date = '2025-05-15';
  expect(validateSection(past, 'deductions').status).toBe('partial'); expect(buildTaxInputFromGuidedData(past)).toBeNull();
});

it('retains actual recovery source requirements for the new election', () => {
  const state = actualNonitemizedGuide();
  const deductions = state.sectionData.deductions;
  if (!deductions) throw new Error('Missing synthetic deductions');
  deductions.mortgageEntries = [{ ...completeMortgageSource, refundOfOverpaidInterest: '' }];
  expect(validateSection(state, 'deductions').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  deductions.mortgageEntries[0].refundOfOverpaidInterest = '100';
  expect(validateSection(state, 'deductions').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  deductions.mortgageEntries[0].refundOfOverpaidInterest = '0';
  expect(validateSection(state, 'deductions').status).toBe('complete');
  expect(buildTaxInputFromGuidedData(state)?.deductionElection).toBe('nonitemized');
});
