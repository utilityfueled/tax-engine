/**
 * Form 8936 — Clean Vehicle Credits
 * Spec: spec/federal/form-8936.yaml
 *
 * Computes the new clean vehicle credit (IRC §30D) and previously owned
 * clean vehicle credit (IRC §25E) for personal-use vehicles. Both credits
 * are nonrefundable and flow to Schedule 3.
 *
 * AGI eligibility uses the lesser of current-year or prior-year modified
 * AGI. The previously owned credit is computed before the new vehicle
 * credit in the credit ordering stack.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

export interface Form8936Input {
  filingStatus: FilingStatus;
  agi: Decimal | string;
  constants: YearConstants["cleanVehicleCredit"];
  /** Per-vehicle new clean vehicle claims */
  newCleanVehicles: Array<{
    dateAcquired: string;
    criticalMineralsRequirementMet: boolean;
    batteryComponentsRequirementMet: boolean;
    msrp: Decimal | string;
    vehicleType: "suv_van_pickup" | "other";
    personalUsePercentage: Decimal | string;
    creditTransferredToDealer: boolean;
  }>;
  /** Per-vehicle previously owned clean vehicle claims */
  previouslyOwnedCleanVehicles: Array<{
    dateAcquired: string;
    salePrice: Decimal | string;
    personalUsePercentage: Decimal | string;
    creditTransferredToDealer: boolean;
  }>;
  /** Prior-year AGI for lesser-of-two-years MAGI check */
  priorYearAgi?: Decimal | string;
  /** Foreign earned income exclusion (Form 2555) — current year */
  foreignEarnedIncomeExclusion?: Decimal | string;
  /** Foreign housing deduction (Form 2555) — current year */
  foreignHousingDeduction?: Decimal | string;
  /** Foreign earned income exclusion — prior year */
  priorYearForeignEarnedIncomeExclusion?: Decimal | string;
  /** Foreign housing deduction — prior year */
  priorYearForeignHousingDeduction?: Decimal | string;
}

export interface NewVehicleCreditDetail {
  maxCredit: Decimal;
  personalCredit: Decimal;
  disqualified: boolean;
  disqualificationReason?: string;
}

export interface PreviouslyOwnedCreditDetail {
  rawCredit: Decimal;
  personalCredit: Decimal;
  disqualified: boolean;
  disqualificationReason?: string;
}

export interface Form8936Result {
  /** Part I: MAGI used for eligibility (lesser of current/prior year) */
  magi: Decimal;
  currentYearMagi: Decimal;
  priorYearMagi: Decimal;
  /** Per-vehicle new clean vehicle credit details */
  newVehicleDetails: NewVehicleCreditDetail[];
  /** Total personal-use new clean vehicle credits (Line 9) */
  totalNewVehicleCredit: Decimal;
  /** Per-vehicle previously owned credit details */
  previouslyOwnedDetails: PreviouslyOwnedCreditDetail[];
  /** Total previously owned clean vehicle credits (Line 14) */
  totalPreviouslyOwnedCredit: Decimal;
  /** Whether the taxpayer is AGI-disqualified for new vehicles */
  newVehicleAgiDisqualified: boolean;
  /** Whether the taxpayer is AGI-disqualified for previously owned vehicles */
  previouslyOwnedAgiDisqualified: boolean;
  lines: CalculatedLine[];
}

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);
const CLEAN_VEHICLE_ACQUISITION_CUTOFF = "2025-09-30";

function isAcquiredAfterCleanVehicleCutoff(dateAcquired: string): boolean {
  return dateAcquired > CLEAN_VEHICLE_ACQUISITION_CUTOFF;
}

export function calculateForm8936(input: Form8936Input): Form8936Result {
  const audit = new AuditTrail();
  const { constants: cv } = input;

  // ── Part I: Modified AGI ────────────────────────────────
  const agi = new Decimal(d(input.agi));
  const foreignExclusion = d(input.foreignEarnedIncomeExclusion);
  const foreignHousing = d(input.foreignHousingDeduction);
  const currentYearMagi = agi.plus(foreignExclusion).plus(foreignHousing);

  const priorAgi = d(input.priorYearAgi);
  const priorForeignExclusion = d(input.priorYearForeignEarnedIncomeExclusion);
  const priorForeignHousing = d(input.priorYearForeignHousingDeduction);
  const priorYearMagi = priorAgi.plus(priorForeignExclusion).plus(priorForeignHousing);

  // Use lesser of current or prior year MAGI; if no prior year provided, use current
  const hasPriorYear = !priorAgi.isZero() || !priorForeignExclusion.isZero() || !priorForeignHousing.isZero();
  const magi = hasPriorYear ? Decimal.min(currentYearMagi, priorYearMagi) : currentYearMagi;

  audit.record("Form 8936", "2", "Current-year modified AGI", currentYearMagi,
    "AGI + foreign earned income exclusion + foreign housing deduction", {
      "AGI": agi,
      "Foreign earned income exclusion": foreignExclusion,
      "Foreign housing deduction": foreignHousing,
    });

  if (hasPriorYear) {
    audit.record("Form 8936", "4", "Prior-year modified AGI", priorYearMagi,
      "Prior-year AGI + prior-year foreign earned income exclusion + prior-year foreign housing deduction", {
        "Prior-year AGI": priorAgi,
        "Prior-year foreign earned income exclusion": priorForeignExclusion,
        "Prior-year foreign housing deduction": priorForeignHousing,
      });
  }

  audit.record("Form 8936", "5", "MAGI for eligibility", magi,
    hasPriorYear ? "Lesser of current-year or prior-year MAGI" : "Current-year MAGI (no prior-year data provided)", {
      "Current-year MAGI": currentYearMagi,
      ...(hasPriorYear ? { "Prior-year MAGI": priorYearMagi } : {}),
    });

  // ── AGI threshold checks ───────────────────────────────
  const newVehicleMagiLimit = cv.newVehicle.magiLimit[input.filingStatus];
  const newVehicleAgiDisqualified = magi.greaterThan(newVehicleMagiLimit);

  const previouslyOwnedMagiLimit = cv.previouslyOwned.magiLimit[input.filingStatus];
  const previouslyOwnedAgiDisqualified = magi.greaterThan(previouslyOwnedMagiLimit);

  // ── New Clean Vehicle Credits (IRC §30D) ────────────────
  const newVehicleDetails: NewVehicleCreditDetail[] = [];
  let totalNewVehicleCredit = ZERO;

  for (let i = 0; i < input.newCleanVehicles.length; i++) {
    const vehicle = input.newCleanVehicles[i];
    const msrp = Decimal.max(ZERO, d(vehicle.msrp));
    const personalPct = Decimal.min(HUNDRED, Decimal.max(ZERO, d(vehicle.personalUsePercentage)));
    const msrpLimit = vehicle.vehicleType === "suv_van_pickup"
      ? cv.newVehicle.msrpLimitSuvVanPickup
      : cv.newVehicle.msrpLimitOther;

    let disqualified = false;
    let disqualificationReason: string | undefined;

    if (isAcquiredAfterCleanVehicleCutoff(vehicle.dateAcquired)) {
      disqualified = true;
      disqualificationReason = `Vehicle acquired after ${CLEAN_VEHICLE_ACQUISITION_CUTOFF}`;
    } else if (vehicle.creditTransferredToDealer) {
      disqualified = true;
      disqualificationReason = "Credit transferred to dealer at point of sale";
    } else if (newVehicleAgiDisqualified) {
      disqualified = true;
      disqualificationReason = `MAGI ${magi} exceeds ${input.filingStatus} threshold ${newVehicleMagiLimit}`;
    } else if (msrp.greaterThan(msrpLimit)) {
      disqualified = true;
      disqualificationReason = `MSRP ${msrp} exceeds ${vehicle.vehicleType === "suv_van_pickup" ? "SUV/van/pickup" : "other vehicle"} limit ${msrpLimit}`;
    }

    const criticalMineralsCredit = vehicle.criticalMineralsRequirementMet
      ? cv.newVehicle.criticalMineralsCredit : ZERO;
    const batteryCredit = vehicle.batteryComponentsRequirementMet
      ? cv.newVehicle.batteryComponentsCredit : ZERO;
    const maxCredit = criticalMineralsCredit.plus(batteryCredit);
    const personalCredit = disqualified ? ZERO : maxCredit.times(personalPct).dividedBy(HUNDRED).floor();

    newVehicleDetails.push({ maxCredit, personalCredit, disqualified, disqualificationReason });
    totalNewVehicleCredit = totalNewVehicleCredit.plus(personalCredit);

    const vehicleLabel = `Vehicle ${i + 1}`;
    audit.record("Form 8936", `NV-${i + 1}`, `New clean vehicle credit — ${vehicleLabel}`, personalCredit,
      disqualified
        ? `Disqualified: ${disqualificationReason}`
        : `(${criticalMineralsCredit} minerals + ${batteryCredit} battery) × ${personalPct}% personal use`,
      {
        "Date acquired": vehicle.dateAcquired,
        "Critical minerals requirement met": vehicle.criticalMineralsRequirementMet ? "Yes" : "No",
        "Battery components requirement met": vehicle.batteryComponentsRequirementMet ? "Yes" : "No",
        "Maximum credit": maxCredit,
        "MSRP": msrp,
        "MSRP limit": msrpLimit,
        "Personal use %": personalPct,
        "Credit transferred to dealer": vehicle.creditTransferredToDealer ? "Yes" : "No",
      });
  }

  audit.record("Form 8936", "9", "Total personal-use new clean vehicle credits", totalNewVehicleCredit,
    `Sum of ${input.newCleanVehicles.length} new vehicle credit(s)`);

  // ── Previously Owned Clean Vehicle Credits (IRC §25E) ───
  const previouslyOwnedDetails: PreviouslyOwnedCreditDetail[] = [];
  let totalPreviouslyOwnedCredit = ZERO;

  for (let i = 0; i < input.previouslyOwnedCleanVehicles.length; i++) {
    const vehicle = input.previouslyOwnedCleanVehicles[i];
    const salePrice = Decimal.max(ZERO, d(vehicle.salePrice));
    const personalPct = Decimal.min(HUNDRED, Decimal.max(ZERO, d(vehicle.personalUsePercentage)));

    let disqualified = false;
    let disqualificationReason: string | undefined;

    if (isAcquiredAfterCleanVehicleCutoff(vehicle.dateAcquired)) {
      disqualified = true;
      disqualificationReason = `Vehicle acquired after ${CLEAN_VEHICLE_ACQUISITION_CUTOFF}`;
    } else if (vehicle.creditTransferredToDealer) {
      disqualified = true;
      disqualificationReason = "Credit transferred to dealer at point of sale";
    } else if (previouslyOwnedAgiDisqualified) {
      disqualified = true;
      disqualificationReason = `MAGI ${magi} exceeds ${input.filingStatus} threshold ${previouslyOwnedMagiLimit}`;
    } else if (salePrice.greaterThan(cv.previouslyOwned.maxSalePrice)) {
      disqualified = true;
      disqualificationReason = `Sale price ${salePrice} exceeds $${cv.previouslyOwned.maxSalePrice} limit`;
    }

    const rawCredit = disqualified
      ? ZERO
      : Decimal.min(cv.previouslyOwned.maxCredit, salePrice.times(cv.previouslyOwned.creditRate)).floor();
    const personalCredit = rawCredit.times(personalPct).dividedBy(HUNDRED).floor();

    previouslyOwnedDetails.push({ rawCredit, personalCredit, disqualified, disqualificationReason });
    totalPreviouslyOwnedCredit = totalPreviouslyOwnedCredit.plus(personalCredit);

    const vehicleLabel = `Vehicle ${i + 1}`;
    audit.record("Form 8936", `PO-${i + 1}`, `Previously owned clean vehicle credit — ${vehicleLabel}`, personalCredit,
      disqualified
        ? `Disqualified: ${disqualificationReason}`
        : `min($${cv.previouslyOwned.maxCredit}, ${salePrice} × ${cv.previouslyOwned.creditRate}) × ${personalPct}% personal use`,
      {
        "Date acquired": vehicle.dateAcquired,
        "Sale price": salePrice,
        "30% of sale price": salePrice.times(cv.previouslyOwned.creditRate),
        "Maximum credit": cv.previouslyOwned.maxCredit,
        "Raw credit": rawCredit,
        "Personal use %": personalPct,
        "Credit transferred to dealer": vehicle.creditTransferredToDealer ? "Yes" : "No",
      });
  }

  audit.record("Form 8936", "14", "Total previously owned clean vehicle credits", totalPreviouslyOwnedCredit,
    `Sum of ${input.previouslyOwnedCleanVehicles.length} previously owned vehicle credit(s)`);

  return {
    magi,
    currentYearMagi,
    priorYearMagi,
    newVehicleDetails,
    totalNewVehicleCredit,
    previouslyOwnedDetails,
    totalPreviouslyOwnedCredit,
    newVehicleAgiDisqualified,
    previouslyOwnedAgiDisqualified,
    lines: audit.getLines(),
  };
}
