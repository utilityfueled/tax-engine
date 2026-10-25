// Spec: spec/federal/guided-digital-asset-sources.yaml.
import { expect, it } from 'vitest';
import { buildDigitalAssetInputs, digitalAssetFactErrors, updateDigitalAssetEntry, updateDigitalAssetTransaction, type DigitalAssetEntryData } from '@/lib/guided-digital-asset-facts';
import { buildTaxInputFromGuidedData, buildGuidedSyntheticDocuments, buildGuidedFactAnswers } from '@/lib/guided-interview-bridge';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { initialFlowState, updateSectionData, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal.js';
import { actualGuidedDigitalAsset } from '../fixtures/guided-digital-asset-sources';
import { actualGuidedScheduleD } from '../fixtures/guided-schedule-d-sources';
import { captureScheduleDRecords } from '@/lib/guided-schedule-d-sources';
import { calculatePAReturn } from '@/engine/state/pa-orchestrator.js';
import { completePersonalInfo, completeW2Entry, completeBrokerageSource } from './complete-facts';

function stateFor(entry = actualGuidedDigitalAsset()): GuidedFlowState {
  return { ...initialFlowState, phase: 'interview', taxYear: 2025,
    segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages', 'investments'], lifeEvents: [], stateCode: null },
    sectionData: { 'personal-info': completePersonalInfo, 'income-w2': { entries: [{ ...completeW2Entry, wages: '50000' }] },
      'income-investments': { interestEntries: [], dividendEntries: [], brokerageEntries: [], digitalAssetEntries: [entry] } } };
}
it('binds original DA facts and exact taxpayer basis to the canonical return', () => {
  const entry = actualGuidedDigitalAsset();
  const forms = buildDigitalAssetInputs([entry], 'single', 2025, completePersonalInfo);
  expect(forms[0]).toMatchObject({ federalWithheld: '0.10', sourceFactsComplete: true, transactions: [{ reportedCostBasis: null, costBasis: '90.24', reportedDateAcquired: null, dateAcquired: '2025-01-15' }] });
  const state = stateFor(entry), input = buildTaxInputFromGuidedData(state); expect(input).not.toBeNull();
  if (!input) throw new Error('Missing actual DA input');
  expect(input.form1099B).toEqual([]); expect(input.form1099DA[0].federalWithheld).toBe('0.10');
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.capitalGainLoss.toFixed()).toBe('10.25'); expect(result.totalWithholding.toFixed()).toBe('0.1');
  expect(computeGuidedPreview(state)?.totalIncome).toBe('50010.25');
  expect(buildGuidedSyntheticDocuments(state).find(row => row.kind === '1099-da')?.coverage).toBe('supported');
  const mixed = stateFor(entry); const investments = mixed.sectionData['income-investments']; if (!investments) throw new Error('Missing synthetic investment sources');
  investments.brokerageEntries = [{ ...completeBrokerageSource, transactions: [{ ...completeBrokerageSource.transactions[0], proceeds: '30.00', digitalAsset: true }] }];
  expect(buildTaxInputFromGuidedData(mixed)?.form1099B[0].transactions[0].sourceDocumentType).toBe('1099-b');
  const answers = buildGuidedFactAnswers(mixed).filter(row => row.factId === 'broker-proceeds');
  expect(answers).toHaveLength(1); expect(answers[0].answerText).toContain('130');
  entry.transactions![0].costBasis = '0'; expect(buildDigitalAssetInputs([entry], 'single', 2025, completePersonalInfo)[0].transactions[0].costBasis).toBe('0');
});
it('preserves missing and conflicting DA sources instead of fabricating facts', () => {
  const original = actualGuidedDigitalAsset();
  for (const patch of [{ federalWithheld: '' }, { sourceFactsConfirmed: null }, { accountHolder: '' }, { taxYear: '' }, { taxYear: '2026' }, { allTransactionsIncluded: false }]) {
    const entry = { ...original, ...patch } as DigitalAssetEntryData;
    expect(Object.keys(digitalAssetFactErrors([entry], 'single', 2025, completePersonalInfo)).length).toBeGreaterThan(0);
    expect(buildTaxInputFromGuidedData(stateFor(entry))).toBeNull();
  }
  for (const patch of [{ basisReportedToIRS: null }, { reportedCostBasisBlank: null }, { costBasis: '' }, { nftOrCollectible: true }, { ordinaryIncome: true }, { reportedCostBasis: '90.24' }, { basisFactsConfirmed: false }]) {
    const entry = structuredClone(original); Object.assign(entry.transactions![0], patch);
    expect(() => buildDigitalAssetInputs([entry], 'single', 2025, completePersonalInfo)).toThrow();
    expect(entry.transactions![0]).toMatchObject(patch);
  }
  expect(() => buildDigitalAssetInputs([{ ...original, accountHolder: 'spouse' }], 'mfj', 2025, { ...completePersonalInfo, spouse: undefined })).toThrow();
  expect(() => buildDigitalAssetInputs([original], 'single', 2025, completePersonalInfo, [{ sourceId: original.sourceId }])).toThrow(/duplicate|collision/i);
});
it('reconfirms edited DA sources without a metadata confirmation cycle', () => {
  const entry = actualGuidedDigitalAsset(), state = stateFor(entry);
  const updated = updateDigitalAssetTransaction(entry.transactions![0], { costBasis: '90.25' });
  expect(updated.basisFactsConfirmed).toBeNull();
  const next = updateDigitalAssetEntry(entry, { transactions: [updated] }); expect(next.sourceFactsConfirmed).toBeNull();
  const basis = updateDigitalAssetTransaction(updated, { basisFactsConfirmed: true });
  const confirmed = updateDigitalAssetEntry(updateDigitalAssetEntry(next, { transactions: [basis] }), { sourceFactsConfirmed: true });
  expect(confirmed).toMatchObject({ sourceFactsConfirmed: true, transactions: [{ costBasis: '90.25', basisFactsConfirmed: true, reportedCostBasisBlank: true }] });
  const investment = { ...state.sectionData['income-investments']!, digitalAssetEntries: [confirmed] };
  expect(updateSectionData(state, 'income-investments', investment).sectionData['income-investments']?.digitalAssetEntries?.[0].sourceFactsConfirmed).toBe(true);
  const household = updateSectionData(state, 'personal-info', { ...completePersonalInfo, lastName: 'Changed' });
  expect(household.sectionData['income-investments']?.digitalAssetEntries?.[0].sourceFactsConfirmed).toBeNull();
});
it('requires separate actual Pennsylvania digital basis without changing federal facts', () => {
  const state = stateFor(); state.segmentation.stateCode = 'PA';
  const investments = state.sectionData['income-investments']; if (!investments?.digitalAssetEntries?.[0]?.transactions?.[0]) throw new Error('Missing synthetic sources');
  const row = investments.digitalAssetEntries[0].transactions[0];
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  Object.assign(row, { paCostBasis: '80.24', paBasisSourceReference: 'Actual Pennsylvania acquisition ledger', paBasisFactsConfirmed: true, paTransactionForProfitConfirmed: true });
  const built = buildTaxInputFromGuidedData(state); if (!built) throw new Error('Missing complete actual PA source');
  expect(built.form1099DA[0].transactions[0]).toMatchObject({ costBasis: '90.24', paCostBasis: '80.24' });
  const input = TaxYearInputSchema.parse(built);
  expect(calculateFederalTax(input).capitalGainLoss.toFixed()).toBe('10.25');
  expect(calculatePAReturn(input).mappedIncome.netGainOrLoss.toFixed()).toBe('20');
  for (const patch of [{ paCostBasis: '' }, { paBasisFactsConfirmed: null }, { paTransactionForProfitConfirmed: false }]) {
    const next = structuredClone(state); Object.assign(next.sectionData['income-investments']!.digitalAssetEntries![0].transactions![0], patch);
    expect(buildTaxInputFromGuidedData(next)).toBeNull();
  }
  const changed = updateDigitalAssetTransaction(row, { paCostBasis: '80.25' }); expect(changed.paBasisFactsConfirmed).toBeNull();
  const confirmed = updateDigitalAssetTransaction(changed, { basisFactsConfirmed: true, paBasisFactsConfirmed: true });
  expect(updateDigitalAssetEntry({ ...investments.digitalAssetEntries[0], sourceFactsConfirmed: true }, { transactions: [confirmed] }).sourceFactsConfirmed).toBeNull();
});
it('captures original long-term DA identities beside other capital sources', () => {
  const state = stateFor(), investments = state.sectionData['income-investments']; if (!investments?.digitalAssetEntries?.[0]?.transactions?.[0]) throw new Error('Missing synthetic sources');
  const da = investments.digitalAssetEntries[0], row = da.transactions![0]; row.holdingPeriod = 'long'; row.dateAcquired = '2020-01-15';
  investments.brokerageEntries = [{ ...completeBrokerageSource, sourceTaxYear: '2025', sourceId: 'Original B collectible', transactions: [{
    ...completeBrokerageSource.transactions[0], description: 'Actual gold coin', dateAcquired: '2020-01-01', dateSold: '2025-01-01',
    proceeds: '200', costBasis: '100', holdingPeriod: 'long', digitalAsset: false, specialGainCharacter: 'collectible',
  }] }];
  const capture = captureScheduleDRecords(investments);
  expect(capture.longTermAssets).toHaveLength(2);
  expect(capture.longTermAssets[1]).toMatchObject({ sourceId: 'form1099DA:0:transaction:0', sourceReference: JSON.stringify([da.sourceId, row.sourceId]), proceeds: '100.49', costBasis: '90.24', character: 'ordinary' });
  investments.scheduleDSources = { ...actualGuidedScheduleD, ...capture, priorShortTermCapitalLoss: '0', priorLongTermCapitalLoss: '0' };
  const built = buildTaxInputFromGuidedData(state); if (!built) throw new Error('Missing mixed capital sources');
  const result = calculateFederalTax(TaxYearInputSchema.parse(built));
  expect(result.scheduleD.netLongTerm.toFixed()).toBe('110.25');
  expect(result.scheduleD.lines.find(line => line.form === 'Sched D' && line.line === '18')?.value.toFixed()).toBe('100');
  for (const patch of [{ sourceId: 'Changed disposition' }, { costBasis: '91.24', proceeds: '101.49' }]) {
    const next = structuredClone(state); Object.assign(next.sectionData['income-investments']!.digitalAssetEntries![0].transactions![0], patch);
    expect(buildTaxInputFromGuidedData(next)).toBeNull();
  }
});
it('includes original digital withholding once in generic and dedicated state previews', () => {
  for (const stateCode of ['MI', 'PA', 'OH']) {
    const state = stateFor(); state.segmentation.stateCode = stateCode;
    state.sectionData['personal-info'] = { ...completePersonalInfo, state: stateCode };
    state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '50000', stateTaxReporting: 'single', state: stateCode, stateWages: '50000', stateWithheld: '0.40' }] };
    const sources = ['0.10', '0.20', '0.30'].map((stateWithheld, index) => {
      const entry = actualGuidedDigitalAsset();
      Object.assign(entry, { sourceId: `Actual digital statement ${index}`, accountReference: `Actual account ${index}`, stateTaxReporting: 'single', state: index === 2 ? 'VA' : stateCode, stateWithheld });
      for (const row of entry.transactions ?? []) Object.assign(row, { sourceId: `Actual disposition ${index}`, paCostBasis: '80.24', paBasisSourceReference: 'Actual Pennsylvania acquisition records', paBasisFactsConfirmed: true, paTransactionForProfitConfirmed: true });
      return entry;
    });
    state.sectionData['income-investments'] = { interestEntries: [], dividendEntries: [], brokerageEntries: [], digitalAssetEntries: sources };
    const original = structuredClone(state);
    const input = buildTaxInputFromGuidedData(state); expect(input).not.toBeNull();
    expect(computeGuidedPreview(state)?.state?.stateWithholding, stateCode).toBe('0.7');
    expect(computeGuidedPreview(state)?.totalIncome, stateCode).toBe('50030.75');
    expect(state).toEqual(original);
  }
});
