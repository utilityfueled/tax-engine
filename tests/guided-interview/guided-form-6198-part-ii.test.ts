// Spec: spec/federal/2026/form-6198-guided-part-ii.yaml.
import { expect, it, vi } from 'vitest';
import { calculateFederalTax } from '@/engine/public-federal-return';
import { TaxYearInputSchema } from '@/models/inputs';
import { assertPdfExportAllowed } from '@/pdf/export-policy';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyAdjustmentData, getGuidedSectionRoute, parseGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import type { GuidedForm6198PartIIData } from '@/lib/guided-form-6198-part-ii';
import { completeW2Entry, startCompleteInterview } from './complete-facts';

// Test the federal entry point without exposing the incomplete 2026 filing pack.
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

const original = {
  sourceTaxYear: '2026', accountHolder: 'primary', recipientName: 'Jordan Example', recipientTaxpayerIdLast4: '3333',
  activityName: 'Synthetic operating partnership', entityEin: '12-3456789',
  originalK1Reference: 'Actual synthetic 2026 original K-1', openingBasisReference: 'Actual opening outside basis workpaper',
  changeWorksheetReference: 'Actual 2026 Part II ledger',
  box1Loss: '-6,000.00', openingAdjustedBasis: '12,000.00', increases: '0.00', decreases: '8,000.00',
  section199AQBI: '0.00', selfEmploymentEarnings: '0.00', selfEmploymentNetEarningsAfterAdjustments: '0.00', selfEmploymentIncomeType: 'nonfarm',
  oneDomesticNonPtpPartnershipConfirmed: true, allOtherAmountsZeroConfirmed: true, noPriorBasisOrPassiveLossConfirmed: true,
  ordinaryNonpassivePartIIConfirmed: true, noPriorAtRiskLossOrRecaptureConfirmed: true, noQbiOrSelfEmploymentAmountsConfirmed: true,
  sourceFactsConfirmed: true,
} satisfies GuidedForm6198PartIIData;

function saved(originalFacts: GuidedForm6198PartIIData = original, filingStatus: 'single' | 'mfj' = 'single') {
  const state = startCompleteInterview({ filingStatus, incomeTypes: ['w2-wages'], lifeEvents: ['k1-loss-sources'], stateCode: null });
  state.taxYear = 2026;
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, sourceTaxYear: '2026', wages: '85000', federalWithheld: '12500' }] };
  state.sectionData.adjustments = { ...emptyAdjustmentData, form6198PartII: originalFacts };
  const reopened = parseGuidedFlowState(JSON.stringify(state));
  if (!reopened) throw new Error('Expected restored original workpapers');
  return reopened;
}

it('reopens ordinary 2026 Form 6198 records and transfers the limited loss once', () => {
  const state = saved();
  const before = JSON.stringify(state);
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.scheduleK1).toHaveLength(1);
  expect(input.qbiLossSources).toBeUndefined();
  expect(input.k1CharitableSources).toBeUndefined();
  expect(input.scheduleK1[0]).toMatchObject({ taxYear: 2026, accountHolder: 'primary', ordinaryIncome: '-6000.00', beginningBasis: '12000.00',
    section199AQBI: '0.00', selfEmploymentEarnings: '0.00', selfEmploymentNetEarningsAfterAdjustments: '0.00', selfEmploymentIncomeType: 'nonfarm',
    form6198: { partII2026: { originalK1Reference: original.originalK1Reference, openingBasisReference: original.openingBasisReference,
      changeWorksheetReference: original.changeWorksheetReference, openingAdjustedBasis: '12000.00', increases: '0.00', decreases: '8000.00' } } });
  expect(input.scheduleK1[0].form6198?.priorYearAmountAtRisk).toBeUndefined();
  const result = calculateFederalTax(input);
  const partnership = result.scheduleE?.partnerships[0];
  expect(partnership?.basisAdjustedNetAmount.toFixed(2)).toBe('-6000.00');
  expect(partnership?.atRiskAmount?.toFixed(2)).toBe('4000.00');
  expect(partnership?.suspendedAtRiskLoss.toFixed(2)).toBe('-2000.00');
  expect(result.otherIncome.toFixed(2)).toBe('-4000.00');
  expect(result.agi.toFixed(2)).toBe('81000.00');
  expect(JSON.stringify(state)).toBe(before);
  expect(() => assertPdfExportAllowed(2026, 2026, 'filing')).toThrow();

  const spouse = saved({ ...original, accountHolder: 'spouse', recipientName: 'Taylor Example', recipientTaxpayerIdLast4: '4444',
    increases: '0.01', decreases: '8,000.02' }, 'mfj');
  const spouseInput = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(spouse));
  expect(spouseInput.scheduleK1[0].accountHolder).toBe('spouse');
  const spouseResult = calculateFederalTax(spouseInput).scheduleE?.partnerships[0];
  expect(spouseResult?.atRiskAmount?.toFixed(2)).toBe('3999.99');
  expect(spouseResult?.suspendedAtRiskLoss.toFixed(2)).toBe('-2000.01');
});

it('reopens current outside-basis proof and separates the basis and at-risk losses', () => {
  const proof = { reference: 'Completed adjusted outside-basis worksheet', availableForLosses: '5,000.00' };
  const source = { ...original, openingAdjustedBasis: '5,000.00', decreases: '2,000.00', currentOutsideBasis: proof };
  const state = saved(source);
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  expect(state.sectionData.adjustments?.form6198PartII?.currentOutsideBasis).toEqual(proof);
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.scheduleK1[0].form6198?.partII2026?.currentOutsideBasis).toEqual({ ...proof, availableForLosses: '5000.00' });
  const result = calculateFederalTax(input);
  const partnership = result.scheduleE?.partnerships[0];
  expect(partnership?.basisAdjustedNetAmount.toFixed(2)).toBe('-5000.00');
  expect(partnership?.basisResult?.suspendedLossCarryforward.ordinary.toFixed(2)).toBe('1000.00');
  expect(partnership?.suspendedAtRiskLoss.toFixed(2)).toBe('-2000.00');
  expect(result.otherIncome.toFixed(2)).toBe('-3000.00');
  expect(result.agi.toFixed(2)).toBe('82000.00');

  const zero = saved({ ...source, openingAdjustedBasis: '0.00', decreases: '0.00', currentOutsideBasis: { ...proof, availableForLosses: '0.00' } });
  const zeroInput = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(zero));
  const fundedLoss = calculateFederalTax(zeroInput);
  expect(zeroInput.scheduleK1[0].form6198?.partII2026?.currentOutsideBasis?.availableForLosses).toBe('0.00');
  expect(fundedLoss.scheduleE?.partnerships[0].basisResult?.suspendedLossCarryforward.ordinary.toFixed(2)).toBe('6000.00');
  expect(fundedLoss.scheduleE?.partnerships[0].suspendedAtRiskLoss.toFixed(2)).toBe('0.00');
  expect(fundedLoss.agi.toFixed(2)).toBe('85000.00');

  for (const change of [undefined, { reference: proof.reference }, { availableForLosses: '5000.00' },
    { ...proof, availableForLosses: '4,999.99' }]) {
    const pending = saved({ ...source, currentOutsideBasis: change });
    expect(validateSection(pending, 'adjustments').fieldErrors).toHaveProperty('form6198PartII', expect.stringMatching(/outside.basis/i));
    expect(buildTaxInputFromGuidedData(pending)).toBeNull();
  }
  const differentEarlyBasis = saved({ ...original, currentOutsideBasis: proof });
  expect(validateSection(differentEarlyBasis, 'adjustments').fieldErrors).toHaveProperty('form6198PartII', expect.stringMatching(/outside.basis/i));
  expect(buildTaxInputFromGuidedData(differentEarlyBasis)).toBeNull();
});

it('holds missing, contradictory and competing Form 6198 sources without losing saved facts', () => {
  const changes: Array<Partial<GuidedForm6198PartIIData>> = [
    { increases: '' }, { decreases: '' }, { decreases: '0.001' }, { section199AQBI: '1.00' },
    { selfEmploymentEarnings: '' }, { selfEmploymentNetEarningsAfterAdjustments: '0.01' }, { selfEmploymentIncomeType: '' },
    { sourceTaxYear: '2025' }, { accountHolder: 'spouse' }, { recipientName: 'Another Taxpayer' },
    { recipientTaxpayerIdLast4: '4444' }, { entityEin: '' }, { noPriorBasisOrPassiveLossConfirmed: null },
    { openingAdjustedBasis: '5000.00', increases: '2000.00', decreases: '1000.00' },
  ];
  for (const change of changes) {
    const state = saved({ ...original, ...change });
    expect(validateSection(state, 'adjustments').fieldErrors).toHaveProperty('form6198PartII');
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    expect(state.sectionData.adjustments?.form6198PartII).toEqual({ ...original, ...change });
  }
  const state = saved();
  const adjustments = state.sectionData.adjustments!;
  const competing = updateSectionData(state, 'adjustments', { ...adjustments, k1LossSources: {} });
  expect(validateSection(competing, 'adjustments').fieldErrors).toHaveProperty('form6198PartII', expect.stringMatching(/separate|competing/i));
  expect(buildTaxInputFromGuidedData(competing)).toBeNull();

  const edited = updateSectionData(state, 'adjustments', { ...adjustments, form6198PartII: { ...original, increases: '0.01' } });
  expect(edited.sectionData.adjustments?.form6198PartII).toMatchObject({ increases: '0.01', sourceFactsConfirmed: null });
  expect(buildTaxInputFromGuidedData(edited)).toBeNull();

  const otherYear = setInterviewTaxYear(state, 2025);
  expect(otherYear.sectionData.adjustments?.form6198PartII).toMatchObject({ ...original, sourceFactsConfirmed: null });
  expect(validateSection(otherYear, 'adjustments').fieldErrors).toHaveProperty('form6198PartII');
  expect(getGuidedSectionRoute({ ...otherYear, segmentation: { ...otherYear.segmentation, lifeEvents: [] } }).some(section => section.id === 'adjustments')).toBe(true);
});

it('rechecks a saved Form 6198 original when the owning taxpayer changes without changing the suffix', () => {
  const state = saved();
  const personal = state.sectionData['personal-info']!;
  const formatting = updateSectionData(state, 'personal-info', { ...personal, firstName: 'JORDAN', ssn: '111223333' });
  expect(formatting.sectionData.adjustments?.form6198PartII?.sourceFactsConfirmed).toBe(true);
  expect(buildTaxInputFromGuidedData(formatting)?.scheduleK1).toHaveLength(1);

  const edited = updateSectionData(state, 'personal-info', { ...personal, ssn: '999-99-3333' });
  const reopened = parseGuidedFlowState(JSON.stringify(edited));
  if (!reopened) throw new Error('Expected reopened owner change');
  expect(reopened.sectionData.adjustments?.form6198PartII).toEqual({ ...original, sourceFactsConfirmed: null });
  expect(validateSection(reopened, 'adjustments').fieldErrors).toHaveProperty('form6198PartII');
  expect(buildTaxInputFromGuidedData(reopened)).toBeNull();

  const spouse = saved({ ...original, accountHolder: 'spouse', recipientName: 'Taylor Example', recipientTaxpayerIdLast4: '4444' }, 'mfj');
  const jointPersonal = spouse.sectionData['personal-info']!;
  const otherOwner = updateSectionData(spouse, 'personal-info', { ...jointPersonal, ssn: '999-99-3333' });
  expect(otherOwner.sectionData.adjustments?.form6198PartII?.sourceFactsConfirmed).toBe(true);
  expect(buildTaxInputFromGuidedData(otherOwner)?.scheduleK1[0].accountHolder).toBe('spouse');
  const changedSpouse = updateSectionData(spouse, 'personal-info', { ...jointPersonal, spouse: { ...jointPersonal.spouse!, ssn: '999-99-4444' } });
  expect(changedSpouse.sectionData.adjustments?.form6198PartII?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changedSpouse)).toBeNull();
});
