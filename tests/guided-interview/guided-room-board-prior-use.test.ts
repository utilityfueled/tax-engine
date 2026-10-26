// @vitest-environment jsdom
// Spec: spec/federal/form-1099-q-room-board-prior-use.yaml guided-history.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { loadGuidedFlowState, saveGuidedFlowState, updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedRoomBoardPriorUse } from '../fixtures/guided-room-board-prior-use';
import { requiredPeriodSource as required } from '../fixtures/guided-room-board-periods';
it('preserves historical originals through reload and reconfirmation', () => {
  const { state, original } = actualGuidedRoomBoardPriorUse(), before = structuredClone(state), id = 'fictional-prior-period';
  const amount = (s: typeof state) => calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(s))).agi.toFixed();
  try {
    saveGuidedFlowState(localStorage, id, state);
    let loaded = required(loadGuidedFlowState(localStorage, id));
    const built = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(loaded));
    expect(built.qualifiedEducationExpenses?.sourceFacts?.roomBoardPriorUses).toEqual(original.qualifiedEducationExpenses?.sourceFacts?.roomBoardPriorUses);
    expect(built.qualifiedEducationExpenses?.sourceFacts?.roomBoardPriorUseExpenses).toEqual(original.qualifiedEducationExpenses?.sourceFacts?.roomBoardPriorUseExpenses);
    expect(amount(loaded)).toBe('51800'); expect(state).toEqual(before);
    const edited = structuredClone(required(loaded.sectionData.credits?.educationDistributions));
    required(edited.roomBoardPriorUses?.[0]).qualifiedCostBeforeAssistance = '4000';
    required(edited.roomBoardPriorUses?.[0]).adjustedQualifiedExpenses = '3000';
    required(edited.roomBoardPriorUseExpenses?.[0]).amount = '4000';
    loaded = updateSectionData(loaded, 'credits', { ...required(loaded.sectionData.credits), educationDistributions: edited });
    const draft = required(loaded.sectionData.credits?.educationDistributions);
    expect(draft.sourceFactsConfirmed).toBeNull();
    expect(required(draft.roomBoardPeriods?.[0]).sourceFactsConfirmed).toBeNull();
    // Completeness is an actual source answer; the separate review confirmation
    // is revoked. Clearing the fact itself would make reconfirmation self-reset.
    expect(required(draft.roomBoardPeriods?.[0]).priorUseHistoryConfirmed).toBe(true);
    expect(required(draft.roomBoardPriorUses?.[0]).sourceFactsConfirmed).toBeNull();
    expect(required(draft.roomBoardPriorUseExpenses?.[0]).sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(loaded)).toBeNull();
    const renewed = { ...draft, sourceFactsConfirmed: true,
      roomBoardPeriods: draft.roomBoardPeriods?.map(row => ({ ...row, sourceFactsConfirmed: true, priorUseHistoryConfirmed: true })),
      roomBoardPeriodExpenses: draft.roomBoardPeriodExpenses?.map(row => ({ ...row, sourceFactsConfirmed: true })),
      roomBoardPriorUses: draft.roomBoardPriorUses?.map(row => ({ ...row, sourceFactsConfirmed: true })),
      roomBoardPriorUseExpenses: draft.roomBoardPriorUseExpenses?.map(row => ({ ...row, sourceFactsConfirmed: true })) };
    loaded = updateSectionData(loaded, 'credits', { ...required(loaded.sectionData.credits), educationDistributions: renewed });
    expect(amount(loaded)).toBe('51600');
    saveGuidedFlowState(localStorage, id, loaded); expect(amount(required(loadGuidedFlowState(localStorage, id)))).toBe('51600');
    const unknown = structuredClone(loaded);
    required(required(unknown.sectionData.credits?.educationDistributions).roomBoardPriorUseExpenses?.[0]).refundedAmount = '';
    expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
    saveGuidedFlowState(localStorage, id, unknown);
    expect(loadGuidedFlowState(localStorage, id)?.sectionData.credits?.educationDistributions?.roomBoardPriorUseExpenses?.[0]?.refundedAmount).toBe('');
    expect(renewed.roomBoardPriorUses?.[0]?.schoolOwnedHousing).toBe(false);
    const incomplete = structuredClone(loaded), incompleteData = required(incomplete.sectionData.credits?.educationDistributions);
    required(incompleteData.roomBoardPeriods?.[0]).priorUseHistoryConfirmed = false;
    const changed = updateSectionData(loaded, 'credits', { ...required(loaded.sectionData.credits), educationDistributions: incompleteData });
    expect(changed.sectionData.credits?.educationDistributions?.roomBoardPeriods?.[0]?.priorUseHistoryConfirmed).toBe(false);
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  } finally { localStorage.clear(); }
});
