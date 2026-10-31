import { z } from 'zod';

const sourceAmount = z.string().regex(/^\d+(\.\d+)?$/).optional();
const insolvencyItem = z.object({
  sourceId: z.string().optional(), description: z.string().optional(), amount: sourceAmount,
  sourceReference: z.string().optional(), dischargedDebtSourceId: z.string().optional(),
});
/** Original records and explicit choices; no default-zero facts or loss overrides. */
export const Form982NolSourcesSchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  allDischargesIncluded: z.boolean().optional(), title11Case: z.boolean().optional(), communityPropertyApplies: z.boolean().optional(),
  electBasisReductionFirst: z.boolean().optional(), otherExclusionsOrExceptionsApply: z.boolean().optional(),
  regularAndAlternativeExclusionSameConfirmed: z.boolean().optional(),
  debts: z.array(z.object({
    sourceId: z.string().optional(), statementId: z.string().optional(), sourceTaxYear: z.number().int().optional(),
    sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    accountHolder: z.enum(['primary', 'spouse']).optional(), debtorName: z.string().optional(), debtorSsnLast4: z.string().optional(),
    creditor: z.string().optional(), creditorTin: z.string().optional(), accountReference: z.string().optional(), dischargeDate: z.string().optional(),
    amountDischarged: sourceAmount, interestIncluded: sourceAmount, fmvOfProperty: sourceAmount,
    debtDescription: z.string().optional(), personallyLiable: z.boolean().optional(), identifiableEventCode: z.string().optional(),
    unsecuredPersonalDebtConfirmed: z.boolean().optional(), noPropertyTransferConfirmed: z.boolean().optional(),
    /** Actual use and complete discharge records, not an inferred Box2/3 treatment. */
    personalDebt: z.object({
      sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
      allDischargedAmountsIncluded: z.boolean().optional(),
      proceedsUse: z.enum(['personal_living_expenses', 'business', 'investment', 'mixed_or_other']).optional(),
      useSourceReference: z.string().optional(), borrowingNotDeductibleUnpaidExpenseConfirmed: z.boolean().optional(),
      interestTreatment: z.enum(['nondeductible_personal', 'potentially_deductible']).optional(),
      interestSourceReference: z.string().optional(),
      actualDischargedAmount: sourceAmount, actualDischargedInterest: sourceAmount,
      noPaymentOrNewBorrowingAtDischargeConfirmed: z.boolean().optional(),
    }).optional(),
  })).optional(),
  insolvency: z.object({
    asOfDate: z.string().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    immediatelyBeforeDischargeConfirmed: z.boolean().optional(), allAssetsIncluded: z.boolean().optional(),
    exemptAndRetirementAssetsIncluded: z.boolean().optional(), allLiabilitiesIncluded: z.boolean().optional(),
    assets: z.array(insolvencyItem).optional(), liabilities: z.array(insolvencyItem).optional(),
  }).optional(),
});
export type Form982NolSources = z.infer<typeof Form982NolSourcesSchema>;
