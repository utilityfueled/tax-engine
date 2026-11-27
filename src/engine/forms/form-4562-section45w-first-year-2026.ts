/** Private first-year workpaper for the commercial clean vehicle basis path. */
import Decimal from "decimal.js";
import { z } from "zod";
import { reconcileSection45WVehicleBasis2026 } from "@/engine/forms/form-4562-section45w-basis-reconciliation-2026.js";
import {
  MACRS_GDS_200DB_HALF_YEAR,
  MACRS_GDS_200DB_MID_QUARTER,
  SECTION_280F_LIMITS,
} from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar } from "@/utils/decimal.js";

const reference = z.string().refine(value => value.trim().length > 0);
const mileage = z.string().regex(/^\d{1,8}(?:\.\d{1,3})?$/u);
const weight = z.number().int().positive();
const depreciationOriginals = z.strictObject({
  taxYear: z.literal(2026),
  owner: z.literal("primary"),
  taxpayerReference: reference,
  activityReference: reference,
  assetReference: reference,
  vin: z.string().refine(value => /^[A-HJ-NPR-Z0-9]{17}$/iu.test(value.trim())),
  placedInServiceDate: z.iso.date(),
  inventoryReference: reference,
  onlyAssetPlacedInServiceConfirmed: z.literal(true),
  fullCalendarYearConfirmed: z.literal(true),
  classification: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("car"), unloadedGrossWeightPounds: weight, manufacturerRecordReference: reference }),
    z.strictObject({ kind: z.literal("truck_or_van"), grossVehicleWeightRatingPounds: weight, manufacturerRecordReference: reference }),
  ]),
  acquisition: z.strictObject({
    contractReference: reference,
    signedDate: z.iso.date(),
    enforceableDate: z.iso.date(),
    cancellationRightsExpiredDate: z.iso.date().nullable(),
    contingenciesSatisfiedDate: z.iso.date().nullable(),
    writtenBindingContractTermsConfirmed: z.literal(true),
  }),
  mileage: z.strictObject({
    logReference: reference,
    qualifiedBusinessMiles: mileage,
    totalMiles: mileage,
    contemporaneousFullUseConfirmed: z.literal(true),
  }),
  bonus: z.discriminatedUnion("treatment", [
    z.strictObject({ treatment: z.literal("claim"), rate: z.enum(["20_percent", "100_percent"]), decisionReference: reference }),
    z.strictObject({
      treatment: z.literal("elected_out"),
      electionTaxYear: z.literal(2026),
      electionClass: z.literal("5_year"),
      filedClassElectionConfirmed: z.literal(true),
      decisionReference: reference,
    }),
  ]),
  qualificationReference: reference,
  purchasedNewOriginalUseConfirmed: z.literal(true),
  ordinaryListedTransportationConfirmed: z.literal(true),
  fiveYearGds200DecliningBalanceConfirmed: z.literal(true),
  noPassengerAutomobileExceptionConfirmed: z.literal(true),
  noAdsOrAlternativeMacrsMethodConfirmed: z.literal(true),
  noOtherBasisAdjustmentsOrDeductionsConfirmed: z.literal(true),
  noDispositionOrUseChangeConfirmed: z.literal(true),
  noReducedRateTransitionElectionConfirmed: z.literal(true),
});

interface FirstYearInput {
  basis: Parameters<typeof reconcileSection45WVehicleBasis2026>[0];
  depreciation: z.input<typeof depreciationOriginals>;
}

interface FirstYearResult {
  basisAfterSection45WAdjustment: Decimal;
  line25: Decimal;
  line26h: Decimal;
  line28: Decimal;
  lines: CalculatedLine[];
}

export function calculateSection45WFirstYearDepreciation2026(input: FirstYearInput): FirstYearResult {
  const basis = reconcileSection45WVehicleBasis2026(input.basis);
  const parsed = depreciationOriginals.safeParse(input.depreciation);
  if (!parsed.success) throw new Error("Original 2026 §45W depreciation evidence is incomplete or outside the first-year workpaper.");

  const source = parsed.data;
  const { vehicle, depreciationAsset } = input.basis;
  const { acquisition, classification, bonus } = source;
  if (source.taxpayerReference !== depreciationAsset.taxpayerReference
    || source.activityReference !== depreciationAsset.activityReference
    || source.assetReference !== depreciationAsset.originalRecordReference
    || source.vin.trim().toUpperCase() !== vehicle.vin.trim().toUpperCase()
    || source.placedInServiceDate !== vehicle.datePlacedInService
    || acquisition.contractReference !== vehicle.bindingContractReference
    || acquisition.signedDate !== vehicle.bindingContractDate) {
    throw new Error("Original 2026 §45W depreciation evidence must match the original Schedule C asset, vehicle and contract.");
  }
  if (input.basis.claim.position === "direct_claim" && acquisition.enforceableDate > "2025-09-30") {
    throw new Error("Original 2026 §45W depreciation contract was not enforceable by the direct credit cutoff.");
  }
  const totalMiles = d(source.mileage.totalMiles);
  if (totalMiles.lte(0) || !totalMiles.eq(source.mileage.qualifiedBusinessMiles)) {
    throw new Error("Original 2026 §45W depreciation requires an actual mileage log documenting exclusive qualified business use.");
  }

  const isCar = classification.kind === "car";
  const applicableWeight = isCar ? classification.unloadedGrossWeightPounds : classification.grossVehicleWeightRatingPounds;
  if (isCar ? applicableWeight > vehicle.grossVehicleWeightRatingPounds : applicableWeight !== vehicle.grossVehicleWeightRatingPounds) {
    throw new Error("Original 2026 §45W depreciation manufacturer weight conflicts with the vehicle record.");
  }
  const passenger = applicableWeight <= 6000;

  const contractDates = [acquisition.enforceableDate, acquisition.cancellationRightsExpiredDate, acquisition.contingenciesSatisfiedDate];
  let bonusAcquisitionDate = acquisition.signedDate;
  for (const date of contractDates) {
    if (date === null) continue;
    if (date < acquisition.signedDate || date > vehicle.datePlacedInService) {
      throw new Error("Original 2026 §45W depreciation bonus acquisition date conflicts with the contract or service date.");
    }
    if (date > bonusAcquisitionDate) bonusAcquisitionDate = date;
  }
  const permanentBonus = bonusAcquisitionDate >= "2025-01-20";
  const bonusClaimed = bonus.treatment === "claim";
  if (bonusClaimed && (bonusAcquisitionDate <= "2017-09-27" || bonus.rate !== (permanentBonus ? "100_percent" : "20_percent"))) {
    throw new Error("Original 2026 §45W depreciation bonus rate conflicts with the verified acquisition date.");
  }

  const adjustedBasis = basis.basisAfterSection45WAdjustment;
  const bonusRate = d(bonusClaimed ? (permanentBonus ? "1" : "0.20") : "0");
  const tentativeBonus = adjustedBasis.times(bonusRate);
  const limits = SECTION_280F_LIMITS[2026];
  const cap = passenger ? (bonusClaimed ? limits.withBonus[0] : limits.withoutBonus[0]) : null;
  const roundedBonus = roundDollar(tentativeBonus);
  const line25 = cap ? Decimal.min(roundedBonus, cap) : roundedBonus;
  const midQuarter = source.placedInServiceDate >= "2026-10-01" && adjustedBasis.gt(0);
  const regularPercentage = midQuarter ? MACRS_GDS_200DB_MID_QUARTER[4][5][0] : MACRS_GDS_200DB_HALF_YEAR[5][0];

  const audit = new AuditTrail();
  audit.record("Form 4562", "25", "Special depreciation allowance for listed property", line25,
    "First-year bonus using the original acquisition date and available passenger limit", {
      "Tentative special allowance": tentativeBonus,
      "Applicable bonus rate": bonusRate,
    });
  let line26h = d(0);
  if (cap === null || line25.lt(cap)) {
    const regularBasis = adjustedBasis.minus(tentativeBonus);
    const roundedRegular = roundDollar(regularBasis.times(regularPercentage).div(100));
    line26h = cap ? Decimal.min(roundedRegular, cap.minus(line25)) : roundedRegular;
    audit.record("Form 4562", "26(e)", "Basis for regular listed-property depreciation", regularBasis,
      "Business basis after the verified commercial credit and exact special allowance");
  }
  audit.record("Form 4562", "26(h)", "Regular first-year listed-property depreciation", line26h,
    "Five-year GDS with the verified convention and remaining passenger limit", { "Applicable MACRS percentage": regularPercentage });
  const line28 = line25.plus(line26h);
  audit.record("Form 4562", "28", "Total first-year listed-property depreciation", line28,
    "Add special and regular depreciation once", { "Special depreciation": line25, "Regular depreciation": line26h });
  return { basisAfterSection45WAdjustment: adjustedBasis, line25, line26h, line28, lines: [...basis.lines, ...audit.getLines()] };
}
