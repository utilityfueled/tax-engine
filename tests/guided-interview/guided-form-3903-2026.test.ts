/** Spec: federal/form-3903-2026.yaml. */
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { computeFlowProgress, emptyAdjustmentData, loadGuidedFlowState, saveGuidedFlowState, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { computeGuidedPreviewOutcome } from '@/lib/guided-preview-compute';
import { exportWorkspaceRecovery, importWorkspaceRecovery } from '@/lib/workspace-recovery';
import { ensureWorkspace } from '@/lib/workspace-storage';
import { startCompleteInterview } from './complete-facts';

function actualMove() {
  return {
    moveReference: 'synthetic-2026-move', accountHolder: 'primary' as const, date: '2026-07-02',
    domesticSameYearConfirmed: true, eligibilityKind: 'military' as const, activeDuty: true,
    permanentChangeOfStationOrdered: true, employmentStatus: '' as const, qualifyingElement: null,
    nonMilitary: null, assignmentRequiresRelocation: null, transportationAndStorage: '1,005.75',
    reimbursementsExcludedFromIncome: '0', lineAmountsConfirmed: true,
    transportationAndLodging: '0', vehicleMethod: 'mileage' as const, gasAndOil: '',
    parkingAndTolls: '4.20', mileage: [{ date: '2026-06-30', miles: '12.750' }, { date: '2026-07-01', miles: '4.125' }],
  };
}

function interview() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: [], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  const movingExpenses = { sourceTaxYear: 2026, moves: [actualMove()] };
  state.sectionData.adjustments = { ...emptyAdjustmentData, ...{ movingExpenses } };
  return { state, movingExpenses };
}

it('retains the actual 2026 move across a guided save and restores its exact source amounts', async () => {
  const { state, movingExpenses } = interview();
  const saved = new Map<string, string>();
  const storage: Storage = {
    get length() { return saved.size; }, key: index => [...saved.keys()][index] ?? null,
    clear: () => saved.clear(), getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => { saved.set(key, value); }, removeItem: key => { saved.delete(key); },
  };
  const workspaceId = 'fictional-moving-record';
  const passphrase = 'synthetic recovery passphrase';
  ensureWorkspace(storage, workspaceId);
  saveGuidedFlowState(storage, workspaceId, state);
  const archive = await exportWorkspaceRecovery(storage, workspaceId, passphrase);
  expect(await archive.text()).not.toContain('synthetic-2026-move');
  const result = await importWorkspaceRecovery(storage, archive, passphrase);
  const restored = loadGuidedFlowState(storage, result.workspaceId);
  if (!restored) throw new Error('Missing actual saved synthetic draft');
  expect(restored.sectionData.adjustments).toMatchObject({ movingExpenses });
  expect(computeFlowProgress(restored).sections.map(section => section.id)).toContain('adjustments');
  expect(validateSection(restored, 'adjustments').status).toBe('complete');
  expect(buildTaxInputFromGuidedData(restored)?.form3903).toEqual({ taxYear: 2026, moves: [{
    moveReference: 'synthetic-2026-move', accountHolder: 'primary', date: '2026-07-02', domesticSameYearConfirmed: true,
    eligibility: { kind: 'military', activeDuty: true, permanentChangeOfStationOrdered: true },
    transportationAndStorage: '1005.75', reimbursementsExcludedFromIncome: '0', lineAmountsConfirmed: true,
    travel: { transportationAndLodging: '0', vehicle: { method: 'mileage', parkingAndTolls: '4.20', entries: actualMove().mileage } },
  }] });
  expect(computeGuidedPreviewOutcome(restored)).toEqual({ metrics: null, blockedBy: expect.stringMatching(/2026/u) });
});

it('requires actual moving amounts, current year, distinct source and owner', () => {
  const cases = [
    (facts: ReturnType<typeof interview>) => { facts.movingExpenses.moves[0].reimbursementsExcludedFromIncome = ''; },
    (facts: ReturnType<typeof interview>) => { facts.movingExpenses.moves[0].mileage.push({ date: '2026-06-30', miles: '0' }); },
    (facts: ReturnType<typeof interview>) => { Object.assign(facts.movingExpenses.moves[0], { accountHolder: 'spouse' }); },
    (facts: ReturnType<typeof interview>) => { facts.state.taxYear = 2025; },
  ];
  for (const edit of cases) {
    const facts = interview();
    edit(facts);
    expect(validateSection(facts.state, 'adjustments').fieldErrors?.movingExpenses).toBeTruthy();
    expect(buildTaxInputFromGuidedData(facts.state)).toBeNull();
  }
});

it('revokes moving confirmation when the entered amount, identity or W-2 source changes', () => {
  const { state, movingExpenses } = interview();
  const changed = { ...movingExpenses, moves: [{ ...actualMove(), reimbursementsExcludedFromIncome: '0.01' }] };
  const next = updateSectionData(state, 'adjustments', { ...emptyAdjustmentData, movingExpenses: changed });
  expect(next.sectionData.adjustments).toMatchObject({ movingExpenses: { moves: [{ reimbursementsExcludedFromIncome: '0.01', lineAmountsConfirmed: null }] } });
  const identity = updateSectionData(state, 'personal-info', { ...state.sectionData['personal-info'], lastName: 'Changed owner' });
  expect(identity.sectionData.adjustments).toMatchObject({ movingExpenses: { moves: [{ lineAmountsConfirmed: null }] } });
  const wages = updateSectionData(state, 'income-w2', { entries: [{ employerName: 'Changed original' }] });
  expect(wages.sectionData.adjustments).toMatchObject({ movingExpenses: { moves: [{ lineAmountsConfirmed: null }] } });
});

it('requires either actual records or explicit removal without shifting the interview', () => {
  const { state } = interview();
  state.segmentation.lifeEvents = ['moving-expenses'];
  state.phase = 'interview';
  const index = computeFlowProgress(state).sections.findIndex(section => section.id === 'adjustments');
  expect(index).toBeGreaterThan(0);
  state.currentSectionIndex = index;
  const missing = updateSectionData(state, 'adjustments', { ...emptyAdjustmentData });
  expect(validateSection(missing, 'adjustments').fieldErrors?.movingExpenses).toBeTruthy();
  const removed = updateSectionData(state, 'adjustments', { ...emptyAdjustmentData, movingExpensesNotApplicable: true });
  expect(computeFlowProgress(removed).currentSection?.id).toBe('adjustments');
  expect(validateSection(removed, 'adjustments').status).toBe('complete');
  expect(buildTaxInputFromGuidedData(removed)).not.toBeNull();
  expect(buildTaxInputFromGuidedData(removed)?.form3903).toBeUndefined();
  const conflicting = updateSectionData(state, 'adjustments', {
    ...emptyAdjustmentData, ...state.sectionData.adjustments, movingExpensesNotApplicable: true,
  });
  expect(validateSection(conflicting, 'adjustments').fieldErrors?.movingExpenses).toBeTruthy();
});
