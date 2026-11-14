import { z } from 'zod';

const amount = z.string().regex(/^\d+(\.\d+)?$/).optional();
const source = { sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional() };
/** Actual original records; absence stays unknown until the source validator. */
export const Form982PrincipalResidenceSourcesSchema = z.object({
  ...source, sourceTaxYear: z.number().int().optional(), allDischargesIncluded: z.boolean().optional(),
  allResidenceSecuredLoansIncluded: z.boolean().optional(), regularAndAlternativeExclusionSameConfirmed: z.boolean().optional(),
  communityPropertyApplies: z.boolean().optional(), title11Case: z.boolean().optional(), electInsolvencyInstead: z.boolean().optional(),
  otherExclusionsOrExceptionsApply: z.boolean().optional(), solelyPrimaryOwnedConfirmed: z.boolean().optional(),
  retainedResidenceConfirmed: z.boolean().optional(), noPropertyTransferConfirmed: z.boolean().optional(),
  neverBusinessOrRentalUseConfirmed: z.boolean().optional(),
  debt: z.object({ ...source, sourceId: z.string().optional(), statementId: z.string().optional(), sourceTaxYear: z.number().int().optional(),
    accountHolder: z.enum(['primary','spouse']).optional(), debtorName: z.string().optional(), debtorSsnLast4: z.string().optional(),
    creditor: z.string().optional(), creditorTin: z.string().optional(), accountReference: z.string().optional(), dischargeDate: z.string().optional(),
    amountDischarged: amount, interestIncluded: amount, fmvOfProperty: amount, personallyLiable: z.boolean().optional(),
    identifiableEventCode: z.string().optional(), debtDescription: z.string().optional(), completePrincipalCancellationConfirmed: z.boolean().optional(),
    actualDischargedPrincipal: amount, actualDischargedInterest: amount, noDeductibleInterestDischargedConfirmed: z.boolean().optional(),
  }).optional(),
  acquisition: z.object({ ...source, mainHomeConfirmed: z.boolean().optional(), securedByResidenceConfirmed: z.boolean().optional(),
    originalLoanNotRefinancedConfirmed: z.boolean().optional(), allProceedsAcquisitionUseConfirmed: z.boolean().optional(),
    acquisitionUse: z.enum(['buy_build_substantially_improve','other']).optional(),
    immediatelyBeforeDischargeConfirmed: z.boolean().optional(), balanceAsOfDate: z.string().optional(), outstandingPrincipal: amount,
    originationDate: z.string().optional(), originalAcquisitionPrincipal: amount, noCapitalizedInterestOrAddedPrincipalConfirmed: z.boolean().optional(),
    residenceAddress: z.object({ street: z.string().optional(), apt: z.string().optional(), city: z.string().optional(), state: z.string().optional(), zip: z.string().optional() }).optional(),
  }).optional(),
  reason: z.object({ ...source, reason: z.enum(['decline_in_residence_value','taxpayer_financial_condition','other']).optional(),
    noLenderServicesConsiderationConfirmed: z.boolean().optional() }).optional(),
  basis: z.object({ ...source, asOfDate: z.string().optional(), allBasisChangesIncluded: z.boolean().optional(), purchaseCost: amount,
    acquisitionCosts: amount, capitalImprovements: amount, previousBasisReductions: amount }).optional(),
  arrangement: z.object({ ...source, enteredDate: z.string().optional(), evidencedInWritingDate: z.string().optional(),
    dischargeSubjectToArrangementConfirmed: z.boolean().optional() }).optional(),
});
export type Form982PrincipalResidenceSources = z.infer<typeof Form982PrincipalResidenceSourcesSchema>;
