// Spec: spec/federal/guided-qsbs-sources.yaml.
import { expect, it } from 'vitest';
import { buildGuidedQsbsSources, captureQsbsLots } from '@/lib/guided-qsbs-sources';
import { buildGuidedScheduleDInputs, captureScheduleDRecords } from '@/lib/guided-schedule-d-sources';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { completeBrokerageSource, completeDividendSource, completeTransactionSource, startCompleteInterview } from './complete-facts';
import { actualGuidedQsbs } from '../fixtures/guided-qsbs';
import { actualGuidedScheduleD } from '../fixtures/guided-schedule-d-sources';

function required<T>(value: T | null | undefined): T { if (value == null) throw new Error('Missing explicit synthetic source'); return value; }
const investments = (state: GuidedFlowState) => required(state.sectionData['income-investments']);
const facts = (state: GuidedFlowState) => required(investments(state).section1202Sources);
const lot = (state: GuidedFlowState) => required(facts(state).lots?.[0]);
const issuer = (state: GuidedFlowState) => required(facts(state).issuers?.[0]);
function fixture(kind: 'broker' | 'fund' = 'broker') {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null });
  state.sectionData['income-investments'] = { interestEntries: [], dividendEntries: [], brokerageEntries: [], section1202Sources: structuredClone(actualGuidedQsbs) };
  if (kind === 'broker') investments(state).brokerageEntries = [{ ...completeBrokerageSource, broker: 'Actual broker', sourceId: 'Original broker statement', sourceTaxYear: '2025', transactions: [{
    ...completeTransactionSource, description: 'Synthetic eligible corporation', dateAcquired: '2008-01-02', dateSold: '2025-06-30',
    proceeds: '1100.35', costBasis: '100.10', specialGainCharacter: 'qsbs',
  }] }];
  else {
    investments(state).dividendEntries = [{ ...completeDividendSource, payer: 'Actual fund', capitalGainDistributions: '1500.50', section1202Gain: '1000.25' }];
    Object.assign(lot(state), { sourceId: 'form1099Div:0', payerName: 'Actual fund', proceeds: undefined, costBasis: undefined, adjustments: undefined, washSale: undefined, washSaleDisallowed: undefined,
      passThrough: { ownerInterestAcquiredDate: '2007-01-02', heldContinuouslyThroughSale: true, unchangedOwnershipProportionConfirmed: true,
        ownershipPercentage: '1', entityRecognizedGain: '100025', entityBasisIgnoringPostIssueAdditions: '10010', fundCapitalGainDistributions: '1500.50', fundSection1202Gain: '1000.25' } });
  }
  const records = captureScheduleDRecords(investments(state));
  investments(state).scheduleDSources = { ...structuredClone(actualGuidedScheduleD), ...records, priorShortTermCapitalLoss: '0',
    reportedGains: records.reportedGains.map(row => ({ ...row, sourceTaxYear: '2025', sourceReference: 'Original fund source' })) };
  return state;
}
const build = (state: GuidedFlowState) => buildGuidedQsbsSources(investments(state), state.taxYear, state.segmentation.filingStatus, state.sectionData['personal-info']);
it('routes actual broker and fund issuer sources without changing original income', () => {
  for (const kind of ['broker', 'fund'] as const) {
    const state = fixture(kind), original = JSON.stringify(state);
    expect(validateSection(state, 'income-investments').status).toBe('complete');
    const input = required(buildTaxInputFromGuidedData(state)), result = calculateFederalTax(TaxYearInputSchema.parse(input));
    expect(input.section1202Sources?.lots[0]?.recognizedGain).toBe('1000.25');
    expect(result.capitalGainLoss.toFixed()).toBe(kind === 'broker' ? '500.125' : '1000.375');
    expect(result.scheduleD.section1202Exclusion.toFixed()).toBe('500.125');
    expect(result.form6251?.lines.find(row => row.line === '2h')?.value.toFixed()).toBe('35');
    if (kind === 'fund') expect(input.form1099Div[0]?.totalCapitalGainDistributions).toBe('1500.50');
    expect(JSON.stringify(state)).toBe(original);
    delete investments(state).section1202Sources; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
});
it('preserves unknown source facts and rejects stale incomplete or duplicated records', () => {
  const state = fixture(), snapshots = captureQsbsLots(investments(state));
  expect(snapshots[0]).toMatchObject({ sourceId: 'form1099B:0:transaction:0', proceeds: '1100.35', effectiveAcquiredDate: '2008-01-02' });
  expect(snapshots[0]?.qualification).toBeUndefined(); expect(snapshots[0]?.originalIssueDate).toBeUndefined(); expect(snapshots[0]?.basisIgnoringPostIssueAdditions).toBeUndefined();
  const forms = investments(state).brokerageEntries;
  const trade = required(required(forms[0]).transactions[0]); trade.proceeds = '9007199254740993.03'; trade.costBasis = '9007199254740992.02';
  Object.assign(lot(state), { proceeds: trade.proceeds, costBasis: trade.costBasis, recognizedGain: '1.01', basisIgnoringPostIssueAdditions: trade.costBasis });
  required(investments(state).scheduleDSources).longTermAssets = captureScheduleDRecords(investments(state)).longTermAssets;
  expect(build(state)?.lots[0]?.proceeds).toBe('9007199254740993.03');
  for (const mutate of [
    (next: GuidedFlowState) => { lot(next).recognizedGain = '1.02'; },
    (next: GuidedFlowState) => { lot(next).sourceId = 'form1099B:00:transaction:0'; },
    (next: GuidedFlowState) => { required(lot(next).qualification).redemptionRestrictionsSatisfied = undefined; },
    (next: GuidedFlowState) => { issuer(next).priorReturns = undefined; },
    (next: GuidedFlowState) => { issuer(next).priorEligibleGainUsed = ''; },
    (next: GuidedFlowState) => { lot(next).empowermentZoneGainThrough2018 = 'NaN'; },
    (next: GuidedFlowState) => { required(facts(next).lots).push({ ...lot(next), lotId: 'duplicate-original' }); },
    (next: GuidedFlowState) => { required(investments(next).brokerageEntries[0]).sourceTaxYear = ''; },
    (next: GuidedFlowState) => { required(investments(next).scheduleDSources).sourceFactsConfirmed = null; },
  ]) { const next = structuredClone(state); mutate(next); const before = JSON.stringify(next); expect(() => build(next)).toThrow(); expect(JSON.stringify(next)).toBe(before); }
  const prefixed = fixture(); investments(prefixed).brokerageEntries.unshift({ broker: '', transactions: [] });
  expect(build(prefixed)?.lots[0]?.sourceId).toBe('form1099B:0:transaction:0');
  expect(buildGuidedScheduleDInputs(investments(prefixed), 2025, 'single', prefixed.sectionData['personal-info']).scheduleDSpecialGainSources?.longTermAssets[0]?.sourceId).toBe('form1099B:0:transaction:0');
});
it('binds actual household history qualification and original ownership methods', () => {
  const state = fixture();
  issuer(state).priorEligibleGainUsed = '1000'; issuer(state).priorReturns = [{ sourceTaxYear: '2020', sourceReference: 'Original filed prior issuer source', filingStatus: 'single', primary: { ...required(facts(state).primary) }, eligibleGainUsed: '1000' }];
  expect(build(state)?.issuers[0]?.priorEligibleGainUsed).toBe('1000');
  required(lot(state).qualification).domesticCCorporationAtIssue = false;
  expect(calculateFederalTax(TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state)))).capitalGainLoss.toFixed()).toBe('1000.25');
  for (const mutate of [
    (next: GuidedFlowState) => { required(facts(next).primary).ssnLast4 = '9999'; },
    (next: GuidedFlowState) => { issuer(next).membershipUnchangedConfirmed = false; },
    (next: GuidedFlowState) => { required(issuer(next).priorReturns?.[0]).eligibleGainUsed = '999'; },
    (next: GuidedFlowState) => { lot(next).acquisitionMethod = 'gift'; },
    (next: GuidedFlowState) => { required(lot(next).qualification).offsettingPositionPresent = true; },
    (next: GuidedFlowState) => { facts(next).sourceTaxYear = '2026'; },
    (next: GuidedFlowState) => { lot(next).accountHolder = 'spouse'; },
  ]) { const next = structuredClone(state); mutate(next); expect(() => build(next)).toThrow(); }
  const fund = fixture('fund'); required(lot(fund).passThrough).unchangedOwnershipProportionConfirmed = false;
  expect(() => build(fund)).toThrow(/ownership/i);
});
it('invalidates changed originals while preserving confirmation-only edits', () => {
  const state = fixture(), changed = updateSectionData(state, 'personal-info', { ...state.sectionData['personal-info'], lastName: 'Changed' });
  expect(changed.sectionData['income-investments']?.section1202Sources?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData['income-investments']?.section1202Sources?.issuers?.[0]?.priorEligibleGainUsed).toBe('0');
  const partial = fixture(); facts(partial).sourceFactsConfirmed = null;
  const confirmed = updateSectionData(partial, 'income-investments', { ...investments(partial), section1202Sources: { ...facts(partial), sourceFactsConfirmed: true } });
  expect(confirmed.sectionData['income-investments']?.scheduleDSources?.sourceFactsConfirmed).toBe(true);
  expect(confirmed.sectionData['income-investments']?.section1202Sources?.sourceFactsConfirmed).toBe(true);
  expect('exclusion' in required(build(confirmed))).toBe(false);
});
