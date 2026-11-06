// Spec: spec/federal/charitable-single-category-nol.yaml guided-sources.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { emptyAdjustmentData, emptyDeductionData, emptyDonationEntry, validateSection, updateSectionData } from '@/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { actualGuidedNolSources } from '../../fixtures/guided-net-operating-loss';
import { completeW2Entry, startCompleteInterview } from '../../guided-interview/complete-facts';

it('requires independent histories before actual property sources reach the NOL calculation', () => {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['net-operating-loss'], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000', federalWithheld: '20000' }] };
  const sources = structuredClone(actualGuidedNolSources);
  if (!sources.alternativeTax || !sources.vintages?.[0]) throw new Error('Missing synthetic loss facts');
  Object.assign(sources.vintages[0], { originalLoss: '100000', openingCarryforward: '100000', section1411OriginalLoss: '0', history: [] });
  sources.alternativeTax.vintages = [];
  state.sectionData.adjustments = { ...emptyAdjustmentData, netOperatingLossSources: sources };
  state.sectionData.deductions = { ...emptyDeductionData, method: 'itemized', charitableContributions: '60000',
    donationEntries: [{ ...emptyDonationEntry, organization: 'Synthetic investment stock recipient', type: 'appreciated_stock', amount: '60000',
      costBasis: '20000', date: '2025-05-01', isLongTermCapitalGain: true, recipientCategory: 'fifty-percent',
      qualifiedOrganization: true, supportingOrganization: false, donorAdvisedFund: false }] };
  expect(validateSection(state, 'adjustments').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  sources.alternativeTax.charitableCarryoverHistory = { sourceTaxYear: '2024', sourceReference: 'Synthetic actual independent no-carry records',
    sourceFactsConfirmed: true, allCarryoversIncluded: true, priorRegularCarryovers: [], priorAlternativeCarryovers: [] };
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  const input = buildTaxInputFromGuidedData(state);
  if (!input) throw new Error('Actual complete single-category sources must reach canonical input');
  expect(input.donations[0]).toMatchObject({ amount: '60000', costBasis: '20000', isLongTermCapitalGain: true, recipientCategory: 'fifty-percent' });
  const original = JSON.stringify(input); const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect([result.nolDeduction, result.carryforwards.charitableContributions].map(value => value.toFixed())).toEqual(['56000', '33360']);
  expect(JSON.stringify(input)).toBe(original);
  const deductions = state.sectionData.deductions;
  const changed = updateSectionData(state, 'deductions', { ...deductions, charitableContributions: '60001',
    donationEntries: deductions.donationEntries?.map(row => ({ ...row, amount: '60001' })) });
  expect(changed.sectionData.adjustments?.netOperatingLossSources?.alternativeTax?.charitableCarryoverHistory?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
});
