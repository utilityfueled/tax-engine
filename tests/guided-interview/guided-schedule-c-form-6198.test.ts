// Spec: spec/federal/2026/form-6198-schedule-c-guided.yaml.
import { expect, it } from 'vitest';
import { calculateScheduleC } from '@/engine/schedules/schedule-c.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { computeGuidedPreviewOutcome } from '@/lib/guided-preview-compute';
import { loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear, startInterview, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { exportWorkspaceRecovery, importWorkspaceRecovery } from '@/lib/workspace-recovery';
import { ensureWorkspace } from '@/lib/workspace-storage';
import { ordinaryExpenseSources, scheduleCSourceFacts } from '../fixtures/schedule-c-source-facts';
import { completeBusinessSection, completePersonalInfo } from './complete-facts';

const actualPartII = {
  taxYear: '2026', primaryOwnerName: 'Jordan Example', primaryOwnerTaxpayerIdLast4: '3333',
  activityDescription: 'Independent design services', originalScheduleCReference: 'Independent completed Schedule C workpaper',
  continuingDomesticSoleProprietorshipConfirmed: true, oneOrdinaryScheduleCLossOnlyConfirmed: true,
  noPriorAtRiskLossOrRecaptureConfirmed: true, sourceFactsConfirmed: true, currentOrdinaryLoss: '-6000.57',
  openingBasisReference: 'Private opening asset basis ledger', openingAdjustedAssetBasisBeforeLiabilities: '4,000.25',
  increasesReference: 'Private increases ledger', increases: '0.00',
  decreasesReference: 'Private decreases ledger', decreases: '500.20',
};

function interview() {
  const state = startInterview({ filingStatus: 'single', incomeTypes: ['self-employment'], lifeEvents: [], stateCode: null }, 2026);
  state.sectionData['personal-info'] = structuredClone(completePersonalInfo);
  const business = {
    ...structuredClone(completeBusinessSection), manualGrossReceipts: '1000',
    businessFacts: {
      ...completeBusinessSection.businessFacts, allInvestmentAtRisk: false,
      scheduleCSourceFacts: {
        ...structuredClone(scheduleCSourceFacts), sourceTaxYear: 2026,
        sourceReference: actualPartII.originalScheduleCReference, ownerName: 'Jordan Example',
        businessNameStatus: 'blank_original' as const, businessName: undefined,
        businessEINStatus: 'not_issued' as const, businessEIN: undefined, interest: undefined,
        ordinaryExpenses: { ...structuredClone(ordinaryExpenseSources), remainingOtherExpenses: '0', rows: [
          { category: 'bankCharges' as const, amount: '7000.57', sourceReference: 'Independent actual bank ledger', sourceFactsConfirmed: true },
        ] },
      },
      form6198PartII2026: { ...actualPartII },
    },
  };
  state.sectionData['income-self-employment'] = business;
  return { state, business };
}

it('uses the independent business source and actual Form 6198 loss in the normal guided bridge', () => {
  const { state } = interview();
  expect(validateSection(state, 'income-self-employment').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.scheduleC?.sourceFacts?.sourceReference).toBe(actualPartII.originalScheduleCReference);
  expect(input.scheduleC?.form6198PartII2026).toMatchObject({
    taxYear: 2026, increases: '0.00', openingAdjustedAssetBasisBeforeLiabilities: '4000.25',
    currentOrdinaryLoss: '-6000.57', completePartIIOriginalsConfirmed: true,
  });
  const result = calculateScheduleC(input);
  expect(result.netProfit.toFixed()).toBe('-3500.05');
  expect(result.form6198PartII2026?.currentSuspendedLoss.toFixed()).toBe('2500.52');
  expect(computeGuidedPreviewOutcome(state)).toEqual({ metrics: null, blockedBy: expect.stringMatching(/2026/u) });
});

it('holds missing, stale and competing Form 6198 originals', () => {
  const cases = [
    ({ business }: ReturnType<typeof interview>) => { Reflect.deleteProperty(business.businessFacts, 'form6198PartII2026'); },
    ({ business }: ReturnType<typeof interview>) => { business.businessFacts.form6198PartII2026.increases = ''; },
    ({ business }: ReturnType<typeof interview>) => { business.businessFacts.form6198PartII2026.currentOrdinaryLoss = '-6000.56'; },
    ({ business }: ReturnType<typeof interview>) => { business.businessFacts.form6198PartII2026.originalScheduleCReference = 'Other actual business workpaper'; },
    ({ business }: ReturnType<typeof interview>) => { Reflect.deleteProperty(business.businessFacts, 'scheduleCSourceFacts'); },
    ({ business }: ReturnType<typeof interview>) => { business.qbiMateriallyParticipated = false; },
    ({ business }: ReturnType<typeof interview>) => { business.expenses.supplies = '50'; },
    ({ business }: ReturnType<typeof interview>) => { business.manualGrossReceipts = '9000'; },
    ({ business }: ReturnType<typeof interview>) => { business.businessFacts.allInvestmentAtRisk = true; },
    ({ state }: ReturnType<typeof interview>) => { state.taxYear = 2025; },
  ];
  for (const edit of cases) {
    const fixture = interview();
    edit(fixture);
    expect(buildTaxInputFromGuidedData(fixture.state)).toBeNull();
  }
});

it('reopens actual originals and clears review after controlling edits', async () => {
  const { state } = interview();
  const saved = new Map<string, string>();
  const storage: Storage = {
    get length() { return saved.size; }, key: index => [...saved.keys()][index] ?? null,
    clear: () => saved.clear(), getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => { saved.set(key, value); }, removeItem: key => { saved.delete(key); },
  };
  const workspaceId = 'synthetic-schedule-c-form-6198';
  const passphrase = 'synthetic private recovery passphrase';
  ensureWorkspace(storage, workspaceId);
  expect(saveGuidedFlowState(storage, workspaceId, state)).toBe(true);
  const archive = await exportWorkspaceRecovery(storage, workspaceId, passphrase);
  expect(await archive.text()).not.toContain(actualPartII.openingBasisReference);
  const imported = await importWorkspaceRecovery(storage, archive, passphrase);
  const restored = loadGuidedFlowState(storage, imported.workspaceId)!;
  const business = restored.sectionData['income-self-employment']!;
  expect(business.businessFacts?.form6198PartII2026).toEqual(actualPartII);
  expect(buildTaxInputFromGuidedData(restored)?.scheduleC?.form6198PartII2026?.increases).toBe('0.00');

  const editedOwner = updateSectionData(restored, 'personal-info', { ...restored.sectionData['personal-info']!, ssn: '999-88-3333' });
  expect(editedOwner.sectionData['income-self-employment']?.businessFacts?.form6198PartII2026?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(editedOwner)).toBeNull();

  const changedAmount = structuredClone(business);
  changedAmount.businessFacts!.scheduleCSourceFacts!.ordinaryExpenses!.rows![0].amount = '7000.58';
  const editedExpense = updateSectionData(restored, 'income-self-employment', changedAmount);
  expect(editedExpense.sectionData['income-self-employment']?.businessFacts?.form6198PartII2026?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(editedExpense)).toBeNull();

  const changedSource = structuredClone(business);
  changedSource.businessFacts!.scheduleCSourceFacts!.sourceReference = 'Replacement independent Schedule C workpaper';
  const editedSource = updateSectionData(restored, 'income-self-employment', changedSource);
  expect(editedSource.sectionData['income-self-employment']?.businessFacts?.form6198PartII2026?.sourceFactsConfirmed).toBeNull();

  const changedWorksheet = structuredClone(business);
  changedWorksheet.businessFacts!.form6198PartII2026!.openingBasisReference = 'Replacement Part II opening ledger';
  const editedWorksheet = updateSectionData(restored, 'income-self-employment', changedWorksheet);
  expect(editedWorksheet.sectionData['income-self-employment']?.businessFacts?.form6198PartII2026?.sourceFactsConfirmed).toBeNull();
  expect(editedWorksheet.sectionData['income-self-employment']?.businessFacts?.scheduleCSourceFacts?.sourceFactsConfirmed).toBe(true);

  const differentYear = setInterviewTaxYear(restored, 2025);
  expect(differentYear.sectionData['income-self-employment']?.businessFacts?.form6198PartII2026?.openingBasisReference).toBe(actualPartII.openingBasisReference);
  expect(differentYear.sectionData['income-self-employment']?.businessFacts?.form6198PartII2026?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(differentYear)).toBeNull();
});
