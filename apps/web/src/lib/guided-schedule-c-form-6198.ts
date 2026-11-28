import { Form6198ScheduleCPartII2026Schema, type Form6198ScheduleCPartII2026Input } from '@/models/form-6198-schedule-c-part-ii-2026';
import { parseGuidedCurrency } from './guided-currency';
import type { SelfEmploymentSectionData } from './guided-interview-flow';

type ScopeConfirmation = 'continuingDomesticSoleProprietorshipConfirmed' | 'oneOrdinaryScheduleCLossOnlyConfirmed' | 'noPriorAtRiskLossOrRecaptureConfirmed';

export type GuidedScheduleCForm6198Draft = Partial<Omit<Form6198ScheduleCPartII2026Input,
  'taxYear' | 'accountHolder' | 'completePartIIOriginalsConfirmed' | ScopeConfirmation>> & {
  taxYear?: string;
  sourceFactsConfirmed?: boolean | null;
} & Partial<Record<ScopeConfirmation, boolean | null>>;

function originalAmount(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  parseGuidedCurrency(value);
  return value.trim().replaceAll(',', '');
}

/** The return's Schedule C reference is separately collected in the ordinary business source packet. */
export function buildGuidedScheduleCForm6198(data: SelfEmploymentSectionData | undefined, taxYear?: number | null) {
  const facts = data?.businessFacts;
  const draft = facts?.form6198PartII2026;
  if (!data || !facts || draft === undefined) return undefined;
  if (taxYear !== 2026 || draft.taxYear?.trim() !== '2026') {
    throw new Error('Confirm the actual 2026 year on these Form 6198 records.');
  }
  if (facts.accountHolder !== 'primary' || data.qbiMateriallyParticipated !== true
    || facts.allInvestmentAtRisk !== false || facts.accountingMethod !== 'cash') {
    throw new Error('These Form 6198 records require a materially participating primary-owner cash business with some investment outside at-risk treatment.');
  }
  const source = facts.scheduleCSourceFacts;
  if (source?.sourceFactsConfirmed !== true || source.sourceTaxYear !== 2026
    || source.ordinaryExpenses?.sourceFactsConfirmed !== true || !source.sourceReference?.trim()
    || source.sourceReference.trim() !== draft.originalScheduleCReference?.trim()) {
    throw new Error('Confirm the independent 2026 Schedule C source packet and ordinary expenses. The Form 6198 Schedule C reference must match it.');
  }
  const { sourceFactsConfirmed, taxYear: originalYear, ...original } = draft;
  const parsed = Form6198ScheduleCPartII2026Schema.safeParse({
    ...original,
    taxYear: Number(originalYear),
    accountHolder: facts.accountHolder,
    completePartIIOriginalsConfirmed: sourceFactsConfirmed,
    currentOrdinaryLoss: originalAmount(draft.currentOrdinaryLoss),
    openingAdjustedAssetBasisBeforeLiabilities: originalAmount(draft.openingAdjustedAssetBasisBeforeLiabilities),
    increases: originalAmount(draft.increases),
    decreases: originalAmount(draft.decreases),
  });
  if (!parsed.success) throw new Error('Complete and confirm the actual Form 6198 Part II originals, including each amount and its source reference.');
  return parsed.data;
}
