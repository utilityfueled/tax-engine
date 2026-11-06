// Spec: spec/federal/guided-rental-carry-sources.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { buildGuidedRentalCarryovers } from '@/lib/guided-rental-carry-sources';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedRentalCarry } from '../fixtures/guided-rental-carry';
import { actualGuidedScheduleD } from '../fixtures/guided-schedule-d-sources';
import { completeRentalSource, completeW2Entry, startCompleteInterview } from './complete-facts';

function fixture() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages', 'rental'], lifeEvents: [], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '120000', socialSecurityWages: '120000', medicareWages: '120000', federalWithheld: '30000' }] };
  state.sectionData['income-rental'] = { entries: [{ ...completeRentalSource, ownershipPercentage: '50', minimumOwnershipPercentage: '50',
    rents: '20000', priorYearUnallowedLoss: '3000', qualifiesForQBI: true, qbiIsSST: false, qbiW2Wages: '0', qbiUBIA: '0',
    priorLossSources: structuredClone(actualGuidedRentalCarry) }] };
  return state;
}
function entry(state: ReturnType<typeof fixture>) { const result = state.sectionData['income-rental']?.entries[0]; if (!result) throw new Error('Missing source fixture'); return result; }
function facts(state: ReturnType<typeof fixture>) { const result = entry(state).priorLossSources; if (!result) throw new Error('Missing carry fixture'); return result; }
function vintage(state: ReturnType<typeof fixture>) { const result = facts(state).vintages?.[0]; if (!result) throw new Error('Missing vintage fixture'); return result; }
function build(state: ReturnType<typeof fixture>) { return buildGuidedRentalCarryovers(state.sectionData['income-rental']?.entries, state.taxYear, state.segmentation.filingStatus, state.sectionData['personal-info']); }

it('routes actual owner carry once and retains capital history', () => {
  const state = fixture(), before = JSON.stringify(state), input = buildTaxInputFromGuidedData(state);
  expect(input).not.toBeNull(); if (!input) throw new Error('Complete rental carry was omitted');
  expect(input.priorYear?.suspendedPassiveLosses?.[0]).toMatchObject({ partnershipName: entry(state).description, amount: '3000',
    qbiLossTracking: { sourceTaxYear: 2024, vintages: [{ originalLoss: '5000', remainingLoss: '3000', materiallyParticipatedInCurrentYear: false }] } });
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.agi.toFixed()).toBe('127000'); expect(result.form8995?.totalQBI.toFixed()).toBe('7000');
  expect(result.form8995?.qbiDeduction.toFixed()).toBe('1400'); expect(JSON.stringify(state)).toBe(before);
  state.sectionData['income-investments'] = { interestEntries: [], dividendEntries: [], brokerageEntries: [], scheduleDSources: structuredClone(actualGuidedScheduleD) };
  const combined = buildTaxInputFromGuidedData(state);
  expect(combined?.priorYear?.shortTermCapitalLoss).toBe('-1000');
  expect(combined?.priorYear?.suspendedPassiveLosses?.[0]?.amount).toBe('3000');
  expect(calculateFederalTax(TaxYearInputSchema.parse(combined)).agi.toFixed()).toBe('126000');
});

it('preserves original loss character and rejects incomplete histories', () => {
  const state = fixture(); vintage(state).taxYear = '2017'; vintage(state).qualifiedOriginalLoss = '0'; vintage(state).qualifiedRemainingLoss = '0';
  const result = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)));
  expect(result.form8995?.totalQBI.toFixed()).toBe('10000'); expect(result.form8995?.qbiDeduction.toFixed()).toBe('2000');
  for (const mutate of [
    (next: typeof state) => { facts(next).vintages = undefined; },
    (next: typeof state) => { facts(next).vintages = []; },
    (next: typeof state) => { facts(next).vintages?.push({ ...vintage(next) }); },
    (next: typeof state) => { vintage(next).remainingLoss = '3000.01'; },
    (next: typeof state) => { vintage(next).remainingLoss = 'NaN'; },
    (next: typeof state) => { vintage(next).qualifiedRemainingLoss = ''; },
    (next: typeof state) => { vintage(next).qualifiedOriginalLoss = '1'; },
    (next: typeof state) => { vintage(next).taxYear = '2025'; },
    (next: typeof state) => { entry(next).priorYearUnallowedLoss = '3001'; },
  ]) { const next = structuredClone(state); mutate(next); expect(() => build(next)).toThrow(); expect(buildTaxInputFromGuidedData(next)).toBeNull(); }
  const zero = fixture(); entry(zero).priorYearUnallowedLoss = '0'; delete entry(zero).priorLossSources;
  expect(build(zero)).toEqual([]); expect(validateSection(zero, 'income-rental').status).toBe('complete');
  entry(zero).priorLossSources = { ...actualGuidedRentalCarry, vintages: [] };
  expect(build(zero)?.[0]?.qbiLossTracking?.vintages).toEqual([]);
  vintage(state).originalLoss = '9007199254740993';
  expect(build(state)?.[0]?.qbiLossTracking?.vintages[0].originalLoss).toBe('9007199254740993');
});

it('requires matching owner history participation and independent AMT records', () => {
  const state = fixture();
  for (const mutate of [
    (next: typeof state) => { facts(next).ownerName = 'Different Person'; },
    (next: typeof state) => { facts(next).ownerTaxpayerIdLast4 = '9999'; },
    (next: typeof state) => { entry(next).description = 'Different property'; },
    (next: typeof state) => { facts(next).sourceTaxYear = '2023'; },
    (next: typeof state) => { facts(next).priorFilingStatus = 'mfj'; },
    (next: typeof state) => { facts(next).ownershipUnchangedConfirmed = false; },
    (next: typeof state) => { facts(next).sameTaxpayersConfirmed = null; },
    (next: typeof state) => { facts(next).activityContinuesConfirmed = false; },
    (next: typeof state) => { facts(next).ordinaryRentalLossesOnly = false; },
    (next: typeof state) => { facts(next).ownerAmountsConfirmed = null; },
    (next: typeof state) => { facts(next).amtSourceReference = ''; },
    (next: typeof state) => { facts(next).amtBasisAndDepreciationMatch = false; },
    (next: typeof state) => { facts(next).amtPriorLossMatches = null; },
    (next: typeof state) => { facts(next).amtAllowedLossMatches = false; },
    (next: typeof state) => { entry(next).allInvestmentAtRisk = false; },
    (next: typeof state) => { vintage(next).activelyParticipatedInLossYear = false; },
    (next: typeof state) => { vintage(next).activelyParticipatedInLossYear = null; },
  ]) { const next = structuredClone(state); mutate(next); expect(() => build(next)).toThrow(); }
  vintage(state).activelyParticipatedInLossYear = false; entry(state).isActiveParticipant = false;
  expect(build(state)?.[0]?.amount).toBe('3000');
  state.taxYear = 2026; facts(state).sourceTaxYear = '2025'; vintage(state).materiallyParticipatedInCurrentYear = null;
  expect(() => build(state)).toThrow(/participat/i);
  vintage(state).materiallyParticipatedInCurrentYear = false;
  expect(build(state)?.[0]?.qbiLossTracking?.sourceTaxYear).toBe(2025);
});

it('invalidates substantive return changes without confirmation cycles', () => {
  const state = fixture(), changed = updateSectionData(state, 'income-w2', { entries: [{ ...completeW2Entry, wages: '130000' }] });
  expect(facts(changed).sourceFactsConfirmed).toBeNull(); expect(facts(changed).amtSourceReference).toBe(actualGuidedRentalCarry.amtSourceReference);
  const confirmed = updateSectionData(changed, 'income-rental', { entries: [{ ...entry(changed), sourceFactsConfirmed: true, priorLossSources: { ...facts(changed), sourceFactsConfirmed: true } }] });
  expect(facts(confirmed).sourceFactsConfirmed).toBe(true);
  const changedHistory = updateSectionData(state, 'income-rental', { entries: [{ ...entry(state), priorLossSources: { ...facts(state), sourceReference: 'Changed original packet' } }] });
  expect(facts(changedHistory).sourceFactsConfirmed).toBeNull();
  expect(facts(state).sourceFactsConfirmed).toBe(true);
});
