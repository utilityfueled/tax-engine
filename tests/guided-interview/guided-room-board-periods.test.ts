// @vitest-environment jsdom
// Spec: spec/federal/form-1099-q-room-board-periods.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { loadGuidedFlowState, saveGuidedFlowState, updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedRoomBoardPeriod, requiredPeriodSource as required } from '../fixtures/guided-room-board-periods';

it('retains actual period records and revokes dependent confirmations', () => {
  const { state, original } = actualGuidedRoomBoardPeriod(), before = structuredClone(state), id = 'fictional-period-source';
  const amount = (value: typeof state) => calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(value))).agi.toFixed();
  try {
    saveGuidedFlowState(localStorage, id, state);
    let loaded = required(loadGuidedFlowState(localStorage, id));
    const built = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(loaded));
    expect(built.qualifiedEducationExpenses?.sourceFacts?.roomBoardPeriods).toEqual(original.qualifiedEducationExpenses?.sourceFacts?.roomBoardPeriods);
    expect(built.qualifiedEducationExpenses?.sourceFacts?.roomBoardPeriodExpenses).toEqual(original.qualifiedEducationExpenses?.sourceFacts?.roomBoardPeriodExpenses);
    expect(amount(loaded)).toBe('50800'); expect(state).toEqual(before);
    const data = structuredClone(required(loaded.sectionData.credits?.educationDistributions));
    required(data.roomBoardPeriods?.[0]).roomBoardAllowance = '7000';
    loaded = updateSectionData(loaded, 'credits', { ...required(loaded.sectionData.credits), educationDistributions: data });
    const draft = required(loaded.sectionData.credits?.educationDistributions);
    expect(draft.sourceFactsConfirmed).toBeNull();
    expect(required(draft.roomBoardPeriods?.[0]).sourceFactsConfirmed).toBeNull();
    expect(draft.roomBoardPeriodExpenses?.map(row => row.sourceFactsConfirmed)).toEqual([null, null]);
    expect(buildTaxInputFromGuidedData(loaded)).toBeNull();
    const annualOnly = updateSectionData(loaded, 'credits', { ...required(loaded.sectionData.credits), educationDistributions: { ...draft, sourceFactsConfirmed: true } });
    expect(buildTaxInputFromGuidedData(annualOnly)).toBeNull();
    const complete = { ...required(annualOnly.sectionData.credits?.educationDistributions), sourceFactsConfirmed: true,
      roomBoardPeriods: draft.roomBoardPeriods?.map(row => ({ ...row, sourceFactsConfirmed: true })),
      roomBoardPeriodExpenses: draft.roomBoardPeriodExpenses?.map(row => ({ ...row, sourceFactsConfirmed: true })) };
    loaded = updateSectionData(annualOnly, 'credits', { ...required(annualOnly.sectionData.credits), educationDistributions: complete });
    expect(amount(loaded)).toBe('50600');
    saveGuidedFlowState(localStorage, id, loaded); expect(amount(required(loadGuidedFlowState(localStorage, id)))).toBe('50600');
    for (const value of ['', '0']) {
      const edited = structuredClone(required(loaded.sectionData.credits?.educationDistributions));
      required(edited.roomBoardPeriods?.[0]).roomBoardAllowance = value;
      let next = updateSectionData(loaded, 'credits', { ...required(loaded.sectionData.credits), educationDistributions: edited });
      const current = required(next.sectionData.credits?.educationDistributions);
      next = updateSectionData(next, 'credits', { ...required(next.sectionData.credits), educationDistributions: { ...current, sourceFactsConfirmed: true,
        roomBoardPeriods: current.roomBoardPeriods?.map(row => ({ ...row, sourceFactsConfirmed: true })),
        roomBoardPeriodExpenses: current.roomBoardPeriodExpenses?.map(row => ({ ...row, sourceFactsConfirmed: true })) } });
      if (value === '') expect(buildTaxInputFromGuidedData(next)).toBeNull(); else expect(amount(next)).toBe('52000');
      saveGuidedFlowState(localStorage, id, next);
      expect(loadGuidedFlowState(localStorage, id)?.sectionData.credits?.educationDistributions?.roomBoardPeriods?.[0]?.roomBoardAllowance).toBe(value);
    }
    const esa = actualGuidedRoomBoardPeriod(true), esaBuilt = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(esa.state));
    expect(esaBuilt.qualifiedEducationExpenses?.sourceFacts?.roomBoardEsaAllocations).toEqual(esa.original.qualifiedEducationExpenses?.sourceFacts?.roomBoardEsaAllocations);
    expect(amount(esa.state)).toBe('51800');
    const election = structuredClone(required(esa.state.sectionData.credits?.educationDistributions));
    required(election.roomBoardEsaAllocations?.[0]).amount = '3000';
    required(election.roomBoardEsaAllocations?.[1]).amount = '3000';
    const changed = updateSectionData(esa.state, 'credits', { ...required(esa.state.sectionData.credits), educationDistributions: election });
    const changedFacts = required(changed.sectionData.credits?.educationDistributions);
    expect(required(changedFacts.roomBoardPeriods?.[0]).sourceFactsConfirmed).toBeNull();
    expect(required(changedFacts.roomBoardPeriods?.[0]).esaAllocationConfirmed).toBe(true);
    expect(changedFacts.coverdellAccounts).toEqual(election.coverdellAccounts);
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
    const renewed = updateSectionData(changed, 'credits', { ...required(changed.sectionData.credits), educationDistributions: { ...changedFacts, sourceFactsConfirmed: true,
      roomBoardPeriods: changedFacts.roomBoardPeriods?.map(row => ({ ...row, sourceFactsConfirmed: true })),
      roomBoardPeriodExpenses: changedFacts.roomBoardPeriodExpenses?.map(row => ({ ...row, sourceFactsConfirmed: true })) } });
    expect(amount(renewed)).toBe('51800');
    expect(buildTaxInputFromGuidedData(renewed)?.qualifiedEducationExpenses?.sourceFacts?.roomBoardEsaAllocations?.map(row => row.amount)).toEqual(['3000', '3000']);
  } finally { localStorage.clear(); }
});
