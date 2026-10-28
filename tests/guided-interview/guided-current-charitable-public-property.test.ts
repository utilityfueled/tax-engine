// Spec: spec/federal/current-charitable-public-property.yaml.
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

it('preserves actual property sources and both carries while retaining the closed year gates', async () => {
  const state = startCompleteInterview({ filingStatus: 'mfs', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  const personal = state.sectionData['personal-info'];
  if (!personal?.standardDeductionFacts) throw new Error('Missing synthetic personal source');
  personal.standardDeductionFacts.spouseItemizes = true;
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '10000.49', federalWithheld: '1000' }] };
  const history = actualGuidedCharitableCarryover(); history.sourceTaxYear = '2026'; history.vintages = [];
  const property = { ...emptyDonationEntry, organization: 'Actual public property charity', type: 'property' as const, amount: '5000.49',
    costBasis: '3000.24', isLongTermCapitalGain: false, date: '2026-05-15', qualifiedOrganization: true,
    isPrivateFoundation: false, supportingOrganization: false, donorAdvisedFund: false };
  state.sectionData.deductions = { ...emptyDeductionData, method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0',
    mortgageInterest: '0', casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0',
    nonW2IncomeTaxesDeductedElsewhere: '0', charitableContributions: '9000.60', charitableCarryoverSources: history,
    donationEntries: [{ ...emptyDonationEntry, organization: 'Actual public cash charity', type: 'cash', amount: '4000.11', date: '2026-05-15',
      qualifiedOrganization: true, isPrivateFoundation: false, supportingOrganization: false, donorAdvisedFund: false }, property] };
  const before = JSON.stringify(state);
  expect(validateSection(state, 'deductions').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.charitableCarryoverSources?.vintages).toEqual([]);
  expect(input.donations[1]).toMatchObject({ amount: '5000.49', costBasis: '3000.24', isLongTermCapitalGain: false });
  const schedule = calculateScheduleA(input, d('10000.49'), 'married_filing_separately', FEDERAL_2026_CONSTANTS);
  expect(schedule.charitableTotal.toFixed()).toBe('4950');
  expect(schedule.charitableCarryforward.toFixed()).toBe('2050.10745');
  expect(schedule.currentCharitableCandidates?.nonitemizedCarryforwards.map(row => row.amount.toFixed())).toEqual(['2050.10745']);
  expect(schedule.currentCharitableCandidates?.currentPropertyValue.toFixed()).toBe('3000.24');
  expect(computeGuidedPreview(state)).toBeNull();
  expect(() => calculateFederalTax(input)).toThrow(/not.*ready|incomplete|unavailable|not.*available/i);
  const historical = calculateFederalTax(simpleW2Fixture);
  await expect(fillReturn(input, { ...historical, taxYear: 2026, deductionUsed: 'itemized' }, { outputDir: 'tmp/unsupported-current-public-property' }))
    .rejects.toThrow(/2026.*unavailable|no.*2026|2026.*not/i);
  expect(JSON.stringify(state)).toBe(before);
  property.costBasis = '';
  expect(validateSection(state, 'deductions').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  property.costBasis = '3000.24'; history.sourceFactsConfirmed = null;
  expect(validateSection(state, 'deductions').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
