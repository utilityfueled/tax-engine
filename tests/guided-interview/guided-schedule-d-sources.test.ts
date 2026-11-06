// Spec: spec/federal/guided-schedule-d-sources.yaml.
import { expect, it } from 'vitest';
import { buildGuidedScheduleDInputs, captureScheduleDRecords } from '@/lib/guided-schedule-d-sources';
import { buildGuidedChildElections } from '@/lib/guided-child-election-facts';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm8814IncomeCharacter } from '@/engine/forms/form-8814-income-character.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { getConstants } from '@/models/constants.js';
import { completeBrokerageSource, completeDividendSource, completeTransactionSource, startCompleteInterview } from './complete-facts';
import { actualGuidedChild } from '../fixtures/guided-child-election';
import { actualGuidedScheduleD } from '../fixtures/guided-schedule-d-sources';

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Missing explicit synthetic fixture source');
  return value;
}
const investments = (state: GuidedFlowState) => required(state.sectionData['income-investments']);
const worksheet = (state: GuidedFlowState) => required(investments(state).scheduleDSources);
const broker = (state: GuidedFlowState) => required(investments(state).brokerageEntries[0]);
const transaction = (state: GuidedFlowState) => required(broker(state).transactions[0]);

function fixture(): GuidedFlowState {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null });
  state.sectionData['income-investments'] = { interestEntries: [], dividendEntries: [], brokerageEntries: [],
    scheduleDSources: structuredClone(actualGuidedScheduleD), childElections: [{ ...actualGuidedChild,
      taxableInterest: '4000', taxExemptInterest: '0', amtStatements: [], capitalGainDistributions: '6000',
      specialCapitalDistributionPresent: true, incomeCharacterSourceReference: 'Actual child original distributions',
      collectiblesGain: '1000', unrecapturedSection1250Gain: '2000', section1202Gain: '0',
    }] };
  return state;
}
function build(state: GuidedFlowState) { return buildGuidedScheduleDInputs(state.sectionData['income-investments'], state.taxYear, state.segmentation.filingStatus, state.sectionData['personal-info']); }
it('routes actual child special gains and signed carry sources through canonical netting', () => {
  const state = fixture(), original = JSON.stringify(state), input = buildTaxInputFromGuidedData(state);
  expect(input).not.toBeNull(); if (!input) throw new Error('Actual sources were not forwarded');
  expect(input.priorYear?.shortTermCapitalLoss).toBe('-1000');
  expect(input.form8814[0]?.electionFacts?.incomeCharacter?.collectiblesGain).toBe('1000');
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.scheduleD.netCapitalGainLoss.toFixed()).toBe('3380');
  expect(result.allLines.find(line => line.form === 'Sched D' && line.line === '18')?.value.toFixed()).toBe('0');
  expect(result.allLines.find(line => line.form === 'Sched D' && line.line === '19')?.value.toFixed()).toBe('1190');
  expect(JSON.stringify(state)).toBe(original);
  const middle = structuredClone(state); required(middle.sectionData['personal-info']).middleName = 'Quinn'; required(worksheet(middle).primary).firstName = 'Jordan Q';
  expect(build(middle).scheduleDSpecialGainSources?.primary.firstName).toBe('Jordan Q');
  delete investments(state).scheduleDSources;
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  const carryOnly = fixture(); investments(carryOnly).childElections = [];
  expect(validateSection(carryOnly, 'income-investments').status).toBe('complete');
  const carryInput = buildTaxInputFromGuidedData(carryOnly); if (!carryInput) throw new Error('Actual capital carry source was omitted');
  expect(calculateFederalTax(TaxYearInputSchema.parse(carryInput)).scheduleD.netCapitalGainLoss.toFixed()).toBe('-1000');
});
it('captures only supplied sources and rejects stale missing duplicate and unknown facts', () => {
  const state = fixture(), sources = investments(state);
  sources.childElections = [];
  sources.brokerageEntries = [{ ...completeBrokerageSource, sourceTaxYear: '2025', sourceId: 'Actual broker statement', transactions: [{ ...completeTransactionSource, specialGainCharacter: 'collectible', proceeds: '9007199254740993.03', costBasis: '9007199254740992.02' }] }];
  sources.dividendEntries = [{ ...completeDividendSource, capitalGainDistributions: '100', section1250Gain: '75.25' }];
  const captured = captureScheduleDRecords(sources);
  expect(captured.longTermAssets[0]).toMatchObject({ sourceId: 'form1099B:0:transaction:0', sourceTaxYear: '2025', proceeds: '9007199254740993.03', character: 'collectible' });
  expect(captured.reportedGains[0]?.sourceTaxYear).toBeUndefined();
  sources.scheduleDSources = { ...actualGuidedScheduleD, ...captured,
    reportedGains: captured.reportedGains.map(row => ({ ...row, sourceTaxYear: '2025', sourceReference: 'Actual fund original statement' })), sourceFactsConfirmed: true };
  expect(build(state).scheduleDSpecialGainSources?.longTermAssets[0]?.proceeds).toBe('9007199254740993.03');
  for (const mutate of [
    (next: typeof state) => { transaction(next).proceeds = '9007199254740993.04'; },
    (next: typeof state) => { required(worksheet(next).reportedGains?.[0]).sourceTaxYear = ''; },
    (next: typeof state) => { required(worksheet(next).longTermAssets).push({ ...required(worksheet(next).longTermAssets?.[0]) }); },
    (next: typeof state) => { worksheet(next).priorShortTermCapitalLoss = ''; },
    (next: typeof state) => { worksheet(next).amtBasisAndCarryoversSameAsRegularConfirmed = null; },
    (next: typeof state) => { required(worksheet(next).primary).ssnLast4 = '9999'; },
    (next: typeof state) => { worksheet(next).reportedGains = []; },
    (next: typeof state) => { broker(next).sourceId = 'Different actual statement'; },
  ]) { const next = structuredClone(state); mutate(next); expect(() => build(next)).toThrow(); }
  const missing = structuredClone(sources); delete required(missing.brokerageEntries[0]).sourceTaxYear; required(required(missing.brokerageEntries[0]).transactions[0]).washSaleDisallowed = '';
  expect(captureScheduleDRecords(missing).longTermAssets[0]).toMatchObject({ sourceTaxYear: undefined, washSaleDisallowed: '' });
  const ordinary = structuredClone(state); investments(ordinary).scheduleDSources = undefined; investments(ordinary).dividendEntries = [];
  transaction(ordinary).specialGainCharacter = undefined;
  expect(buildTaxInputFromGuidedData(ordinary)).toBeNull();
});
it('preserves positive Alaska character and rejects conflicting special subsets', () => {
  const child = { ...actualGuidedChild, taxableInterest: '4000', ordinaryDividends: '2000', taxExemptInterest: '0', amtStatements: [],
    alaskaDividendPresent: true, alaskaPermanentFundDividends: '2000', incomeCharacterSourceReference: 'Actual Alaska dividend record' };
  const input = buildGuidedChildElections([child], 2025);
  const result = calculateForm8814IncomeCharacter(input, getConstants(2025));
  expect(result.ordinaryInvestmentIncome.toFixed()).toBe('2200'); expect(result.children[0]?.line12.toFixed()).toBe('3300');
  for (const patch of [{ alaskaPermanentFundDividends: '' }, { alaskaPermanentFundDividends: '2000.01' }, { alaskaDividendPresent: false },
    { specialCapitalDistributionPresent: true, collectiblesGain: '1', unrecapturedSection1250Gain: '0', section1202Gain: '0' },
    { capitalGainDistributions: '100', specialCapitalDistributionPresent: true, collectiblesGain: '0', unrecapturedSection1250Gain: '0', section1202Gain: '1' }]) {
    expect(() => buildGuidedChildElections([{ ...child, ...patch }], 2025)).toThrow();
  }
});
it('revokes stale source confirmation while preserving actual records and confirmation-only changes', () => {
  const state = fixture(), before = JSON.stringify(state.sectionData['income-investments']?.scheduleDSources);
  const changed = updateSectionData(state, 'personal-info', { ...state.sectionData['personal-info'], lastName: 'Changed' });
  expect(changed.sectionData['income-investments']?.scheduleDSources?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData['income-investments']?.scheduleDSources?.sourceReference).toBe('Actual capital worksheet');
  const confirmed = updateSectionData(state, 'income-investments', { ...state.sectionData['income-investments'], scheduleDSources: { ...actualGuidedScheduleD, sourceFactsConfirmed: true } });
  expect(confirmed.sectionData['income-investments']?.childElections?.[0]?.sourceFactsConfirmed).toBe(true);
  expect(JSON.stringify(state.sectionData['income-investments']?.scheduleDSources)).toBe(before);
});
it('binds joint identities and preserves unsupported source method answers', () => {
  const state = fixture();
  investments(state).childElections = [];
  state.segmentation.filingStatus = 'mfj';
  required(state.sectionData['personal-info']).spouse = { firstName: 'Alex', lastName: 'Example', ssn: '444-55-6666', dateOfBirth: '1991-03-12', usResidencyMonths: '12' };
  expect(() => build(state)).toThrow(/identity/);
  worksheet(state).spouse = { firstName: 'Alex', lastName: 'Example', ssnLast4: '6666' };
  expect(build(state).scheduleDSpecialGainSources?.spouse?.ssnLast4).toBe('6666');
  for (const patch of [
    { sourceTaxYear: '2026' }, { allSourcesIncluded: null }, { sourceFactsConfirmed: false },
    { priorShortTermCapitalLoss: '1' }, { section1231Lookback: '0.01' },
    { amtBasisAndCarryoversSameAsRegularConfirmed: false }, { form2439Present: true },
    { partnershipInterestDispositionPresent: true }, { other1250DispositionPresent: true },
  ]) {
    const next = structuredClone(state); Object.assign(worksheet(next), patch);
    const before = JSON.stringify(next); expect(() => build(next)).toThrow(); expect(JSON.stringify(next)).toBe(before);
  }
  const single = structuredClone(state); single.segmentation.filingStatus = 'single';
  expect(() => build(single)).toThrow(/spouse/);
});
