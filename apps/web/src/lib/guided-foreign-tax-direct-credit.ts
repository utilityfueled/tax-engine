import type { TaxYearInput } from '@/models/inputs.js';
import { parseGuidedCurrency } from './guided-currency';
import type { GuidedFlowState } from './guided-interview-flow';

type EngineDirectCredit = NonNullable<NonNullable<TaxYearInput['foreignTaxElection']>['creditWithoutForm1116']>;
export type ForeignDirectCarryData = Omit<NonNullable<EngineDirectCredit['carryovers']>[number], 'originTaxYear'> & { originTaxYear?: string };
export type ForeignDirectCreditData = Omit<EngineDirectCredit, 'adjustedThroughTaxYear' | 'carryovers' | 'amtCarryovers' | 'sourceFactsConfirmed'> & {
  adjustedThroughTaxYear?: string;
  carryovers?: ForeignDirectCarryData[];
  amtCarryovers?: ForeignDirectCarryData[];
  sourceFactsConfirmed?: boolean | null;
};
export interface ForeignCreditKnownResidency {
  nonresidentAlien?: boolean | null;
  dualStatusAlien?: boolean | null;
  educationNonresidentAlien?: boolean | null;
  foreignEarnedIncome?: string[];
}
export function foreignCreditKnownFacts(state: Pick<GuidedFlowState, 'sectionData'>): ForeignCreditKnownResidency {
  const foreign = state.sectionData.adjustments?.foreignIncome;
  return { ...state.sectionData['personal-info']?.standardDeductionFacts,
    educationNonresidentAlien: state.sectionData.credits?.education?.nonresidentAlien,
    foreignEarnedIncome: foreign ? [...Object.values(foreign.partIV ?? {}), ...(foreign.sources ?? []).map(row => row.foreignEarnedIncome)] : undefined };
}
const yearValue = (value: string | undefined) => {
  if (!/^\d{4}$/.test(value ?? '')) throw new Error('Enter the actual four-digit foreign-credit history year.');
  return Number(value);
};
export function buildGuidedForeignTaxDirectCredit(data: ForeignDirectCreditData | undefined, known?: ForeignCreditKnownResidency): EngineDirectCredit | undefined {
  if (!data) return undefined;
  if (data.sourceFactsConfirmed !== true) throw new Error('Confirm the actual direct foreign-credit election facts after the last edit.');
  if (known?.nonresidentAlien === true || known?.dualStatusAlien === true || known?.educationNonresidentAlien === true) {
    throw new Error('The direct foreign-credit election conflicts with actual nonresident or dual-status facts; reconcile those source records.');
  }
  if (known?.foreignEarnedIncome?.some(value => value?.trim() && parseGuidedCurrency(value).gt(0))) {
    throw new Error('The all-passive foreign-credit election conflicts with actual foreign earned income.');
  }
  const records = (rows: ForeignDirectCarryData[] | undefined) => rows?.map(row => {
    if (!row.amount?.trim()) throw new Error('Enter the actual adjusted foreign-credit balance, including known zero.');
    const amount = parseGuidedCurrency(row.amount);
    if (!amount.isFinite() || amount.lt(0)) throw new Error('The actual foreign-credit balance must be finite and nonnegative.');
    return { ...row, originTaxYear: yearValue(row.originTaxYear), amount: amount.toFixed() };
  });
  return { ...data, adjustedThroughTaxYear: yearValue(data.adjustedThroughTaxYear),
    carryovers: records(data.carryovers), amtCarryovers: records(data.amtCarryovers), sourceFactsConfirmed: true };
}
