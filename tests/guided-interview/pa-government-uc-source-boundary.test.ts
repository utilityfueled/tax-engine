// Spec: spec/state/pa-government-uc-source-boundary.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { calculatePAReturn } from '@/engine/state/pa-orchestrator';
import { calculatePAResidencySources } from '@/engine/state/pa-residency-sources';
import { TaxYearInputSchema, Form1099GSchema } from '@/models/inputs';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { buildGuidedPennsylvaniaOverrides } from '@/lib/guided-state-engine-inputs';
import { emptyDeductionData, emptyStateReturnData } from '@/lib/guided-interview-flow';
import { unemploymentSource } from '../fixtures/guided-government-uc-original';
import { assertPAGuidedPaymentBoundary } from '../fixtures/assert-pa-guided-payment-boundary';
import { paOrdinaryResidencyFixture } from '../fixtures/pa-residency-sources';
import { completeRetirementSource, startCompleteInterview } from './complete-facts';
function ucFlow(stateCode = 'PA') {
  const state = startCompleteInterview({ filingStatus: 'mfj', incomeTypes: ['unemployment'], lifeEvents: [], stateCode: 'PA' });
  const info = state.sectionData['personal-info']; if (!info) throw new Error('Fixture requires actual personal information'); info.state = 'PA';
  state.sectionData.deductions = { ...emptyDeductionData, nonW2IncomeTaxesDeductedElsewhere: '0' };
  state.sectionData['income-unemployment'] = { compensation: '', federalWithheld: '', entries: [{ ...unemploymentSource, stateTaxReporting: 'single', state: stateCode, statePayerId: 'actual-pa-id', stateWithheld: '12.34' }] };
  return state;
}
it('preserves the actual government statement and federal income while PA output is unavailable', () => {
  const state = ucFlow(), before = JSON.stringify(state);
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.taxpayer.filingStatus).toBe('married_filing_jointly');
  expect(input.form1099G[0]).toMatchObject({ accountHolder: 'primary', unemploymentCompensation: '1000.10', federalWithheld: '0', state: 'PA', stateWithheld: '12.34', taxYear: 2025, sourceFormRevision: '2024-03' });
  const federal = calculateFederalTax(input); expect(federal.totalIncome.toFixed()).toBe('1000.1'); expect(federal.totalWithholding.toFixed()).toBe('0');
  assertPAGuidedPaymentBoundary(state, '12.34', '12');
  const preview = computeGuidedPreview(state); expect(preview).not.toBeNull(); expect(preview?.totalIncome).toBe('1000.1'); expect(preview?.state).toBeNull();
  expect(JSON.stringify(state)).toBe(before);
});
it('retains the legacy projection without inventing NY liability or canonical PA qualification', () => {
  const state = ucFlow('NY'), before = JSON.stringify(state);
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.form1099G[0]).toMatchObject({ state: 'NY', stateWithheld: '12.34', unemploymentCompensation: '1000.10' });
  const legacy = calculatePAReturn(input, buildGuidedPennsylvaniaOverrides(state));
  expect(legacy.stateWithholding.toFixed()).toBe('0'); expect(legacy.pa40.stateWithholding.toFixed()).toBe('0');
  const preview = computeGuidedPreview(state); expect(preview).not.toBeNull(); expect(preview?.state).toBeNull(); expect(JSON.stringify(state)).toBe(before);
});
it('rejects a duplicate saved government claim without suppressing actual cash', () => {
  const state = ucFlow(); state.sectionData['state-return'] = { ...emptyStateReturnData, additionalStateWithholdingEntries: [{ payer: unemploymentSource.payer, documentType: '1099-G', state: 'PA', taxYear: '2025', amount: '12.34' }] };
  const before = JSON.stringify(state); expect(buildTaxInputFromGuidedData(state)).toBeNull(); expect(JSON.stringify(state)).toBe(before);
});
it.each(['12.34', '0'])('requires the retained government class method even with actual withholding %s', withholding => {
  const fixture = paOrdinaryResidencyFixture('resident');
  fixture.input.form1099G = [Form1099GSchema.parse({ payer: 'Separate fictional state agency', payerTin: '12-3456789', accountReference: 'separate-single-source', accountHolder: 'primary', taxYear: 2025, sourceFormRevision: '2024-03', programType: 'government-unemployment', unemploymentCompensation: '1000.10', federalWithheld: '0', state: 'PA', stateWithheld: withholding, actualReceiptConfirmed: true, sourceFactsConfirmed: true })];
  const before = JSON.stringify(fixture); expect(() => calculatePAResidencySources(fixture.input, fixture.sources)).toThrow('additional retained income originals need their actual PA class source method'); expect(JSON.stringify(fixture)).toBe(before);
});
it('keeps young joint retirement originals and legacy cents while canonical PA remains unavailable', () => {
  const state = startCompleteInterview({ filingStatus: 'mfj', incomeTypes: ['retirement'], lifeEvents: [], stateCode: 'PA' });
  state.sectionData.deductions = { ...emptyDeductionData, nonW2IncomeTaxesDeductedElsewhere: '0' };
  state.sectionData['income-retirement'] = { entries: [
    { ...completeRetirementSource, accountHolder: 'spouse', stateTaxReporting: 'single', state: 'PA', stateWithheld: '0.10', stateDistribution: '1000' },
    { ...completeRetirementSource, payer: 'Other payer', accountReference: 'other', stateTaxReporting: 'single', state: 'NY', stateWithheld: '0.20', stateDistribution: '1000' },
  ] };
  const before = JSON.stringify(state), input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.taxpayer.primary.dateOfBirth).toBe('1990-02-15'); expect(input.taxpayer.spouse?.dateOfBirth).toBe('1992-09-10');
  expect(input.form1099R?.map(row => [row.accountHolder, row.distributionCode, row.grossDistribution, row.taxableAmount, row.state, row.stateWithheld])).toEqual([['spouse', '7', '1000', '1000', 'PA', '0.10'], ['primary', '7', '1000', '1000', 'NY', '0.20']]);
  assertPAGuidedPaymentBoundary(state, '0.1', '0');
  const federal = calculateFederalTax(input); expect(federal.totalIncome.toFixed()).toBe('2000'); expect(federal.totalWithholding.toFixed()).toBe('0');
  const preview = computeGuidedPreview(state); expect(preview).not.toBeNull(); expect(preview?.totalIncome).toBe('2000'); expect(preview?.state).toBeNull(); expect(JSON.stringify(state)).toBe(before);
});
