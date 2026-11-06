// Spec: alternative-charitable-net-operating-loss.yaml intake.
import { expect, it } from 'vitest';
import { buildGuidedNetOperatingLoss, updateNetOperatingLossSources } from '@/lib/guided-net-operating-loss';
import { emptyAdjustmentData, emptyDeductionData, validateSection, updateSectionData } from '@/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { actualGuidedNolSources } from '../../fixtures/guided-net-operating-loss';
import { completePersonalInfo, startCompleteInterview, completeW2Entry } from '../../guided-interview/complete-facts';

it('preserves separate charity histories and invalidates changed source confirmations', () => {
  const data = structuredClone(actualGuidedNolSources);
  if (!data.alternativeTax) throw new Error('Missing synthetic alternative sources');
  Object.assign(data.alternativeTax, { charitableCarryoverHistory: { sourceTaxYear: '2024', sourceReference: 'Actual independent charitable histories',
    sourceFactsConfirmed: true, allCarryoversIncluded: true, priorRegularCarryovers: [], priorAlternativeCarryovers: [] } });
  const deductions = { ...emptyDeductionData, charitableContributions: '60000' };
  const result = buildGuidedNetOperatingLoss(data, 2025, 'single', completePersonalInfo, deductions);
  expect(result?.alternativeTax?.charitableCarryoverHistory).toEqual({ sourceTaxYear: 2024, sourceReference: 'Actual independent charitable histories',
    sourceFactsConfirmed: true, allCarryoversIncluded: true, priorRegularCarryovers: [], priorAlternativeCarryovers: [] });
  const original = JSON.stringify(data);
  for (const patch of [{ sourceTaxYear: '2023' }, { sourceReference: '' }, { sourceFactsConfirmed: null }, { allCarryoversIncluded: false },
    { priorRegularCarryovers: undefined }, { priorAlternativeCarryovers: undefined },
    { priorAlternativeCarryovers: [{ taxYear: '2024', category: 'cash_60' as const, amount: '100', sourceReference: 'Actual carry' }] }]) {
    expect(() => buildGuidedNetOperatingLoss({ ...data, alternativeTax: { ...data.alternativeTax,
      charitableCarryoverHistory: { ...data.alternativeTax?.charitableCarryoverHistory, ...patch } } }, 2025, 'single', completePersonalInfo, deductions)).toThrow(/charit|histor/i);
  }
  expect(JSON.stringify(data)).toBe(original);
  const changed = updateNetOperatingLossSources(data, { sourceReference: 'Replacement source packet' });
  expect(changed.alternativeTax?.charitableCarryoverHistory?.sourceFactsConfirmed).toBeNull();
  expect(changed.alternativeTax?.sourceFactsConfirmed).toBeNull(); expect(changed.sourceFactsConfirmed).toBeNull();
  const rechecked = updateNetOperatingLossSources(changed, { alternativeTax: { ...changed.alternativeTax,
    charitableCarryoverHistory: { ...changed.alternativeTax?.charitableCarryoverHistory, sourceFactsConfirmed: true } } });
  const confirmed = updateNetOperatingLossSources(rechecked, { sourceFactsConfirmed: true,
    alternativeTax: { ...rechecked.alternativeTax, sourceFactsConfirmed: true } });
  expect(confirmed.alternativeTax?.charitableCarryoverHistory?.sourceFactsConfirmed).toBe(true);
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['net-operating-loss'], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000' }] };
  state.sectionData.adjustments = { ...emptyAdjustmentData, netOperatingLossSources: structuredClone(actualGuidedNolSources) };
  state.sectionData.deductions = deductions;
  expect(validateSection(state, 'adjustments').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.adjustments.netOperatingLossSources = confirmed;
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  const donationChanged = updateSectionData(state, 'deductions', { ...deductions, charitableContributions: '60001' });
  expect(donationChanged.sectionData.adjustments?.netOperatingLossSources?.alternativeTax?.charitableCarryoverHistory?.sourceFactsConfirmed).toBeNull();
});
