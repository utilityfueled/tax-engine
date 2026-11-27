import { z } from "zod";
import { Section45WSecondYearWorkpaperSchema } from "@/engine/forms/form-4562-section45w-second-year-2026.js";
import { Section45WScheduleCLedgerSchema, Section45WScheduleCOwnerSchema } from "./schedule-c-section45w-first-year.js";

const reference = z.string().refine(value => value.trim().length > 0);
const exactAmount = z.string().regex(/^\d{1,12}(?:\.\d{1,5})?$/u);

export const ScheduleCSection45WSecondYearSchema = z.strictObject({
  workpaper: Section45WSecondYearWorkpaperSchema,
  owner: Section45WScheduleCOwnerSchema,
  ledger: Section45WScheduleCLedgerSchema,
  activity: z.strictObject({
    taxpayerReference: reference,
    activityReference: reference,
    originalRecordReference: reference,
    principalBusinessActivity: reference,
    businessCode: z.string().regex(/^\d{6}$/u),
    currentAssetRecordReference: reference,
    originalComparedAndConfirmed: z.literal(true),
  }),
  participation: z.strictObject({
    taxpayerReference: reference,
    activityReference: reference,
    sourceReference: reference,
    fromDate: z.literal("2026-01-01"),
    throughDate: z.literal("2026-12-31"),
    actualHours: z.string().regex(/^\d{1,4}(?:\.\d{1,2})?$/u),
    originalComparedAndConfirmed: z.literal(true),
  }),
  amt: z.strictObject({
    taxpayerReference: reference,
    activityReference: reference,
    assetReference: reference,
    vin: z.string().trim().regex(/^[A-HJ-NPR-Z0-9]{17}$/iu),
    placedInServiceDate: z.string(),
    sourceReference: reference,
    priorAssetRecordReference: reference,
    currentAssetRecordReference: reference,
    priorTableBasis: exactAmount,
    priorAllowedDepreciation: exactAmount,
    priorAllowableDepreciation: exactAmount,
    currentOpeningBasis: exactAmount,
    originalQualifiedSection168PropertyConfirmed: z.literal(true),
    originalAndCurrentAmtRecordsComparedConfirmed: z.literal(true),
  }),
});
