// Spec: spec/federal/current-public-other-cash.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyDeductionData, emptyDonationEntry, validateSection } from '@/lib/guided-interview-flow';
import { calculateScheduleA } from '@/engine/schedules/schedule-a.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { actualGuidedCharitableCarryover } from '../fixtures/guided-charitable-carryover';
import { completeW2Entry, startCompleteInterview } from './complete-facts';

it('preserves actual cash recipient categories without changing the closed year gates', async () => {
  const state = startCompleteInterview({ filingStatus: 'mfs', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  const personal = state.sectionData['personal-info'];
  if (!personal?.standardDeductionFacts) throw new Error('Missing actual synthetic personal facts');
  personal.standardDeductionFacts.spouseItemizes = true;
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '10000', federalWithheld: '1000' }] };
  const history = actualGuidedCharitableCarryover(); history.sourceTaxYear = '2026'; history.vintages = [];
  state.sectionData.deductions = { ...emptyDeductionData, method: 'nonitemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0',
    mortgageInterest: '0', casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0',
    nonW2IncomeTaxesDeductedElsewhere: '0', charitableContributions: '7000', charitableCarryoverSources: history,
    donationEntries: (['fifty-percent', 'private-nonoperating'] as const).map((recipientCategory, index) => ({
      ...emptyDonationEntry, organization: `Actual recipient ${index + 1}`, type: 'cash', amount: index === 0 ? '4000' : '3000',
      date: '2026-05-15', qualifiedOrganization: true, recipientCategory, supportingOrganization: false, donorAdvisedFund: false,
    })) };
  const before = JSON.stringify(state);
  expect(validateSection(state, 'deductions').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.donations.map(row => row.recipientCategory)).toEqual(['fifty-percent', 'private-nonoperating']);
  const result = calculateScheduleA(input, d('10000'), 'married_filing_separately', FEDERAL_2026_CONSTANTS);
  expect(result.currentCharitableCandidates?.nonitemizedCarryforwards.map(row => [row.category, row.medium, row.amount.toFixed()]))
    .toEqual([['other_30', 'cash', '1000']]);
  expect(result.nonitemizerCharitableDeduction.toFixed()).toBe('1000');
  expect(computeGuidedPreview(state)).toBeNull();
  expect(() => calculateFederalTax(input)).toThrow(/not.*ready|incomplete|unavailable|not.*available/i);
  const historical = calculateFederalTax(simpleW2Fixture);
  await expect(fillReturn(input, { ...historical, taxYear: 2026, deductionUsed: 'nonitemized' }, { outputDir: 'tmp/unsupported-current-other-cash' }))
    .rejects.toThrow(/2026.*unavailable|no.*2026|2026.*not/i);
  expect(JSON.stringify(state)).toBe(before);
  const sources = state.sectionData.deductions.donationEntries;
  if (!sources) throw new Error('Missing actual synthetic receipts');
  sources[1].recipientCategory = null;
  expect(validateSection(state, 'deductions').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
