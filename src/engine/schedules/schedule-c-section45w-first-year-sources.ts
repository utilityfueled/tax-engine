/** Spec: spec/federal/schedule-c-section45w-first-year-2026.yaml. */
import type Decimal from "decimal.js";
import { calculateSection45WFirstYearDepreciation2026 } from "@/engine/forms/form-4562-section45w-first-year-2026.js";
import { CommercialCleanVehicle2026SourceSchema, type TaxYearInput } from "@/models/inputs.js";
import { ScheduleCSection45WFirstYearSchema } from "@/models/schedule-c-section45w-first-year.js";
import { assertSection45WScheduleCOwnerLedger, requireSection45WScheduleCCashActivity } from "./schedule-c-section45w-cash-sources.js";
import type { ScheduleCInput } from "./schedule-c.js";

export function calculateScheduleCSection45WFirstYear(
  input: TaxYearInput,
  selectedBusiness: ScheduleCInput | undefined,
  careBenefitAdjustment?: Decimal,
): ReturnType<typeof calculateSection45WFirstYearDepreciation2026> | undefined {
  const original = input.scheduleC?.sourceFacts?.section45WFirstYear;
  if (original === undefined && selectedBusiness?.sourceFacts?.section45WFirstYear === undefined) return undefined;

  const { business, proof } = requireSection45WScheduleCCashActivity(input, selectedBusiness, careBenefitAdjustment);
  const claims = input.form8936;
  if (!claims || claims.commercialCleanVehicles?.length !== 1 || claims.newCleanVehicles.length || claims.previouslyOwnedCleanVehicles.length) {
    throw new Error("Section 45W depreciation requires one matching original commercial vehicle claim.");
  }

  const parsed = ScheduleCSection45WFirstYearSchema.safeParse(original);
  if (!parsed.success) throw new Error("Original Section 45W Schedule C owner, ledger or first-year workpapers are incomplete.");
  const { owner, ledger, workpaper } = parsed.data;
  const result = calculateSection45WFirstYearDepreciation2026(workpaper);
  const { activity, claim, vehicle } = workpaper.basis;
  const canonicalVehicle = CommercialCleanVehicle2026SourceSchema.safeParse(claims.commercialCleanVehicles[0]);
  if (claim.position !== "direct_claim" || !canonicalVehicle.success
    || Object.entries(canonicalVehicle.data).some(([key, value]) => value !== vehicle[key as keyof typeof vehicle])) {
    throw new Error("The original Section 45W depreciation records must match the single prepared commercial vehicle claim.");
  }

  assertSection45WScheduleCOwnerLedger(input, business, proof, owner, ledger, activity);
  return result;
}
