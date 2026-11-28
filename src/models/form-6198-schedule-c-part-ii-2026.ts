import { z } from "zod";

const sourceText = z.string().trim().min(1);
const nonnegativeAmount = z.string().regex(/^\d+(?:\.\d+)?$/);

export const Form6198ScheduleCPartII2026Schema = z.strictObject({
  taxYear: z.literal(2026),
  accountHolder: z.literal("primary"),
  primaryOwnerName: sourceText,
  primaryOwnerTaxpayerIdLast4: z.string().regex(/^\d{4}$/),
  activityDescription: sourceText,
  originalScheduleCReference: sourceText,
  continuingDomesticSoleProprietorshipConfirmed: z.literal(true),
  oneOrdinaryScheduleCLossOnlyConfirmed: z.literal(true),
  noPriorAtRiskLossOrRecaptureConfirmed: z.literal(true),
  completePartIIOriginalsConfirmed: z.literal(true),
  currentOrdinaryLoss: z.string().regex(/^-\d+(?:\.\d+)?$/),
  openingBasisReference: sourceText,
  openingAdjustedAssetBasisBeforeLiabilities: nonnegativeAmount,
  increasesReference: sourceText,
  increases: nonnegativeAmount,
  decreasesReference: sourceText,
  decreases: nonnegativeAmount,
});

export type Form6198ScheduleCPartII2026Input = z.infer<typeof Form6198ScheduleCPartII2026Schema>;

/** Independently verified current-return identity and business evidence. */
export interface Form6198ScheduleCPartII2026Context {
  taxYear: number;
  primaryOwner: { firstName: string; lastName: string; ssn: string };
  business?: {
    accountHolder?: "primary" | "spouse";
    activityDescription?: string;
    originalScheduleCReference?: string;
    materiallyParticipated?: boolean;
    allInvestmentAtRisk?: boolean;
  };
}
