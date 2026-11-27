import { z } from "zod";
import type { calculateSection45WFirstYearDepreciation2026 } from "@/engine/forms/form-4562-section45w-first-year-2026.js";

type FirstYearWorkpaper = Parameters<typeof calculateSection45WFirstYearDepreciation2026>[0];

export const SECTION45W_OPERATING_EXPENSES = ["advertising", "officeExpense", "supplies"] as const;
const reference = z.string().refine(value => value.trim().length > 0);
const money = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/u);
const originalRecord = (value: unknown): boolean => typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;

export const ScheduleCSection45WFirstYearSchema = z.strictObject({
  // The existing first-year calculator validates both original records, including their linked facts.
  workpaper: z.strictObject({
    basis: z.custom<FirstYearWorkpaper["basis"]>(originalRecord),
    depreciation: z.custom<FirstYearWorkpaper["depreciation"]>(originalRecord),
  }),
  owner: z.strictObject({
    firstName: reference,
    lastName: reference,
    tin: z.string().regex(/^(?:\d{9}|\d{3}-\d{2}-\d{4})$/u),
    taxpayerReference: reference,
    originalRecordReference: reference,
    identityComparedToVehicleAndTaxReturnConfirmed: z.literal(true),
  }),
  ledger: z.strictObject({
    originalRecordReference: reference,
    activityReference: reference,
    businessName: reference.nullable(),
    businessEin: z.string().regex(/^\d{2}-?\d{7}$/u).nullable(),
    grossReceipts: money,
    expenses: z.record(z.enum(SECTION45W_OPERATING_EXPENSES), money),
    completeAndReconciledConfirmed: z.literal(true),
    excludesVehicleCostsAndOtherActivitiesConfirmed: z.literal(true),
  }),
});
