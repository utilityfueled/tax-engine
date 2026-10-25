// Spec: spec/federal/guided-current-capital-origin.yaml.
import { expect, it } from 'vitest';
import { captureCurrentCapitalRecords, buildCurrentCapitalSources } from '@/lib/guided-current-capital-origin';
import { buildCurrentLossOrigin, updateCurrentLossOrigin } from '@/lib/guided-current-loss-origin';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { emptyAdjustmentData, updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { actualCurrentLossOrigin } from '../fixtures/guided-current-loss-origin';
import { actualGuidedNolSources } from '../fixtures/guided-net-operating-loss';
import { actualGuidedQsbs } from '../fixtures/guided-qsbs';
import { actualGuidedScheduleD } from '../fixtures/guided-schedule-d-sources';
import { captureScheduleDRecords } from '@/lib/guided-schedule-d-sources';
import { completeBusinessSection, completeBrokerageSource, completeTransactionSource, completeDividendSource, completeInterestSource, completeW2Entry, startCompleteInterview } from './complete-facts';

function required<T>(value: T | null | undefined): T { if (value == null) throw new Error('Missing fictional source'); return value; }
function fixture() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages', 'self-employment', 'investments'], lifeEvents: ['current-year-loss'], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '20000' }] };
  state.sectionData['income-self-employment'] = { ...structuredClone(completeBusinessSection), expenses: { ...completeBusinessSection.expenses, otherExpenses: '100000' }, businessFacts: { ...completeBusinessSection.businessFacts, businessName: 'Actual active sole proprietorship' } };
  state.sectionData['income-investments'] = { interestEntries: [{ ...completeInterestSource, interestIncome: '5000' }], dividendEntries: [], brokerageEntries: [{ ...completeBrokerageSource, sourceId: 'Original broker', sourceTaxYear: '2025', transactions: [
    { ...completeTransactionSource, description: 'Actual ordinary gain', dateAcquired: '2025-01-02', dateSold: '2025-06-03', proceeds: '1100.49', costBasis: '1000', holdingPeriod: 'short', specialGainCharacter: 'ordinary' },
    { ...completeTransactionSource, description: 'Actual ordinary loss', dateAcquired: '2024-01-02', dateSold: '2025-06-03', proceeds: '899.50', costBasis: '1000', holdingPeriod: 'long', specialGainCharacter: 'ordinary' },
  ] }] };
  const prior = structuredClone(actualGuidedNolSources); prior.vintages = []; required(prior.alternativeTax).vintages = [];
  state.sectionData.adjustments = { ...emptyAdjustmentData, netOperatingLossSources: prior, currentLossOrigin: structuredClone(actualCurrentLossOrigin) };
  recordCapital(state); return state;
}
function recordCapital(state: ReturnType<typeof startCompleteInterview>) {
  const original = captureCurrentCapitalRecords(state.sectionData['income-investments']);
  required(required(state.sectionData.adjustments).currentLossOrigin).capitalSources = { sourceTaxYear: '2025', sourceReference: 'Actual capital classification packet', sourceFactsConfirmed: true, allCapitalSourcesIncluded: true,
    transactions: original.transactions.map(row => ({ ...row, sourceReference: 'Original investment records', nonbusinessInvestmentConfirmed: true })),
    distributions: original.distributions.map(row => ({ ...row, sourceTaxYear: '2025', sourceReference: 'Original fund capital boxes', nonbusinessInvestmentConfirmed: true })),
    priorCapitalLosses: { sourceTaxYear: '2024', sourceReference: 'Actual filed capital carry worksheet', sourceFactsConfirmed: true, allCarryoversIncluded: true, sameReturnMembershipConfirmed: true, nonbusinessInvestmentConfirmed: true, shortTermCapitalLoss: '0', longTermCapitalLoss: '0' },
    alternativeTax: { sourceReference: 'Independent AMT capital worksheet', sourceFactsConfirmed: true, currentBasisAndAdjustmentsSameConfirmed: true, priorCapitalLossesSameConfirmed: true } };
}
const capital = (state: ReturnType<typeof fixture>) => required(required(required(state.sectionData.adjustments).currentLossOrigin).capitalSources);
const build = (state: ReturnType<typeof fixture>) => buildCurrentCapitalSources(capital(state), state);
it('binds actual capital records to independent current loss origins', () => {
  const state = fixture(), original = JSON.stringify(state), input = required(buildTaxInputFromGuidedData(state));
  expect(input.form172?.capitalSources?.transactions?.[1].transaction?.proceeds).toBe('899.50');
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.capitalGainLoss.toFixed()).toBe('-0.01'); expect(result.agi.toFixed()).toBe('-75000.01');
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('80000'); expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('75000'); expect(result.form172?.section1411OriginalLoss.toFixed()).toBe('0');
  expect(computeGuidedPreview(state)?.agi).toBe('-75000.01'); expect(JSON.stringify(state)).toBe(original);
  const copied = captureCurrentCapitalRecords(state.sectionData['income-investments']); expect(copied.transactions[0].nonbusinessInvestmentConfirmed).toBeUndefined();
  expect(buildCurrentLossOrigin(required(state.sectionData.adjustments).currentLossOrigin, state)).not.toHaveProperty('netOperatingLoss');
});
it('reconciles signed capital carry without inferring unknown histories', () => {
  const state = fixture(), sources = required(state.sectionData['income-investments']); sources.brokerageEntries = [];
  sources.dividendEntries = [{ ...completeDividendSource, ordinaryDividends: '0', qualifiedDividends: '0', capitalGainDistributions: '500' }]; recordCapital(state);
  Object.assign(required(capital(state).priorCapitalLosses), { shortTermCapitalLoss: '-4000', longTermCapitalLoss: '-3000' });
  const input = required(buildTaxInputFromGuidedData(state)); expect(input.priorYear).toMatchObject({ shortTermCapitalLoss: '-4000', longTermCapitalLoss: '-3000' });
  const result = calculateFederalTax(TaxYearInputSchema.parse(input)); expect(result.scheduleD.netCapitalGainLoss.toFixed()).toBe('-6500'); expect(result.capitalGainLoss.toFixed()).toBe('-3000'); expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('80000');
  for (const patch of [{ shortTermCapitalLoss: '' }, { shortTermCapitalLoss: '1' }, { longTermCapitalLoss: '-0.01' }, { sameReturnMembershipConfirmed: false }, { sourceFactsConfirmed: null }]) {
    const next = structuredClone(state); Object.assign(required(capital(next).priorCapitalLosses), patch); expect(() => build(next)).toThrow();
  }
  const missing = fixture(); required(required(missing.sectionData.adjustments).currentLossOrigin).capitalSources = undefined; expect(buildTaxInputFromGuidedData(missing)).toBeNull();
});
it('retains actual QSBS context and explicit unsupported capital methods', () => {
  const state = fixture(), investments = required(state.sectionData['income-investments']);
  investments.brokerageEntries = [{ ...completeBrokerageSource, broker: 'Actual broker', sourceId: 'Original broker statement', sourceTaxYear: '2025', transactions: [{ ...completeTransactionSource, description: 'Synthetic eligible corporation', dateAcquired: '2008-01-02', dateSold: '2025-06-30', proceeds: '1100.35', costBasis: '100.10', specialGainCharacter: 'qsbs' }] }];
  investments.section1202Sources = structuredClone(actualGuidedQsbs); investments.scheduleDSources = { ...structuredClone(actualGuidedScheduleD), ...captureScheduleDRecords(investments), priorShortTermCapitalLoss: '0', priorLongTermCapitalLoss: '0' }; recordCapital(state);
  const result = calculateFederalTax(TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state))));
  expect(result.capitalGainLoss.toFixed()).toBe('500.125'); expect(result.form172?.regular.sourcePartI[17].toFixed()).toBe('500.125'); expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('80000'); expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('74000');
  const missing = structuredClone(state); required(missing.sectionData['income-investments']).section1202Sources = undefined; expect(buildTaxInputFromGuidedData(missing)).toBeNull();
  const negative = structuredClone(state); required(capital(negative).priorCapitalLosses).shortTermCapitalLoss = '-700'; required(required(negative.sectionData['income-investments']).scheduleDSources).priorShortTermCapitalLoss = '-700'; expect(() => build(negative)).toThrow(/negative|1202/i);
  const digital = fixture(); required(digital.sectionData['income-investments']).brokerageEntries[0].transactions[0].digitalAsset = true; recordCapital(digital); expect(() => build(digital)).toThrow(/digital|method/i);
});
it('rejects stale original records and revokes only substantive source confirmations', () => {
  const state = fixture();
  for (const mutate of [
    (next: typeof state) => { required(next.sectionData['income-investments']).brokerageEntries[0].transactions[0].proceeds = '1100.50'; },
    (next: typeof state) => { required(capital(next).transactions)[0].accountHolder = 'spouse'; },
    (next: typeof state) => { required(capital(next).transactions).pop(); },
    (next: typeof state) => { required(capital(next).alternativeTax).priorCapitalLossesSameConfirmed = null; },
    (next: typeof state) => { required(capital(next).transactions)[0].nonbusinessInvestmentConfirmed = false; },
  ]) { const next = structuredClone(state); mutate(next); const before = JSON.stringify(next); expect(() => build(next)).toThrow(); expect(JSON.stringify(next)).toBe(before); }
  const changed = updateCurrentLossOrigin(required(required(state.sectionData.adjustments).currentLossOrigin), { sourceReference: 'Changed actual packet' });
  expect(changed.capitalSources?.sourceFactsConfirmed).toBeNull(); expect(changed.capitalSources?.priorCapitalLosses?.sourceFactsConfirmed).toBeNull(); expect(changed.capitalSources?.alternativeTax?.sourceFactsConfirmed).toBeNull();
  const confirmed = updateCurrentLossOrigin(changed, { capitalSources: { ...changed.capitalSources, sourceFactsConfirmed: true, priorCapitalLosses: { ...changed.capitalSources?.priorCapitalLosses, sourceFactsConfirmed: true }, alternativeTax: { ...changed.capitalSources?.alternativeTax, sourceFactsConfirmed: true } } });
  expect(confirmed.capitalSources?.sourceFactsConfirmed).toBe(true); expect(confirmed.capitalSources?.priorCapitalLosses?.sourceFactsConfirmed).toBe(true);
  const edit = updateSectionData(state, 'income-investments', { ...required(state.sectionData['income-investments']), interestEntries: [{ ...completeInterestSource, interestIncome: '5000.01' }] });
  expect(capital(edit).sourceFactsConfirmed).toBeNull();
});
