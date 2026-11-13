import { z } from 'zod';
import { reconcileProfessionalWageringStatements } from '@/engine/schedules/schedule-c-wagering-sources';
import { FormW2GSchema, ScheduleCProfessionalWageringSchema } from '@/models/inputs';
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
export const wageringOriginalsConfirmation = 'These are all original individual 2026 domestic cash slot payments, with no state or local reporting';

const originalDraft = z.strictObject({
  sourceId: z.string(), ledgerEntry: z.string(), payer: z.string(), payerTin: z.string(), recipientTinLast4: z.string(), winningDate: z.string(),
  reportableWinnings: z.string(), recognizedLedgerGain: z.string(), federalWithheld: z.string(),
});
export type WageringStatementDraft = z.infer<typeof originalDraft>;
export const newWageringStatement = (): WageringStatementDraft => ({
  sourceId: '', ledgerEntry: '', payer: '', payerTin: '', recipientTinLast4: '', winningDate: '',
  reportableWinnings: '', recognizedLedgerGain: '', federalWithheld: '',
});
export const maxGuidedWageringStatements = 500;

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
  w2gSources: z.strictObject({
    individualOriginalsAndLedgerInclusionConfirmed: answer,
    otherGrossTaxableWageringGains: z.string(),
    statements: z.array(originalDraft).min(1).max(maxGuidedWageringStatements),
  }).optional(),
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
  return { ...draft, ...unanswered, ...(draft.w2gSources ? {
    w2gSources: { ...draft.w2gSources, individualOriginalsAndLedgerInclusionConfirmed: null },
  } : {}) };
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
  const { noW2GOriginalsConfirmed, w2gSources, ...draft } = saved.data;
  if (!w2gSources && noW2GOriginalsConfirmed !== true) {
    throw new Error('Enter the complete professional ledger and confirm whether Forms W-2G need reconciliation.');
  }
  if (w2gSources && noW2GOriginalsConfirmed === true) {
    throw new Error('Review the conflicting answers about original Forms W-2G.');
  }
  const packet = ScheduleCProfessionalWageringSchema.safeParse({ ...draft, taxYear: 2026,
    grossTaxableWageringGains: readProfessionalWageringAmount(draft.grossTaxableWageringGains),
    wageringLosses: readProfessionalWageringAmount(draft.wageringLosses),
    otherwiseDeductibleWageringExpenses: readProfessionalWageringAmount(draft.otherwiseDeductibleWageringExpenses),
    ...(w2gSources ? { w2gSources: { ...w2gSources,
      otherGrossTaxableWageringGains: readProfessionalWageringAmount(w2gSources.otherGrossTaxableWageringGains),
      statements: w2gSources.statements.map(row => ({ ...row,
        payerTin: row.payerTin.trim(), recipientTinLast4: row.recipientTinLast4.trim(),
        reportableWinnings: readProfessionalWageringAmount(row.reportableWinnings),
        recognizedLedgerGain: readProfessionalWageringAmount(row.recognizedLedgerGain),
        federalWithheld: readProfessionalWageringAmount(row.federalWithheld),
      })),
    } } : {}),
  });
  if (!packet.success) {
    throw new Error('Enter the complete professional ledger, actual amounts and confirmations. Complete each added Form W-2G and its ledger link.');
  }
  const ledger = packet.data;
  const forms = ledger.w2gSources?.statements.map(row => FormW2GSchema.parse({
    taxYear: ledger.taxYear, accountHolder: 'primary', typeOfWager: 'slots', prizeType: 'cash',
    sourceId: row.sourceId, payer: row.payer, payerTin: row.payerTin, winningDate: row.winningDate,
    reportableWinnings: row.reportableWinnings, federalWithheld: row.federalWithheld,
  }));
  reconcileProfessionalWageringStatements({
    taxpayer: { taxYear: ledger.taxYear, primary: { ssn: state?.sectionData['personal-info']?.ssn ?? '' } }, formW2G: forms,
  }, ledger.w2gSources, ledger.grossTaxableWageringGains);
  return { ledger, forms };
}
