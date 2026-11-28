// Spec: spec/federal/nonitemized-charitable-election.yaml.
import { afterEach, assert, expect, it, vi } from 'vitest';
import { buildDonationsInput, buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyDeductionData, emptyDonationEntry, loadGuidedFlowState, saveGuidedFlowState, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { computeGuidedPreview, computeGuidedPreviewEvaluation } from '@/lib/guided-preview-compute';
import { startCompleteInterview, completeW2Entry, completeMortgageSource } from './complete-facts';

afterEach(() => vi.useRealTimers());

export function actualNonitemizedGuide() {
  const state = startCompleteInterview({ filingStatus: 'mfs', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  const personal = state.sectionData['personal-info'];
  if (!personal?.standardDeductionFacts) throw new Error('Missing synthetic source');
  personal.standardDeductionFacts.spouseItemizes = true;
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '75000', federalWithheld: '15000' }] };
  state.sectionData.deductions = { ...emptyDeductionData, method: 'nonitemized', gamblingWinnings: '0',
    nonW2IncomeTaxesDeductedElsewhere: '0', charitableContributions: '1500',
    donationEntries: [{ ...emptyDonationEntry, organization: 'Actual public charity', type: 'cash', cashAmountBasis: 'net-contribution', amount: '1500', date: '2026-05-15',
      qualifiedOrganization: true, isPrivateFoundation: false, recipientCategory: 'fifty-percent' as const, supportingOrganization: false, donorAdvisedFund: false }] };
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

it('holds future-dated 2026 gifts on reopened actual preview and admits gifts paid today', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 26, 12));
  const state = actualNonitemizedGuide();
  const deductions = state.sectionData.deductions;
  const gift = deductions?.donationEntries?.[0];
  assert.ok(deductions && gift);
  const future = { ...gift, date: '2026-12-31' };
  const edited = updateSectionData(state, 'deductions', { ...deductions, donationEntries: [future] });
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  } as Storage;
  expect(saveGuidedFlowState(storage, 'future-gift', edited)).toBe(true);
  const reopened = loadGuidedFlowState(storage, 'future-gift');
  assert.ok(reopened?.sectionData.deductions);
  expect(reopened.sectionData.deductions.donationEntries).toEqual([future]);
  expect(computeGuidedPreviewEvaluation(reopened).input).toBeNull();
  expect(buildTaxInputFromGuidedData(reopened)).toBeNull();
  expect(validateSection(reopened, 'deductions')).toMatchObject({ status: 'partial', fieldErrors: {
    'donation-0-date': expect.stringMatching(/already paid|future/i),
  } });

  const today = updateSectionData(reopened, 'deductions', {
    ...reopened.sectionData.deductions, donationEntries: [{ ...gift, date: '2026-11-26' }],
  });
  expect(validateSection(today, 'deductions').status).toBe('complete');
  expect(computeGuidedPreviewEvaluation(today).input?.donations).toMatchObject([{ dateOfDonation: '2026-11-26', amount: '1500' }]);
});

it('preserves same-day gifts and the historical and date-only adapters', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 26, 12));
  const state = actualNonitemizedGuide();
  const deductions = state.sectionData.deductions;
  const gift = deductions?.donationEntries?.[0];
  assert.ok(deductions && gift);
  const sameDay = updateSectionData(state, 'deductions', { ...deductions, donationEntries: [
    { ...gift, date: '2026-11-26', amount: '750.25' },
    { ...gift, date: '2026-11-26', amount: '749.75', organization: 'Another actual public charity' },
  ] });
  expect(validateSection(sameDay, 'deductions').status).toBe('complete');
  expect(buildTaxInputFromGuidedData(sameDay)?.donations.map(row => row.amount)).toEqual(['750.25', '749.75']);
  expect(buildDonationsInput({ ...deductions, donationEntries: [{ ...gift, date: '2026-12-31' }] }, 2026)[0]?.dateOfDonation).toBe('2026-12-31');

  vi.setSystemTime(new Date(2025, 10, 26, 12));
  const historical = startCompleteInterview({ filingStatus: 'single', incomeTypes: [], lifeEvents: [], stateCode: null });
  historical.sectionData.deductions = {
    ...emptyDeductionData, method: 'itemized', donationEntries: [{ ...gift, date: '2025-12-31' }],
  };
  expect(validateSection(historical, 'deductions').status).toBe('complete');
  expect(buildTaxInputFromGuidedData(historical)?.donations[0]?.dateOfDonation).toBe('2025-12-31');
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
