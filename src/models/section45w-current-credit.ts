import { z } from "zod";

const reference = z.string().refine(value => value.trim().length > 0);
const basisAmount = z.string().regex(/^\d{1,12}(?:\.\d{1,3})?$/u);
const original = {
  taxpayerReference: reference,
  originalRecordReference: reference,
};

export const Section45WCurrentCreditSchema = z.strictObject({
  taxYear: z.literal(2026),
  participation: z.strictObject({
    ...original,
    activityReference: reference,
    actualHours: z.string().regex(/^\d{1,4}(?:\.\d{1,3})?$/u),
    actualOwnerHoursComparedAndConfirmed: z.literal(true),
    noPassiveOrFormerPassiveActivityCreditsConfirmed: z.literal(true),
  }),
  amtDepreciation: z.strictObject({
    ...original,
    activityReference: reference,
    assetReference: reference,
    vin: z.string().refine(value => /^[A-HJ-NPR-Z0-9]{17}$/iu.test(value.trim())),
    placedInServiceDate: z.iso.date(),
    regularAdjustedBasis: basisAmount,
    amtAdjustedBasis: basisAmount,
    qualifiedSection168PropertyAndEqualBasesConfirmed: z.literal(true),
  }),
  creditInventory: z.strictObject({
    ...original,
    noOtherCurrentPassiveOrCarryCreditsConfirmed: z.literal(true),
    noPriorMinimumTaxCreditConfirmed: z.literal(true),
  }),
});
