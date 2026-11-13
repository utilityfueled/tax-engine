import { z } from 'zod';
import { ScheduleCProfessionalWageringSchema } from '@/models/inputs';
import type { BusinessSourceData } from './guided-business-facts';
import { isStartedNec } from './guided-compensation-reporting';
import { parseGuidedCurrency } from './guided-currency';
import type { GuidedFlowState, SelfEmploymentSectionData } from './guided-interview-flow';
import { hasEnteredAmount } from './guided-required-facts';

export const wageringConfirmations = {
  fullCalendarYearConfirmed: 'This ledger covers the entire calendar year',
  completeDomesticProfessionalActivityConfirmed: 'This ledger includes all domestic professional wagering',
  noOtherActivityOrDuplicatedAmountsConfirmed: 'The ledger includes no other activity or duplicate amounts',
  noW2GOriginalsConfirmed: 'There are no Forms W-2G to reconcile',
} as const;

const unanswered = {
  fullCalendarYearConfirmed: null,
  completeDomesticProfessionalActivityConfirmed: null,
  noOtherActivityOrDuplicatedAmountsConfirmed: null,
  noW2GOriginalsConfirmed: null,
};
const answer = z.boolean().nullable();
export const professionalWageringDraftSchema = z.strictObject({
  ledgerReference: z.string(), grossTaxableWageringGains: z.string(), wageringLosses: z.string(),
  otherwiseDeductibleWageringExpenses: z.string(),
  fullCalendarYearConfirmed: answer, completeDomesticProfessionalActivityConfirmed: answer,
  noOtherActivityOrDuplicatedAmountsConfirmed: answer, noW2GOriginalsConfirmed: answer,
});
export type ProfessionalWageringDraft = z.infer<typeof professionalWageringDraftSchema>;

export function readProfessionalWageringAmount(value: string): string | undefined {
  const normalized = value.trim().replace(/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/, text => text.replaceAll(',', ''));
  const result = ScheduleCProfessionalWageringSchema.shape.grossTaxableWageringGains.safeParse(normalized);
  return result.success ? result.data : undefined;
}

export function newProfessionalWageringDraft(): ProfessionalWageringDraft {
  return { ledgerReference: '', grossTaxableWageringGains: '', wageringLosses: '', otherwiseDeductibleWageringExpenses: '', ...unanswered };
}

export function clearWageringConfirmations(draft: ProfessionalWageringDraft) {
  return { ...draft, ...unanswered };
}

export function supportsGuidedProfessionalWagering(state: GuidedFlowState | undefined, facts: BusinessSourceData | undefined) {
  return state?.taxYear === 2026 && state.segmentation.filingStatus === 'single'
    && state.segmentation.stateCode === null && !state.sectionData['personal-info']?.spouse
    && facts?.accountHolder === 'primary' && facts.accountingMethod === 'cash';
}

export function readGuidedProfessionalWagering(data: SelfEmploymentSectionData, state: GuidedFlowState | undefined) {
  const facts = data.businessFacts;
  if (facts?.professionalWagering === undefined) return undefined;
  if (!supportsGuidedProfessionalWagering(state, facts)) {
    throw new Error('Professional wagering needs a 2026 single-taxpayer federal return and a primary-owner cash business.');
  }
  const deductions = state?.sectionData.deductions;
  const amounts = [data.manualGrossReceipts, ...Object.values(data.expenses), facts.returnsAndAllowances,
    facts.costOfGoodsSold, facts.otherIncome, facts.contractLabor, facts.depreciation, facts.legalAndProfessional,
    facts.businessInterest, deductions?.gamblingWinnings, deductions?.gamblingLosses, deductions?.gamblingExpenses];
  if (amounts.some(value => hasEnteredAmount(value) && !parseGuidedCurrency(value).isZero())
    || data.necEntries.some(isStartedNec) || facts.standardMileage || facts.scheduleCSourceFacts
    || facts.macrsAssets || facts.passengerSources || state?.sectionData.adjustments?.foreignIncome !== undefined
    || state?.sectionData.credits?.dependentCareBenefits !== undefined) {
    throw new Error('Reconcile other receipts, business expenses or recreational wagering before using this exclusive ledger.');
  }
  const saved = professionalWageringDraftSchema.safeParse(facts.professionalWagering);
  if (!saved.success) throw new Error('Replace the saved wagering ledger with a supported source record.');
  const { noW2GOriginalsConfirmed, ...draft } = saved.data;
  const packet = ScheduleCProfessionalWageringSchema.safeParse({ ...draft, taxYear: 2026,
    grossTaxableWageringGains: readProfessionalWageringAmount(draft.grossTaxableWageringGains),
    wageringLosses: readProfessionalWageringAmount(draft.wageringLosses),
    otherwiseDeductibleWageringExpenses: readProfessionalWageringAmount(draft.otherwiseDeductibleWageringExpenses),
  });
  if (!packet.success || noW2GOriginalsConfirmed !== true) {
    throw new Error('Enter the complete professional ledger, actual amounts and all four confirmations. Forms W-2G need separate reconciliation.');
  }
  return packet.data;
}
