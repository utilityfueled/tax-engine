/** Bind the 2026 ordinary direct credit to the depreciation actually used on Schedule C. */
import type Decimal from "decimal.js";
import type { ScheduleCResult } from "@/engine/schedules/schedule-c.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { Section45WCurrentCreditSchema } from "@/models/section45w-current-credit.js";
import { d } from "@/utils/decimal.js";

export function prepareSection45WCurrentYearCredit(input: TaxYearInput, scheduleC: ScheduleCResult): Decimal | undefined {
  const source = input.form8936?.commercialCleanVehicleCurrentCredit;
  if (source === undefined) return undefined;
  const parsed = Section45WCurrentCreditSchema.safeParse(source);
  if (!parsed.success) throw new Error("Original Section 45W annual participation, AMT basis and credit inventory evidence is incomplete.");

  const workpaper = input.scheduleC?.sourceFacts?.section45WFirstYear?.workpaper;
  const regularBasis = scheduleC.lines.filter(line => line.form === "Form 4562" && line.line === "basis-after-section45w");
  if (input.taxpayer.taxYear !== 2026 || !workpaper || workpaper.basis.claim.position !== "direct_claim" || regularBasis.length !== 1) {
    throw new Error("Current Section 45W credit requires its verified Schedule C depreciation workpaper.");
  }

  const { participation, amtDepreciation, creditInventory } = parsed.data;
  const hours = d(participation.actualHours);
  if (hours.lte(500) || hours.gt(8760)) {
    throw new Error("Current Section 45W credit requires more than 500 logged hours of actual annual owner participation within the calendar year.");
  }
  if (input.scheduleC?.qbiMateriallyParticipated === false) {
    throw new Error("Current Section 45W participation evidence contradicts the existing Schedule C participation answer.");
  }
  const { activity, depreciationAsset, vehicle } = workpaper.basis;
  if ([participation, amtDepreciation, creditInventory].some(record => record.taxpayerReference !== activity.taxpayerReference)
    || participation.activityReference !== activity.activityReference || amtDepreciation.activityReference !== activity.activityReference) {
    throw new Error("Current Section 45W evidence must match the same taxpayer and Schedule C activity.");
  }
  if (amtDepreciation.assetReference !== depreciationAsset.originalRecordReference
    || amtDepreciation.vin.trim().toUpperCase() !== vehicle.vin.trim().toUpperCase()
    || amtDepreciation.placedInServiceDate !== vehicle.datePlacedInService) {
    throw new Error("Current Section 45W AMT evidence must match the same original vehicle asset.");
  }
  if (!regularBasis[0].value.eq(amtDepreciation.regularAdjustedBasis) || !regularBasis[0].value.eq(amtDepreciation.amtAdjustedBasis)) {
    throw new Error("Current Section 45W credit requires equal actual regular and AMT bases after the verified basis reduction.");
  }
  return d(workpaper.basis.claim.line26Amount);
}
