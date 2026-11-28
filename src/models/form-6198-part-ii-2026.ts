import { z } from "zod";

const sourceText = z.string().trim().min(1);
const nonnegativeAmount = z.string().regex(/^\d+(?:\.\d{1,2})?$/);

/** Original workpaper entries for the ordinary partnership source lane. */
export const Form6198PartII2026Schema = z.object({
  taxYear: z.literal(2026),
  activityName: sourceText,
  entityEin: z.string().trim().regex(/^\d{2}-?\d{7}$/),
  accountHolder: z.enum(["primary", "spouse"]),
  recipientName: sourceText,
  recipientTaxpayerIdLast4: z.string().regex(/^\d{4}$/),
  originalK1Reference: sourceText,
  openingBasisReference: sourceText,
  changeWorksheetReference: sourceText,
  ordinaryNonpassivePartIIConfirmed: z.literal(true),
  noPriorAtRiskLossOrRecaptureConfirmed: z.literal(true),
  noQbiOrSelfEmploymentAmountsConfirmed: z.literal(true),
  box1Loss: z.string().regex(/^-\d+(?:\.\d{1,2})?$/),
  openingAdjustedBasis: nonnegativeAmount,
  increases: nonnegativeAmount,
  decreases: nonnegativeAmount,
}).strict();
