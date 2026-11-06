// Spec: spec/federal/guided-charitable-carryover.yaml.
import { expect, it } from 'vitest';
import { buildGuidedCharitableCarryover, updateCharitableCarryoverSources } from '@/lib/guided-charitable-carryover';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyDeductionData, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedCharitableCarryover } from '../fixtures/guided-charitable-carryover';
import { completePersonalInfo, completeW2Entry, startCompleteInterview } from './complete-facts';

function required<T>(value: T | undefined): T { if (value === undefined) throw new Error('Missing synthetic charitable source'); return value; }
function fixture() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000' }] };
  state.sectionData.deductions = { ...emptyDeductionData, method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0',
    realEstateTaxes: '0', mortgageInterest: '0', charitableContributions: '0', casualtyLosses: '0', otherItemized: '0',
    gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [], charitableCarryoverSources: actualGuidedCharitableCarryover() };
  return state;
}
const build = (data: ReturnType<typeof actualGuidedCharitableCarryover>) => buildGuidedCharitableCarryover(data, 2025, 'single', completePersonalInfo);

it('preserves actual charitable history without calculating a deduction', () => {
  const data = actualGuidedCharitableCarryover(), first = required(data.vintages)[0];
  first.originalExcess = '72,000.10'; first.openingCarryforward = '70,000.10';
  const before = JSON.stringify(data), result = required(build(data));
  expect(result.vintages?.[0].sourceId).toBe('Original charitable source-A');
  expect(result.vintages?.[0].originalExcess).toBe('72000.10');
  expect(result.vintages?.[0].openingCarryforward).toBe('70000.10');
  expect(result.vintages?.[0].history).toEqual([{ taxYear: 2024, treatedAsPaid: '1400', nolReduction: '100', sourceReference: 'Actual 2024 return and carry worksheet' }]);
  expect(result).not.toHaveProperty('deduction'); expect(result).not.toHaveProperty('contributionBase');
  expect(result).not.toHaveProperty('closingCarryforward'); expect(JSON.stringify(data)).toBe(before);
  expect(buildGuidedCharitableCarryover(undefined, undefined, undefined, undefined)).toBeUndefined();
  const large = actualGuidedCharitableCarryover(), source = required(large.vintages)[0];
  source.originalExcess = '9,007,199,254,740,993.01'; source.originNolReduction = '0';
  source.openingCarryforward = '9007199254740993.01'; source.history = [{ taxYear: '2024', treatedAsPaid: '0', nolReduction: '0', sourceReference: 'Actual zero use' }];
  expect(build(large)?.vintages?.[0].openingCarryforward).toBe('9007199254740993.01');
});

it('rejects missing or contradictory original charitable sources', () => {
  for (const patch of [{ sourceTaxYear: '' }, { sourceTaxYear: '2024' }, { sourceFactsConfirmed: null }, { allCarryoversIncluded: null },
    { calendarYearTaxpayer: false }, { membershipUnchangedConfirmed: false }, { primaryName: 'Different owner' },
    { primaryTaxpayerIdLast4: '4444' }, { vintages: undefined }]) {
    expect(() => build({ ...actualGuidedCharitableCarryover(), ...patch })).toThrow();
  }
  for (const patch of [{ sourceId: '' }, { category: undefined }, { medium: undefined }, { medium: 'noncash' as const },
    { originalExcess: '' }, { originNolReduction: '' }, { openingCarryforward: '70001' }, { adjustedThroughTaxYear: '' },
    { allHistoryIncluded: null }, { ordinaryPercentageMethodConfirmed: false }, { history: undefined }, { history: [] }]) {
    const data = actualGuidedCharitableCarryover(); data.vintages = [{ ...required(data.vintages)[0], ...patch }];
    expect(() => build(data)).toThrow();
  }
  const data = actualGuidedCharitableCarryover(); data.vintages = [...required(data.vintages), ...required(data.vintages)];
  expect(() => build(data)).toThrow(/duplicat/i);
  const gap = actualGuidedCharitableCarryover(); required(required(gap.vintages)[0].history)[0].taxYear = '2022';
  expect(() => build(gap)).toThrow(/interven|history/i);
  const absent = actualGuidedCharitableCarryover(); absent.vintages = [];
  expect(build(absent)?.vintages).toEqual([]);
  const knownZero = actualGuidedCharitableCarryover(), zero = required(knownZero.vintages)[0];
  zero.originalExcess = '0'; zero.originNolReduction = '0'; zero.openingCarryforward = '0';
  zero.history = [{ taxYear: '2024', treatedAsPaid: '0', nolReduction: '0', sourceReference: 'Actual completed zero history' }];
  expect(build(knownZero)?.vintages?.[0].openingCarryforward).toBe('0');
});

it('forwards actual carry history into canonical itemized and standard results', () => {
  const state = fixture(), before = JSON.stringify(state);
  expect(validateSection(state, 'deductions').status).toBe('complete');
  const input = required(buildTaxInputFromGuidedData(state) ?? undefined);
  expect(input.charitableCarryoverSources?.vintages?.[0].openingCarryforward).toBe('70000');
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.scheduleA?.charitableTotal.toFixed()).toBe('60000');
  expect(result.taxableIncome.toFixed()).toBe('40000');
  expect(result.scheduleA?.charitableTreatment?.carryforwards[0]?.amount.toFixed()).toBe('10000');
  expect(computeGuidedPreview(state)).not.toBeNull(); expect(JSON.stringify(state)).toBe(before);
  const standard = fixture(), deductions = required(standard.sectionData.deductions);
  deductions.method = 'standard'; const source = required(required(deductions.charitableCarryoverSources).vintages)[0];
  source.contributionYear = '2024'; source.originalExcess = '1000'; source.originNolReduction = '0'; source.openingCarryforward = '1000'; source.history = [];
  const standardResult = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(standard)));
  expect(standardResult.scheduleA?.charitableTreatment?.deductionMethod).toBe('standard');
  expect(standardResult.scheduleA?.charitableTreatment?.deduction.toFixed()).toBe('0');
  expect(standardResult.scheduleA?.charitableTreatment?.priorTreatedAsPaid.toFixed()).toBe('1000');
  expect(standardResult.scheduleA?.charitableTreatment?.carryforwards).toEqual([]);
  source.openingCarryforward = '';
  expect(validateSection(standard, 'deductions').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(standard)).toBeNull(); expect(computeGuidedPreview(standard)).toBeNull();
});

it('binds actual joint identities and source-year history without filling gaps', () => {
  const joint = actualGuidedCharitableCarryover(); joint.returnMembership = 'same_spouses_joint';
  joint.spouseName = 'Taylor Example'; joint.spouseTaxpayerIdLast4 = '4444';
  expect(buildGuidedCharitableCarryover(joint, 2025, 'mfj', completePersonalInfo)?.spouseName).toBe('Taylor Example');
  joint.spouseTaxpayerIdLast4 = '5555';
  expect(() => buildGuidedCharitableCarryover(joint, 2025, 'mfj', completePersonalInfo)).toThrow(/spouse|identity/i);
  joint.spouseTaxpayerIdLast4 = '4444';
  expect(() => buildGuidedCharitableCarryover(joint, 2025, 'single', completePersonalInfo)).toThrow(/membership|joint/i);
  const nextYear = actualGuidedCharitableCarryover(); nextYear.sourceTaxYear = '2026';
  const source = required(nextYear.vintages)[0]; source.adjustedThroughTaxYear = '2025';
  expect(() => buildGuidedCharitableCarryover(nextYear, 2026, 'single', completePersonalInfo)).toThrow(/interven|history/i);
  required(source.history).push({ taxYear: '2025', treatedAsPaid: '0', nolReduction: '0', sourceReference: 'Actual completed 2025 zero use and reduction' });
  const before = JSON.stringify(nextYear);
  expect(buildGuidedCharitableCarryover(nextYear, 2026, 'single', completePersonalInfo)?.vintages?.[0].history).toHaveLength(2);
  expect(JSON.stringify(nextYear)).toBe(before);
});

it('revokes charitable confirmation after substantive source edits', () => {
  const data = actualGuidedCharitableCarryover(), changed = updateCharitableCarryoverSources(data, { sourceReference: 'Different actual packet' });
  expect(changed.sourceFactsConfirmed).toBeNull(); expect(changed.vintages).toEqual(data.vintages);
  const state = fixture(), deductions = required(state.sectionData.deductions);
  const incomeChanged = updateSectionData(state, 'income-w2', { entries: [{ ...completeW2Entry, wages: '100001' }] });
  expect(incomeChanged.sectionData.deductions?.charitableCarryoverSources?.sourceFactsConfirmed).toBeNull();
  const householdChanged = updateSectionData(state, 'personal-info', { ...completePersonalInfo, lastName: 'Changed household' });
  expect(householdChanged.sectionData.deductions?.charitableCarryoverSources?.sourceFactsConfirmed).toBeNull();
  const confirmed = updateSectionData(state, 'deductions', { ...deductions, charitableCarryoverSources: { ...data, sourceFactsConfirmed: true } });
  expect(confirmed.sectionData.deductions?.charitableCarryoverSources?.sourceFactsConfirmed).toBe(true);
  const edited = updateSectionData(state, 'deductions', { ...deductions, method: 'standard' });
  expect(edited.sectionData.deductions?.charitableCarryoverSources?.sourceFactsConfirmed).toBeNull();
});
