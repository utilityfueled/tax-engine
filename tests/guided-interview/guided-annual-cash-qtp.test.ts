// @vitest-environment jsdom
// Spec: spec/federal/form-1099-q-annual-cash.yaml guide.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { loadGuidedFlowState, saveGuidedFlowState, updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedAnnualCashQtp } from '../fixtures/guided-annual-cash-qtp';
import { requiredPeriodSource as required } from '../fixtures/guided-room-board-periods';
it('preserves annual cash originals and reconfirmation through reload', () => {
  const { state, original } = actualGuidedAnnualCashQtp(), before = structuredClone(state), id = 'fictional-annual-cash';
  const amount = (s: typeof state) => calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(s))).agi.toFixed();
  try {
    saveGuidedFlowState(localStorage, id, state); let loaded = required(loadGuidedFlowState(localStorage, id));
    const built = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(loaded));
    expect(built.form1099Q).toEqual(TaxYearInputSchema.parse(original).form1099Q);
    expect(amount(loaded)).toBe('53500'); expect(state).toEqual(before);
    const edited = structuredClone(required(loaded.sectionData.credits?.educationDistributions)), second = required(edited.forms?.[1]);
    second.fields.earnings = '2000'; second.fields.basis = '8000';
    // Match the real panel's statement edit; the flow separately revokes annual/period checks.
    second.fields.sourceFactsConfirmed = null;
    loaded = updateSectionData(loaded, 'credits', { ...required(loaded.sectionData.credits), educationDistributions: edited });
    const draft = required(loaded.sectionData.credits?.educationDistributions);
    expect(draft.sourceFactsConfirmed).toBeNull();
    expect(required(draft.forms?.[1]).fields.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(loaded)).toBeNull();
    const renewed = { ...draft, sourceFactsConfirmed: true, forms: draft.forms?.map(row => ({ ...row, fields: { ...row.fields, sourceFactsConfirmed: true } })),
      roomBoardPeriods: draft.roomBoardPeriods?.map(row => ({ ...row, sourceFactsConfirmed: true })),
      roomBoardPeriodExpenses: draft.roomBoardPeriodExpenses?.map(row => ({ ...row, sourceFactsConfirmed: true })) };
    loaded = updateSectionData(loaded, 'credits', { ...required(loaded.sectionData.credits), educationDistributions: renewed });
    expect(amount(loaded)).toBe('54200');
    saveGuidedFlowState(localStorage, id, loaded); expect(amount(required(loadGuidedFlowState(localStorage, id)))).toBe('54200');
    const unknown = structuredClone(loaded); required(required(unknown.sectionData.credits?.educationDistributions).forms?.[1]).fields.earnings = '';
    expect(buildTaxInputFromGuidedData(unknown)).toBeNull(); saveGuidedFlowState(localStorage, id, unknown);
    expect(loadGuidedFlowState(localStorage, id)?.sectionData.credits?.educationDistributions?.forms?.[1]?.fields.earnings).toBe('');
    expect(renewed.forms?.[1]?.fields.isTrusteeToTrustee).toBe(false);
  } finally { localStorage.clear(); }
});
