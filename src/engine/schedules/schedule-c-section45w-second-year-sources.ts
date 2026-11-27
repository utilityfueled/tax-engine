/** Spec: spec/federal/schedule-c-section45w-second-year-2026.yaml. */
import type Decimal from "decimal.js";
import { calculateSection45WSecondYearDepreciation2026 } from "@/engine/forms/form-4562-section45w-second-year-2026.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { ScheduleCSection45WSecondYearSchema } from "@/models/schedule-c-section45w-second-year.js";
import { currentLocalCivilDate, isActualDate } from "@/utils/civil-date.js";
import { d } from "@/utils/decimal.js";
import { assertSection45WScheduleCOwnerLedger, requireSection45WScheduleCCashActivity } from "./schedule-c-section45w-cash-sources.js";
import type { ScheduleCInput } from "./schedule-c.js";

export function calculateScheduleCSection45WSecondYear(
  input: TaxYearInput,
  selectedBusiness: ScheduleCInput | undefined,
  options: { asOfDate?: string; careBenefitAdjustment?: Decimal },
): ReturnType<typeof calculateSection45WSecondYearDepreciation2026> | undefined {
  const original = input.scheduleC?.sourceFacts?.section45WSecondYear;
  if (original === undefined && selectedBusiness?.sourceFacts?.section45WSecondYear === undefined) return undefined;
  if (!options.asOfDate || !isActualDate(options.asOfDate) || options.asOfDate > currentLocalCivilDate()) {
    throw new Error("Second-year Section 45W depreciation requires a valid calculation as-of date on or before today.");
  }
  const { business, proof } = requireSection45WScheduleCCashActivity(input, selectedBusiness, options.careBenefitAdjustment);
  if (proof.section45WFirstYear || input.form8936 || input.form4797 || input.form3800
    || !d(input.priorYear?.generalBusinessCreditCarryforward).isZero()) {
    throw new Error("Second-year Section 45W depreciation requires the continuing asset without a competing vehicle credit or disposition.");
  }
  const penaltyFacts = input.form2210;
  if (penaltyFacts?.priorYearTaxStatus === "no-return" || penaltyFacts?.priorYearFullYear === false
    || penaltyFacts?.priorYearJointReturn === true || penaltyFacts?.calendarYearTaxpayer === false) {
    throw new Error("Second-year Section 45W evidence conflicts with the recorded calendar-year return status.");
  }
  const parsed = ScheduleCSection45WSecondYearSchema.safeParse(original);
  if (!parsed.success) throw new Error("Original second-year Section 45W Schedule C and annual workpapers are incomplete.");
  const { owner, ledger, activity, participation, amt, workpaper } = parsed.data;
  const { currentAsset, priorDepreciation } = workpaper;
  assertSection45WScheduleCOwnerLedger(input, business, proof, owner, ledger, activity);
  if (activity.taxpayerReference !== currentAsset.taxpayerReference || activity.activityReference !== currentAsset.activityReference
    || activity.currentAssetRecordReference !== currentAsset.sourceReference) {
    throw new Error("Second-year Section 45W depreciation must match the retained asset and actual current activity originals.");
  }
  if (business.qbiMateriallyParticipated !== true || participation.taxpayerReference !== activity.taxpayerReference
    || participation.activityReference !== activity.activityReference
    || d(participation.actualHours).lte(500) || d(participation.actualHours).gt(8760)) {
    throw new Error("Second-year Section 45W depreciation requires the original 2026 owner participation record.");
  }

  const result = calculateSection45WSecondYearDepreciation2026(workpaper, { asOfDate: options.asOfDate });
  if (amt.taxpayerReference !== currentAsset.taxpayerReference || amt.activityReference !== currentAsset.activityReference
    || amt.assetReference !== currentAsset.assetReference || amt.vin.toUpperCase() !== currentAsset.vin.trim().toUpperCase()
    || amt.placedInServiceDate !== currentAsset.placedInServiceDate || amt.priorAssetRecordReference !== priorDepreciation.sourceReference
    || amt.currentAssetRecordReference !== currentAsset.sourceReference || !result.tableBasisAfterCredit.eq(amt.priorTableBasis)
    || !result.verifiedDepreciation2025.eq(amt.priorAllowedDepreciation)
    || !result.verifiedDepreciation2025.eq(amt.priorAllowableDepreciation)
    || !result.openingAdjustedBasis.eq(amt.currentOpeningBasis)) {
    throw new Error("Second-year Section 45W depreciation requires matching original annual AMT basis and depreciation.");
  }
  return result;
}
