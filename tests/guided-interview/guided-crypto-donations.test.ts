// Spec: spec/federal/guided-crypto-donations.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { validateSection, updateSectionData } from '@/lib/guided-interview-flow';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { actualCryptoDonationInterview } from '../fixtures/guided-crypto-donations';
import { buildGuidedCryptoDonations, updateCryptoDonation } from '@/lib/guided-crypto-donations';
import { buildGuidedNetOperatingLoss } from '@/lib/guided-net-operating-loss';
import { actualGuidedNolSources } from '../fixtures/guided-net-operating-loss';

it('requires independent charitable histories for original gifts with NOL sources', () => {
  const state = actualCryptoDonationInterview();
  const personal = state.sectionData['personal-info'];
  const deductions = state.sectionData.deductions;
  const sources = structuredClone(actualGuidedNolSources);
  if (!personal || !deductions || !sources.alternativeTax) throw new Error('Missing fictional source');
  const build = () => buildGuidedNetOperatingLoss(sources, 2025, 'single', personal, deductions);
  expect(build).toThrow(/independent prior regular and AMT charitable histories/i);
  sources.alternativeTax.charitableCarryoverHistory = {
    sourceTaxYear: '2024', sourceReference: 'Independent actual regular and AMT charity histories',
    sourceFactsConfirmed: true, allCarryoversIncluded: true,
    priorRegularCarryovers: [], priorAlternativeCarryovers: [],
  };
  expect(build()?.alternativeTax?.charitableCarryoverHistory).toMatchObject({ priorRegularCarryovers: [], priorAlternativeCarryovers: [] });
  const confirmed = structuredClone(sources.alternativeTax.charitableCarryoverHistory);
  for (const field of ['priorRegularCarryovers', 'priorAlternativeCarryovers'] as const) {
    sources.alternativeTax.charitableCarryoverHistory = { ...confirmed, [field]: undefined };
    expect(build).toThrow(/independent prior regular and AMT charitable histories/i);
  }
  sources.alternativeTax.charitableCarryoverHistory = undefined;
  deductions.cryptoDonations = [];
  expect(build).toThrow(/independent prior regular and AMT charitable histories/i);
  deductions.cryptoDonations = undefined;
  expect(build()?.alternativeTax?.charitableCarryoverHistory).toBeUndefined();
});

it('reconciles known similar-property gifts as one source group', () => {
  const state = actualCryptoDonationInterview();
  const deductions = state.sectionData.deductions;
  const first = deductions?.cryptoDonations?.[0];
  if (!deductions || !first) throw new Error('Missing fictional source');
  deductions.cryptoDonations = [
    { ...first, fairMarketValueAtDonation: '4000', appraisalRequired: false, qualifiedAppraisalObtained: false },
    { ...first, fairMarketValueAtDonation: '4000', charityName: 'Second actual recipient', appraisalRequired: false, qualifiedAppraisalObtained: false },
  ];
  expect(() => buildGuidedCryptoDonations(deductions.cryptoDonations, 2025)).toThrow(/similar.*appraisal|appraisal.*similar/i);
  expect(validateSection(state, 'deductions').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  expect(computeGuidedPreview(state)).toBeNull();
  deductions.cryptoDonations = deductions.cryptoDonations.map(row => ({ ...row, appraisalRequired: true, qualifiedAppraisalObtained: true }));
  expect(validateSection(state, 'deductions').status).toBe('complete');
  expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state))).itemizedDeductions.toFixed()).toBe('8000');
});

it('carries original gifts once through the actual deduction choice', () => {
  const state = actualCryptoDonationInterview(), original = structuredClone(state);
  expect(validateSection(state, 'deductions').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.cryptoIncome?.donations).toHaveLength(1);
  expect(input.cryptoIncome?.donations[0]).toMatchObject({ quantity: '0.0000000001234567890123456789123', fairMarketValueAtDonation: '20000', costBasis: '1000', dateAcquired: '2023-01-01', dateDonated: '2025-06-01' });
  expect(input.donations).toEqual([]);
  const result = calculateFederalTax(input);
  expect(result.itemizedDeductions.toFixed()).toBe('20000');
  expect(result.taxableIncome.toFixed()).toBe('80000');
  expect(computeGuidedPreview(state)).not.toBeNull();
  expect(state).toEqual(original);
  const row = state.sectionData.deductions?.cryptoDonations?.[0];
  if (!row || !state.sectionData.deductions) throw new Error('Missing fictional source');
  // Exactly one year retains the basis limit; the previous calendar date does not.
  row.dateAcquired = '2024-06-01';
  expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state))).itemizedDeductions.toFixed()).toBe('1000');
  row.dateAcquired = '2024-05-31';
  expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state))).itemizedDeductions.toFixed()).toBe('20000');
  state.sectionData.deductions.method = 'standard';
  const standard = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)));
  expect(standard.deductionUsed).toBe('standard');
  expect(standard.deductionAmount.toFixed()).toBe('15750');
});
it('keeps missing false and zero donation facts distinct', () => {
  const state = actualCryptoDonationInterview();
  const row = state.sectionData.deductions?.cryptoDonations?.[0];
  if (!row) throw new Error('Missing fictional source');
  row.costBasis = '';
  expect(validateSection(state, 'deductions').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  expect(computeGuidedPreview(state)).toBeNull();
  row.costBasis = '0';
  expect(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)).cryptoIncome?.donations[0].costBasis).toBe('0');
  for (const patch of [
    { quantity: '' }, { fairMarketValueAtDonation: '' }, { dateAcquired: '' },
    { dateDonated: '2025-02-29' }, { dateAcquired: '2025-06-02' },
    { recipientCategory: undefined }, { recipientCategory: 'other-qualified' as const },
    { capitalAsset: null }, { sourceFactsConfirmed: false }, { isQualifiedOrganization: null },
    { noGoodsOrServicesReceived: false }, { fullOwnershipInterestDonated: false },
    { substantiationRequirementsMet: false }, { appraisalRequired: null },
    { appraisalRequired: false }, { qualifiedAppraisalObtained: false },
    { costBasis: '-1' }, { quantity: 'NaN' }, { fairMarketValueAtDonation: '1e3' },
  ]) expect(() => buildGuidedCryptoDonations([{ ...row, ...patch }], 2025), JSON.stringify(patch)).toThrow();
  // An appraisal requirement can arise from other similar gifts, even for a small row.
  expect(() => buildGuidedCryptoDonations([{ ...row, fairMarketValueAtDonation: '4000', appraisalRequired: true, qualifiedAppraisalObtained: false }], 2025)).toThrow(/appraisal/i);
  const ineligible = buildGuidedCryptoDonations([{ ...row, isQualifiedOrganization: false, recipientCategory: undefined, capitalAsset: false, appraisalRequired: false, qualifiedAppraisalObtained: false }], 2025);
  expect(ineligible?.[0]).toMatchObject({ costBasis: '0', isQualifiedOrganization: false, capitalAsset: false, appraisalRequired: false, qualifiedAppraisalObtained: false });
  if (!state.sectionData.deductions) throw new Error('Missing fictional deductions');
  state.sectionData.deductions.cryptoDonations = ineligible;
  expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state))).itemizedDeductions.toFixed()).toBe('0');
  expect(buildGuidedCryptoDonations(undefined, undefined)).toBeUndefined();
  expect(buildGuidedCryptoDonations([], 2025)).toEqual([]);
});
it('binds the actual year and invalidates changed original records', () => {
  const state = actualCryptoDonationInterview();
  const data = state.sectionData.deductions;
  if (!data?.cryptoDonations) throw new Error('Missing fictional source');
  const next = updateSectionData(state, 'deductions', { ...data, cryptoDonations: data.cryptoDonations.map(row => ({ ...row, dateDonated: '2025-06-02' })) });
  expect(next.sectionData.deductions?.cryptoDonations?.[0].sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(next)).toBeNull();
  const edited = next.sectionData.deductions;
  if (!edited?.cryptoDonations?.[0]) throw new Error('Missing edited source');
  const confirmed = updateSectionData(next, 'deductions', { ...edited, cryptoDonations: edited.cryptoDonations.map(row => ({ ...row, sourceFactsConfirmed: true })) });
  expect(confirmed.sectionData.deductions?.cryptoDonations?.[0].sourceFactsConfirmed).toBe(true);
  expect(buildTaxInputFromGuidedData(confirmed)).not.toBeNull();
  const row = edited.cryptoDonations[0];
  expect(updateCryptoDonation(row, { costBasis: '0' })).toMatchObject({ costBasis: '0', sourceFactsConfirmed: null });
  expect(updateCryptoDonation(row, { sourceFactsConfirmed: true }).sourceFactsConfirmed).toBe(true);
  const household = confirmed.sectionData['personal-info'];
  if (!household) throw new Error('Missing fictional household');
  expect(updateSectionData(confirmed, 'personal-info', { ...household, firstName: 'Changed' }).sectionData.deductions?.cryptoDonations?.[0].sourceFactsConfirmed).toBeNull();
  expect(() => buildGuidedCryptoDonations(data.cryptoDonations, 2026)).toThrow(/year/i);
  expect(() => buildGuidedCryptoDonations(data.cryptoDonations, 2024)).toThrow(/year/i);
  state.taxYear = 2026;
  data.cryptoDonations[0].dateDonated = '2026-06-01';
  const future = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(future.taxpayer.taxYear).toBe(2026);
  expect(future.cryptoIncome?.donations[0].dateDonated).toBe('2026-06-01');
  expect(computeGuidedPreview(state)).toBeNull();
  expect(() => calculateFederalTax(future)).toThrow(/2026|not.*ready|unavailable/i);
});
