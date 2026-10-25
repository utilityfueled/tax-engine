import { z } from "zod";
const amount = z.string().regex(/^\d+(\.\d+)?$/).optional();
const loanSource = {
  sourceId: z.string().optional(), sourceReference: z.string().optional(), lenderName: z.string().optional(), loanAccountReference: z.string().optional(),
  originationDate: z.string().optional(), firstLien: z.boolean().optional(), relatedParty: z.boolean().optional(), principal: amount,
  interestPaid: amount, interestDeductedElsewhere: amount, otherExcludedInterest: amount,
};
/** Original records only; parsing never supplies balances, zero or confirmation. */
export const VehicleRefinancingSourcesSchema = z.object({
  sourceTaxYear: z.number().int().optional(), vin: z.string().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  allLoansIncluded: z.boolean().optional(), ordinaryPrincipalMethodConfirmed: z.boolean().optional(), sameOriginalBorrowerConfirmed: z.boolean().optional(),
  originalLoan: z.object({ ...loanSource, qualifiedPurchaseCosts: amount, otherPurchaseCosts: amount, downPayment: amount }).optional(),
  refinancings: z.array(z.object({ ...loanSource, previousLoanSourceId: z.string().optional(), previousOutstandingPrincipal: amount })).optional(),
});
export type VehicleRefinancingSources = z.infer<typeof VehicleRefinancingSourcesSchema>;
