// Spec: spec/federal/prior-cash-current-property.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyDeductionData, emptyDonationEntry, validateSection } from '@/lib/guided-interview-flow';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateScheduleA } from '@/engine/schedules/schedule-a.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { actualGuidedCharitableCarryover } from '../fixtures/guided-charitable-carryover';
import { completeW2Entry, startCompleteInterview } from './complete-facts';

it('preserves actual prior cash and current property without opening the year gates', async () => {
  const state = startCompleteInterview({ filingStatus: 'mfs', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '10000', federalWithheld: '1000' }] };
  const history = actualGuidedCharitableCarryover(); history.sourceTaxYear = '2026';
  history.vintages = [{ sourceId: 'Actual prior cash', contributionYear: '2025', category: 'cash_60', medium: 'cash',
    sourceReference: 'Actual filed 2025 worksheet', originalExcess: '2000', originNolReduction: '0', openingCarryforward: '2000',
    adjustedThroughTaxYear: '2025', allHistoryIncluded: true, ordinaryPercentageMethodConfirmed: true, history: [] }];
  const property = { ...emptyDonationEntry, organization: 'Actual public property charity', type: 'property' as const, amount: '5000',
    costBasis: '3000', isLongTermCapitalGain: false, date: '2026-05-15', qualifiedOrganization: true,
    isPrivateFoundation: false, supportingOrganization: false, donorAdvisedFund: false };
  state.sectionData.deductions = { ...emptyDeductionData, method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0',
    mortgageInterest: '0', casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0',
    nonW2IncomeTaxesDeductedElsewhere: '0', charitableContributions: '6000', charitableCarryoverSources: history,
    donationEntries: [{ ...emptyDonationEntry, organization: 'Actual public cash charity', type: 'cash', amount: '1000', date: '2026-05-15',
      qualifiedOrganization: true, isPrivateFoundation: false, supportingOrganization: false, donorAdvisedFund: false }, property] };
  const before = JSON.stringify(state);
  expect(validateSection(state, 'deductions').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.charitableCarryoverSources?.vintages?.[0]).toMatchObject({ contributionYear: 2025, openingCarryforward: '2000', history: [] });
  expect(input.donations[1]).toMatchObject({ amount: '5000', costBasis: '3000' });
  const schedule = calculateScheduleA(input, d('10000'), 'married_filing_separately', FEDERAL_2026_CONSTANTS);
  expect([schedule.charitableCurrentCash, schedule.charitableCurrentNoncash, schedule.charitablePriorYearUsed, schedule.charitableTotal].map(value => value.toFixed()))
    .toEqual(['1000', '1950', '2000', '4950']);
  expect(schedule.charitableCarryforward.toFixed()).toBe('1050');
  expect(schedule.determinedCharitableFloor?.nonitemizedCarryforwards.map(row => row.amount.toFixed())).toEqual(['1050']);
  expect(computeGuidedPreview(state)).toBeNull();
  expect(() => calculateFederalTax(input)).toThrow(/not.*ready|incomplete|unavailable|not.*available/i);
  const historical = calculateFederalTax(simpleW2Fixture);
  await expect(fillReturn(input, { ...historical, taxYear: 2026, deductionUsed: 'itemized' }, { outputDir: 'tmp/unsupported-prior-cash-current-property' }))
    .rejects.toThrow(/2026.*unavailable|no.*2026|2026.*not/i);
  expect(JSON.stringify(state)).toBe(before);
  property.costBasis = '';
  expect(validateSection(state, 'deductions').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  property.costBasis = '3000'; history.sourceFactsConfirmed = null;
  expect(validateSection(state, 'deductions').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
