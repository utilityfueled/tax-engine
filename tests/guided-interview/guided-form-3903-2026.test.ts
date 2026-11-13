/** Spec: federal/form-3903-2026.yaml. */
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData, buildW2Inputs } from '@/lib/guided-interview-bridge';
import { computeFlowProgress, emptyAdjustmentData, loadGuidedFlowState, saveGuidedFlowState, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { computeGuidedPreviewOutcome } from '@/lib/guided-preview-compute';
import { exportWorkspaceRecovery, importWorkspaceRecovery } from '@/lib/workspace-recovery';
import { ensureWorkspace } from '@/lib/workspace-storage';
import { W2Schema } from '@/models/inputs';
import { completeW2Entry, startCompleteInterview } from './complete-facts';

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

function paidMove(reimbursement = '130.01', codeP = '100.00', omittedTaxableExcess = '30.01') {
  const facts = interview();
  Object.assign(facts.movingExpenses.moves[0], {
    transportationAndStorage: '100', vehicleMethod: 'none', mileage: [], parkingAndTolls: '',
    reimbursementsExcludedFromIncome: reimbursement, omittedTaxableExcess,
  });
  const w2 = { ...completeW2Entry, sourceTaxYear: '2026', box12CodeP: codeP };
  facts.state.segmentation.incomeTypes = ['w2'];
  facts.state.sectionData['income-w2'] = { entries: [w2] };
  return { ...facts, w2 };
}

it('reconciles original Code P without duplicating wages or inferring omitted excess', () => {
  const omitted = paidMove();
  const source = buildTaxInputFromGuidedData(omitted.state);
  expect(source?.w2s).toMatchObject([{ wages: '0', box12CodeP: '100.00', accountHolder: 'primary', taxYear: 2026 }]);
  expect(source?.form3903).toMatchObject({ moves: [{ reimbursementsExcludedFromIncome: '130.01', omittedTaxableExcess: '30.01' }] });

  const alreadyPaid = paidMove('100.00', '100', '0');
  alreadyPaid.w2.wages = '30.01';
  expect(buildTaxInputFromGuidedData(alreadyPaid.state)).toMatchObject({
    w2s: [{ wages: '30.01', box12CodeP: '100' }],
    form3903: { moves: [{ reimbursementsExcludedFromIncome: '100.00', omittedTaxableExcess: '0' }] },
  });
  const [unknown] = buildW2Inputs([completeW2Entry]);
  expect(unknown).not.toHaveProperty('box12CodeP');
  const zero = buildTaxInputFromGuidedData(paidMove('0', '0', '').state);
  expect(zero?.w2s).toMatchObject([{ box12CodeP: '0' }]);
  for (const malformed of ['-1', '1.001', '1e2']) {
    expect(W2Schema.safeParse({ ...unknown, box12CodeP: malformed }).success).toBe(false);
  }
});

it('holds incomplete and conflicting originals without inferring an allocation', () => {
  const cases = [
    (facts: ReturnType<typeof paidMove>) => { facts.w2.box12CodeP = '99.99'; },
    (facts: ReturnType<typeof paidMove>) => { facts.w2.box12CodeP = ''; },
    (facts: ReturnType<typeof paidMove>) => { facts.w2.box12CodeP = '130.01'; },
    (facts: ReturnType<typeof paidMove>) => { facts.w2.sourceTaxYear = '2025'; },
    (facts: ReturnType<typeof paidMove>) => { facts.w2.accountHolder = 'spouse'; },
    (facts: ReturnType<typeof paidMove>) => { facts.w2.wages = ''; },
    (facts: ReturnType<typeof paidMove>) => { Object.assign(facts.movingExpenses.moves[0], { omittedTaxableExcess: '' }); },
    (facts: ReturnType<typeof paidMove>) => { Object.assign(facts.movingExpenses.moves[0], { omittedTaxableExcess: '0' }); },
    (facts: ReturnType<typeof paidMove>) => {
      facts.movingExpenses.moves.push({ ...facts.movingExpenses.moves[0], moveReference: 'second-move', date: '2026-08-01' });
    },
    (facts: ReturnType<typeof paidMove>) => { facts.state.sectionData['income-w2']?.entries.push({ ...facts.w2 }); },
    (facts: ReturnType<typeof paidMove>) => {
      facts.w2.box12CodeP = '235.24';
      Object.assign(facts.movingExpenses.moves[0], {
        transportationAndStorage: '0', vehicleMethod: 'mileage', parkingAndTolls: '0',
        mileage: [{ date: '2026-07-01', miles: '1001' }],
        reimbursementsExcludedFromIncome: '250.00', omittedTaxableExcess: '14.76',
      });
    },
  ];
  for (const edit of cases) {
    const facts = paidMove();
    edit(facts);
    expect(validateSection(facts.state, 'adjustments').fieldErrors?.movingExpenses).toBeTruthy();
    expect(buildTaxInputFromGuidedData(facts.state)).toBeNull();
  }
  const { state } = paidMove();
  for (const adjustments of [undefined, { ...emptyAdjustmentData, movingExpensesNotApplicable: true as const }]) {
    state.sectionData.adjustments = adjustments;
    expect(computeFlowProgress(state).sections.map(section => section.id)).toContain('adjustments');
    expect(validateSection(state, 'adjustments').fieldErrors?.movingExpenses).toBeTruthy();
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
});

it('retains the actual 2026 move across a guided save and restores its exact source amounts', async () => {
  const { state, movingExpenses } = interview();
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, sourceTaxYear: '2026', box12CodeP: '0.00' }] };
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
  expect(restored.sectionData['income-w2']?.entries[0]).toMatchObject({ sourceTaxYear: '2026', box12CodeP: '0.00' });
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
