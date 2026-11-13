import { z } from 'zod';
import { Form3903Sources2026Schema } from '@/models/inputs';
import { assertMovingCodePReconciliation } from '@/engine/moving-code-p-sources';
import { calculateForm3903 } from '@/engine/forms/form-3903';
import { actualCompensationSourceYear } from './guided-compensation-reporting';
import { assertKnownFacts, hasEnteredAmount } from './guided-required-facts';
import { parseGuidedCurrency } from './guided-currency';
import type { FilingStatus, GuidedFlowState } from './guided-interview-flow';
import { enteredCodeP, w2FactErrors } from './guided-w2-facts';

const answer = z.boolean().nullable();
const mileageEntry = z.strictObject({ date: z.string(), miles: z.string() });
const moveDraftSchema = z.strictObject({
  moveReference: z.string(), accountHolder: z.enum(['', 'primary', 'spouse']), date: z.string(),
  domesticSameYearConfirmed: answer, eligibilityKind: z.enum(['', 'military', 'intelligence-community']),
  activeDuty: answer, permanentChangeOfStationOrdered: answer,
  employmentStatus: z.enum(['', 'employee', 'new-appointee']), qualifyingElement: answer,
  nonMilitary: answer, assignmentRequiresRelocation: answer,
  transportationAndStorage: z.string(), reimbursementsExcludedFromIncome: z.string(), lineAmountsConfirmed: answer,
  omittedTaxableExcess: z.string().optional(),
  transportationAndLodging: z.string(), vehicleMethod: z.enum(['', 'none', 'actual', 'mileage']),
  gasAndOil: z.string(), parkingAndTolls: z.string(), mileage: z.array(mileageEntry),
});
export const movingExpensesDraftSchema = z.strictObject({ sourceTaxYear: z.literal(2026), moves: z.array(moveDraftSchema) });
export type MovingExpensesDraft = z.infer<typeof movingExpensesDraftSchema>;
export type MovingExpenseDraft = z.infer<typeof moveDraftSchema>;

export function emptyMovingExpense(): MovingExpenseDraft {
  return {
    moveReference: '', accountHolder: '', date: '', domesticSameYearConfirmed: null, eligibilityKind: '',
    activeDuty: null, permanentChangeOfStationOrdered: null, employmentStatus: '', qualifyingElement: null,
    nonMilitary: null, assignmentRequiresRelocation: null, transportationAndStorage: '',
    reimbursementsExcludedFromIncome: '', lineAmountsConfirmed: null, transportationAndLodging: '',
    vehicleMethod: '', gasAndOil: '', parkingAndTolls: '', mileage: [],
  };
}

export function invalidateMovingExpenses(draft: MovingExpensesDraft): MovingExpensesDraft {
  const parsed = movingExpensesDraftSchema.safeParse(draft);
  return parsed.success ? { ...draft, moves: draft.moves.map(move => ({ ...move, lineAmountsConfirmed: null })) } : draft;
}

function sourceAmount(value: string): string {
  parseGuidedCurrency(value);
  return value.trim().replaceAll(',', '');
}

export function hasMovingW2Source(state: GuidedFlowState): boolean {
  return (state.sectionData['income-w2']?.entries ?? []).some(entry => {
    if (!hasEnteredAmount(entry.box12CodeP)) return false;
    try { return parseGuidedCurrency(entry.box12CodeP).gt(0); }
    catch { return true; }
  });
}

export function buildMovingExpenses(state: GuidedFlowState): z.infer<typeof Form3903Sources2026Schema> | undefined {
  const adjustments = state.sectionData.adjustments;
  const draft = adjustments?.movingExpenses;
  const hasCodeP = hasMovingW2Source(state);
  if (adjustments?.movingExpensesNotApplicable === true) {
    if (draft !== undefined) throw new Error('Resolve the conflict between saved moving records and their removal.');
    if (hasCodeP) throw new Error('Reconcile the reported W-2 Code P with the original moving records before removing this claim.');
    return undefined;
  }
  if (draft === undefined && !hasCodeP && !state.segmentation.lifeEvents.includes('moving-expenses')) return undefined;
  if (state.taxYear !== 2026) throw new Error('Moving records in this interview require a matching 2026 return.');
  const result = movingExpensesDraftSchema.safeParse(draft);
  if (!result.success || !result.data.moves.length) throw new Error('Enter the complete actual Form 3903 moving records.');
  const moves = result.data.moves;
  const jointSpouse = hasMovingSpouse(state.segmentation.filingStatus, !!state.sectionData['personal-info']?.spouse);
  if (moves.some(move => move.accountHolder === 'spouse') && !jointSpouse) {
    throw new Error('Spouse moving expenses require an actual joint return and spouse.');
  }
  if (state.sectionData.adjustments?.foreignIncome) throw new Error('Moving expenses with foreign earned income require separate allocation from the original records.');

  const candidate = Form3903Sources2026Schema.safeParse({ taxYear: result.data.sourceTaxYear, moves: moves.map((move, index) => {
    const military = move.eligibilityKind === 'military';
    if ((military && (move.employmentStatus || move.qualifyingElement !== null || move.nonMilitary !== null || move.assignmentRequiresRelocation !== null))
      || (move.eligibilityKind === 'intelligence-community' && (move.activeDuty !== null || move.permanentChangeOfStationOrdered !== null))) {
      throw new Error(`Move ${index + 1} has conflicting eligibility records.`);
    }
    if ((move.vehicleMethod !== 'mileage' && move.mileage.length) || (move.vehicleMethod !== 'actual' && move.gasAndOil.trim())
      || (move.vehicleMethod === 'none' && move.parkingAndTolls.trim())) {
      throw new Error(`Move ${index + 1} has conflicting vehicle expense methods.`);
    }
    const eligibility = military
      ? { kind: move.eligibilityKind, activeDuty: move.activeDuty, permanentChangeOfStationOrdered: move.permanentChangeOfStationOrdered }
      : { kind: move.eligibilityKind, employmentStatus: move.employmentStatus, qualifyingElement: move.qualifyingElement,
          nonMilitary: move.nonMilitary, assignmentRequiresRelocation: move.assignmentRequiresRelocation };
    const vehicle = move.vehicleMethod === 'actual'
      ? { method: move.vehicleMethod, gasAndOil: sourceAmount(move.gasAndOil), parkingAndTolls: sourceAmount(move.parkingAndTolls) }
      : move.vehicleMethod === 'mileage'
        ? { method: move.vehicleMethod, parkingAndTolls: sourceAmount(move.parkingAndTolls), entries: move.mileage }
        : { method: move.vehicleMethod };
    return {
      moveReference: move.moveReference, accountHolder: move.accountHolder, date: move.date,
      domesticSameYearConfirmed: move.domesticSameYearConfirmed, eligibility,
      transportationAndStorage: sourceAmount(move.transportationAndStorage),
      reimbursementsExcludedFromIncome: sourceAmount(move.reimbursementsExcludedFromIncome),
      ...(hasEnteredAmount(move.omittedTaxableExcess) && move.omittedTaxableExcess !== undefined
        ? { omittedTaxableExcess: sourceAmount(move.omittedTaxableExcess) } : {}),
      lineAmountsConfirmed: move.lineAmountsConfirmed,
      travel: { transportationAndLodging: sourceAmount(move.transportationAndLodging), vehicle },
    };
  }) });
  if (!candidate.success) throw new Error('Confirm every actual Form 3903 source, eligibility answer and amount. Enter zero for known zero and use distinct move and mileage records.');
  if (hasCodeP || moves.some(move => parseGuidedCurrency(move.reimbursementsExcludedFromIncome).gt(0) || hasEnteredAmount(move.omittedTaxableExcess))) {
    const originals = (state.sectionData['income-w2']?.entries ?? []).filter(entry => hasEnteredAmount(entry.box12CodeP));
    assertKnownFacts(w2FactErrors(originals, state.segmentation.filingStatus, state.taxYear));
    const wages = originals.map(entry => ({
      taxYear: actualCompensationSourceYear(entry.sourceTaxYear),
      accountHolder: entry.accountHolder || undefined,
      box12CodeP: enteredCodeP(entry),
    }));
    assertMovingCodePReconciliation(wages, state.taxYear, jointSpouse, candidate.data, calculateForm3903(candidate.data), true);
  }
  return candidate.data;
}

export function hasMovingSpouse(status: FilingStatus | null | undefined, hasSpouse: boolean) {
  return status === 'mfj' && hasSpouse;
}

export function movingExpenseFactErrors(state: GuidedFlowState): Record<string, string> {
  try { buildMovingExpenses(state); return {}; }
  catch (error) { return { movingExpenses: error instanceof Error ? error.message : 'Confirm the original moving records.' }; }
}
