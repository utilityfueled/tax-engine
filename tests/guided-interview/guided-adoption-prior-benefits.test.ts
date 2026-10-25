// Spec: spec/federal/guided-adoption-prior-benefits.yaml.
import { expect, it } from 'vitest';
import { buildAdoptionInput, adoptionFactErrors } from '@/lib/guided-adoption-facts';
import { updateAdoptionSources } from '@/lib/guided-adoption-prior-benefits';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyCreditsData, updateSectionData } from '@/lib/guided-interview-flow';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { calculateFederalTax } from '../../src/engine/federal';
import { TaxYearInputSchema } from '../../src/models/inputs';
import { actualGuidedAdoptionHistory } from '../fixtures/guided-adoption-prior-benefits';
import { completePersonalInfo, completeW2Entry, startCompleteInterview } from './complete-facts';
function required<T>(value: T | undefined | null): T { if (value == null) throw new Error('Missing actual fixture'); return value; }
it('binds exact prior benefit sources without invented calculation context', () => {
  const data = actualGuidedAdoptionHistory(), before = JSON.stringify(data);
  expect(adoptionFactErrors(data, 2025, 'single', completePersonalInfo)).toEqual({});
  const child = required(buildAdoptionInput(data, 2025, 'single', completePersonalInfo)).children[0];
  expect(child.priorYearForeignBenefitHistory?.records?.[0]).toMatchObject({ taxYear: 2024, originalEmployerBenefits: '8000.10', benefitsAllocatedToChild: '8000.10', accountHolder: 'primary' });
  expect(child.priorYearForeignBenefits).toBe('8000.10'); expect(child).not.toHaveProperty('adoptionIncomeAdjustment');
  expect(JSON.stringify(data)).toBe(before);
});
it('preserves old records and rejects missing or contradictory history', () => {
  const data = actualGuidedAdoptionHistory();
  const old = structuredClone(data); old.children[0].priorYearForeignBenefitHistory = undefined; old.children[0].priorYearForeignBenefits = '0';
  expect(buildAdoptionInput(old, 2025, 'single')?.children[0].priorYearForeignBenefits).toBe('0');
  expect(old.children[0].priorYearForeignBenefitHistory).toBeUndefined();
  for (const patch of [{ sourceFactsConfirmed: null }, { sourceTaxYear: '' }, { childNameOnSource: 'Different child' }, { otherAdopterReceivedBenefits: true }, { priorExclusionLimitUsed: '' }, { records: undefined }]) {
    const next = structuredClone(data); next.children[0].priorYearForeignBenefitHistory = { ...required(next.children[0].priorYearForeignBenefitHistory), ...patch };
    expect(() => buildAdoptionInput(next, 2025, 'single', completePersonalInfo)).toThrow();
  }
  for (const amount of ['', '-1', 'NaN', 'Infinity', '8000.11']) {
    const next = structuredClone(data); required(required(next.children[0].priorYearForeignBenefitHistory).records)[0].benefitsAllocatedToChild = amount;
    expect(() => buildAdoptionInput(next, 2025, 'single', completePersonalInfo)).toThrow();
  }
  expect(() => buildAdoptionInput(data, 2025, 'single')).toThrow(/identity context/);
  expect(() => buildAdoptionInput(data, 2026, 'single', completePersonalInfo)).toThrow();
});
it('revokes historical confirmation after source and household edits', () => {
  const data = actualGuidedAdoptionHistory();
  const next = updateAdoptionSources(data, { children: data.children.map(child => ({ ...child, childFirstName: 'Changed' })) });
  expect(next.children[0].priorYearForeignBenefitHistory?.sourceFactsConfirmed).toBeNull();
  const confirmed = updateAdoptionSources(next, { children: next.children.map(child => ({ ...child,
    priorYearForeignBenefitHistory: { ...required(child.priorYearForeignBenefitHistory), sourceFactsConfirmed: true } })) });
  expect(confirmed.children[0].priorYearForeignBenefitHistory?.sourceFactsConfirmed).toBe(true);
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.sectionData.credits = { ...emptyCreditsData, adoption: data };
  for (const [section, value] of [['personal-info', { ...completePersonalInfo, ssn: '123-45-6789' }], ['income-w2', { entries: [{ ...completeW2Entry, wages: '1' }] }], ['credits', { ...emptyCreditsData, adoption: next }]] as const) {
    expect(updateSectionData(state, section, value).sectionData.credits?.adoption?.children[0].priorYearForeignBenefitHistory?.sourceFactsConfirmed).toBeNull();
  }
  expect(updateSectionData(state, 'credits', { ...emptyCreditsData, adoption: data }).sectionData.credits?.adoption?.children[0].priorYearForeignBenefitHistory?.sourceFactsConfirmed).toBe(true);
});
it('carries actual historical benefits through canonical preview once', () => {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000', socialSecurityWages: '102000', medicareWages: '102000',
    socialSecurityWithheld: '6324', medicareWithheld: '1479', box12CodeT: '2000' }] };
  state.sectionData.credits = { ...emptyCreditsData, adoption: actualGuidedAdoptionHistory() };
  const input = required(buildTaxInputFromGuidedData(state));
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.agi.toFixed()).toBe('92000'); expect(result.form8839?.adoptionIncomeAdjustment.toFixed()).toBe('-8000');
  expect(input.form8839?.children[0].priorYearForeignBenefits).toBe('8000.10'); expect(computeGuidedPreview(state)).not.toBeNull();
  const history = required(required(state.sectionData.credits.adoption).children[0].priorYearForeignBenefitHistory); history.sourceFactsConfirmed = null;
  expect(buildTaxInputFromGuidedData(state)).toBeNull(); expect(computeGuidedPreview(state)).toBeNull();
});
