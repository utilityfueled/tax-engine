import { z } from "zod";

const reference = z.string().refine(value => value.trim().length > 0);
const basisAmount = z.string().regex(/^\d{1,12}(?:\.\d{1,3})?$/u);
// The ordinary 25% limitation can produce fractions of a cent.
const priorDerivedAmount = z.string().regex(/^\d{1,12}(?:\.\d{1,4})?$/u);
const original = {
  taxpayerReference: reference,
  originalRecordReference: reference,
};

export const Section45WPriorYearWorkpaperSchema = z.strictObject({
  taxYear: z.literal(2025),
  filingStatus: z.literal("single"),
  samePrimaryTaxpayerAndCalendarYearConfirmed: z.literal(true),
  filedReturnReference: reference,
  section38LimitationReference: reference,
  priorityCreditOrderingReference: reference,
  section39CapacityVerifiedConfirmed: z.literal(true),
  onlyOrdinarySection38PriorityCreditsConfirmed: z.literal(true),
  excludesProposedCarrybackConfirmed: z.literal(true),
  section38Limitation: priorDerivedAmount,
  section38CarryforwardAndCurrentCredits: priorDerivedAmount,
  // No source tax year falls between these consecutive calendar tax years.
  earlierSourceYearCarrybacks: z.string().regex(/^0{1,12}(?:\.0{1,4})?$/u),
});

export type Section45WPriorYearWorkpaper = z.infer<typeof Section45WPriorYearWorkpaperSchema>;

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
  priorYearCarryback: Section45WPriorYearWorkpaperSchema.extend({
    taxpayerReference: reference,
    filedReturnTaxpayerTin: z.string().refine(value => /^\d{9}$/u.test(value.replace(/[-\s]/gu, ""))),
    filedReturnDate: z.iso.date(),
  }).optional(),
});
