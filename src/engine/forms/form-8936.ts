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
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";

export interface VehicleSourceFacts {
  owner?: "primary" | "spouse";
  vin?: string;
  datePlacedInService?: string;
  bindingContractDate?: string;
  paymentDate?: string;
  bindingContractConfirmed?: boolean;
  sellerReportReceived?: boolean;
  sellerReportCreditAmount?: Decimal | string;
  eligibilityConfirmed?: boolean;
  creditTransferredAmount?: Decimal | string;
  resoldWithin30Days?: boolean;
  returnedToSellerWithin30Days?: boolean;
  sellerReportUpdatedForReturn?: boolean;
  priorYearMagi?: Decimal | string;
  priorYearFilingStatus?: FilingStatus;
  priorYearMagiConfirmed?: boolean;
}

export interface Form8936Input {
  taxYear?: number;
  priorYearFilingStatus?: FilingStatus;
  agiAdjustmentsConfirmed?: boolean;
  priorYearAgiAdjustmentsConfirmed?: boolean;
  possessionIncomeExclusion?: Decimal | string;
  priorYearPossessionIncomeExclusion?: Decimal | string;
  /** Actual 1040 line 18 and remaining worksheet amount before used/new credits. */
  incomeTaxBeforeCredits?: Decimal;
  taxLiabilityLimit?: Decimal;
  filingStatus: FilingStatus;
  agi: Decimal | string;
  constants: YearConstants["cleanVehicleCredit"];
  /** Per-vehicle new clean vehicle claims */
  newCleanVehicles: Array<VehicleSourceFacts & {
    powertrain?: "battery" | "fuel_cell";
    dateAcquired: string;
    criticalMineralsRequirementMet: boolean;
    batteryComponentsRequirementMet: boolean;
    msrp: Decimal | string;
    vehicleType: "suv_van_pickup" | "other";
    personalUsePercentage: Decimal | string;
    creditTransferredToDealer: boolean;
  }>;
  /** Per-vehicle previously owned clean vehicle claims */
  previouslyOwnedCleanVehicles: Array<VehicleSourceFacts & {
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

interface VehicleReconciliationDetail {
  creditTransferred?: boolean;
  transferredAmount?: Decimal;
  repayment?: Decimal;
  businessCredit?: Decimal;
  basisReduction?: Decimal;
}
export interface NewVehicleCreditDetail extends VehicleReconciliationDetail {
  maxCredit: Decimal;
  personalCredit: Decimal;
  disqualified: boolean;
  disqualificationReason?: string;
}

export interface PreviouslyOwnedCreditDetail extends VehicleReconciliationDetail {
  rawCredit: Decimal;
  personalCredit: Decimal;
  disqualified: boolean;
  disqualificationReason?: string;
}

export interface Form8936Result {
  sourceFactsVerified: boolean;
  priorYearMagiKnown: boolean;
  tentativeNewVehicleCredit: Decimal;
  tentativePreviouslyOwnedCredit: Decimal;
  businessInvestmentCredit: Decimal;
  requiresForm3800: boolean;
  transferredNewVehicleCreditRepayment: Decimal;
  transferredPreviouslyOwnedCreditRepayment: Decimal;
  transferredCreditRepayment: Decimal;
  dealerTransferReconciliationAmount: Decimal;
  requiresTransferReconciliation: boolean;
  unusedPersonalCredit: Decimal;
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
  const taxYear = input.taxYear ?? 2025;
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error("Unsupported Form 8936 tax year");
  if (taxYear === 2026 || [...input.newCleanVehicles,...input.previouslyOwnedCleanVehicles].some(vehicle=>vehicle.datePlacedInService !== undefined)) {
    return calculateFromSourceFacts(input,taxYear);
  }
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
  const hasPriorYear = input.priorYearAgi !== undefined;
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

  const tentativeNewVehicleCredit = totalNewVehicleCredit;
  const tentativePreviouslyOwnedCredit = totalPreviouslyOwnedCredit;
  const remainingTax = input.taxLiabilityLimit ?? tentativeNewVehicleCredit.plus(tentativePreviouslyOwnedCredit);
  const taxBeforeCredits = input.incomeTaxBeforeCredits ?? remainingTax;
  if (!remainingTax.isFinite() || remainingTax.isNegative() || !taxBeforeCredits.isFinite() || taxBeforeCredits.isNegative() || remainingTax.gt(taxBeforeCredits)) {
    throw new Error("Vehicle tax-liability amounts must be finite, nonnegative and ordered");
  }
  const usedLimit = roundDollar(remainingTax);
  const totalTax = roundDollar(taxBeforeCredits);
  totalPreviouslyOwnedCredit = Decimal.min(tentativePreviouslyOwnedCredit, usedLimit);
  const newLimit = zeroFloor(usedLimit.minus(totalPreviouslyOwnedCredit));
  totalNewVehicleCredit = Decimal.min(tentativeNewVehicleCredit, newLimit);
  const unusedPersonalCredit = tentativeNewVehicleCredit.plus(tentativePreviouslyOwnedCredit).minus(totalNewVehicleCredit).minus(totalPreviouslyOwnedCredit);
  for (const [line, description, value] of [
    ["10", "Tax before credits", totalTax], ["11", "Credits before new vehicle", totalTax.minus(newLimit)],
    ["12", "New vehicle tax limit", newLimit], ["13", "Allowed new personal vehicle credit", totalNewVehicleCredit],
    ["15", "Tax before credits", totalTax], ["16", "Credits before previously owned vehicle", totalTax.minus(usedLimit)],
    ["17", "Previously owned vehicle tax limit", usedLimit], ["18", "Allowed previously owned vehicle credit", totalPreviouslyOwnedCredit],
  ] as const) audit.record("Form 8936", line, description, value, "Used credit precedes new credit; supplied tax-liability worksheet when available");

  return {
    sourceFactsVerified:false,priorYearMagiKnown:hasPriorYear,
    tentativeNewVehicleCredit,tentativePreviouslyOwnedCredit,
    businessInvestmentCredit:ZERO,requiresForm3800:false,
    transferredNewVehicleCreditRepayment:ZERO,transferredPreviouslyOwnedCreditRepayment:ZERO,
    transferredCreditRepayment:ZERO,dealerTransferReconciliationAmount:ZERO,
    requiresTransferReconciliation:[...input.newCleanVehicles,...input.previouslyOwnedCleanVehicles].some(vehicle=>vehicle.creditTransferredToDealer),
    unusedPersonalCredit,
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


/** Verified source path; historical scalar records cannot establish these facts. */
function calculateFromSourceFacts(input: Form8936Input, taxYear: number): Form8936Result {
  const audit = new AuditTrail();
  const cv = input.constants;
  const vehicles = [...input.newCleanVehicles,...input.previouslyOwnedCleanVehicles];
  const finite = (amount: Decimal, label: string, nonnegative = true) => {
    if (!amount.isFinite() || (nonnegative && amount.isNegative())) throw new Error(`${label} must be finite${nonnegative ? " and nonnegative" : ""}`);
    return amount;
  };
  const actualDate = (date: string | undefined) => {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) throw new Error("Vehicle source date must be a real calendar date");
    return date;
  };
  if (vehicles.length > 0 && input.agiAdjustmentsConfirmed !== true) throw new Error("Vehicle current-year MAGI adjustments must be confirmed");
  const currentYearMagi = finite(d(input.agi),"AGI",false)
    .plus(finite(d(input.foreignEarnedIncomeExclusion),"Foreign exclusion"))
    .plus(finite(d(input.foreignHousingDeduction),"Foreign housing deduction"))
    .plus(finite(d(input.possessionIncomeExclusion),"Possession income exclusion"));
  const priorYearMagiKnown = input.priorYearAgi !== undefined;
  if (priorYearMagiKnown && (!input.priorYearFilingStatus || input.priorYearAgiAdjustmentsConfirmed !== true)) throw new Error("Known prior-year AGI requires actual filing status and confirmed adjustments");
  const priorYearMagi = finite(d(input.priorYearAgi),"Prior AGI",false)
    .plus(finite(d(input.priorYearForeignEarnedIncomeExclusion),"Prior foreign exclusion"))
    .plus(finite(d(input.priorYearForeignHousingDeduction),"Prior housing deduction"))
    .plus(finite(d(input.priorYearPossessionIncomeExclusion),"Prior possession exclusion"));
  if (vehicles.length > 0 && (input.taxLiabilityLimit === undefined || input.incomeTaxBeforeCredits === undefined)) throw new Error("Verified vehicle credits require actual tax-liability worksheet amounts");
  const remainingTax = roundDollar(finite(input.taxLiabilityLimit ?? ZERO,"Vehicle tax-liability limit"));
  const taxBeforeCredits = roundDollar(finite(input.incomeTaxBeforeCredits ?? ZERO,"Income tax before credits"));
  if (remainingTax.gt(taxBeforeCredits)) throw new Error("Vehicle remaining tax exceeds actual income tax before credits");
  const magi = priorYearMagiKnown ? Decimal.min(currentYearMagi,priorYearMagi) : currentYearMagi;
  audit.record("Form 8936","2","Current-year MAGI",currentYearMagi,"Actual AGI plus foreign and possession exclusions/deductions");
  if (priorYearMagiKnown) audit.record("Form 8936","4","Prior-year MAGI",priorYearMagi,"Actual prior-year AGI and confirmed adjustments");
  const globalDisqualified = (kind: "newVehicle" | "previouslyOwned") => currentYearMagi.gt(cv[kind].magiLimit[input.filingStatus]) &&
    (!priorYearMagiKnown || priorYearMagi.gt(cv[kind].magiLimit[input.priorYearFilingStatus ?? input.filingStatus]));
  const seenVins = new Set<string>();
  const transferCounts = new Map<string,number>();
  const usedClaimCounts = new Map<string,number>();
  const newVehicleDetails: NewVehicleCreditDetail[] = [];
  const previouslyOwnedDetails: PreviouslyOwnedCreditDetail[] = [];
  let tentativeNewVehicleCredit = ZERO;
  let tentativePreviouslyOwnedCredit = ZERO;
  let businessInvestmentCredit = ZERO;
  let transferredNewVehicleCreditRepayment = ZERO;
  let transferredPreviouslyOwnedCreditRepayment = ZERO;
  let dealerTransferReconciliationAmount = ZERO;
  for (const [kind, records] of [["newVehicle",input.newCleanVehicles],["previouslyOwned",input.previouslyOwnedCleanVehicles]] as const) {
    for (const [index, vehicle] of records.entries()) {
      if (!vehicle.owner || (vehicle.owner === "spouse" && input.filingStatus !== "married_filing_jointly")) throw new Error("Vehicle owner must be an actual taxpayer on this return");
      const vin = vehicle.vin?.toUpperCase();
      if (!vin || !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin) || seenVins.has(vin)) throw new Error("Vehicle VIN must be valid and unique within the return");
      seenVins.add(vin);
      const serviceDate = actualDate(vehicle.datePlacedInService);
      const contractDate = actualDate(vehicle.bindingContractDate);
      const paymentDate = actualDate(vehicle.paymentDate);
      if (contractDate > serviceDate || paymentDate > serviceDate) throw new Error("Vehicle contract/payment dates cannot follow possession");
      for (const flag of [vehicle.bindingContractConfirmed,vehicle.sellerReportReceived,vehicle.eligibilityConfirmed,vehicle.resoldWithin30Days,vehicle.returnedToSellerWithin30Days]) {
        if (typeof flag !== "boolean") throw new Error("Vehicle qualification, seller report and resale/return facts must be known");
      }
      if (vehicle.resoldWithin30Days && vehicle.returnedToSellerWithin30Days) throw new Error("Vehicle cannot be both returned to dealer and resold within30days");
      if (vehicle.sellerReportCreditAmount === undefined) throw new Error("Actual seller report credit amount is required");
      const reportedCredit = roundDollar(finite(d(vehicle.sellerReportCreditAmount),"Actual seller credit"));
      if (typeof vehicle.creditTransferredToDealer !== "boolean" || vehicle.personalUsePercentage === undefined) throw new Error("Actual transfer election and use percentage are required");
      const personalPct = finite(d(vehicle.personalUsePercentage),"Personal use percentage");
      if (personalPct.gt(100)) throw new Error("Personal use percentage cannot exceed100");
      let statutoryCredit: Decimal;
      let priceDisqualified: boolean;
      if ("msrp" in vehicle) {
        if (vehicle.powertrain !== "battery" && vehicle.powertrain !== "fuel_cell") throw new Error("Actual new vehicle powertrain is required");
        if (vehicle.msrp === undefined || !["suv_van_pickup","other"].includes(vehicle.vehicleType) || typeof vehicle.criticalMineralsRequirementMet !== "boolean" || typeof vehicle.batteryComponentsRequirementMet !== "boolean") throw new Error("New vehicle price, type and component facts must be known");
        const msrp = finite(d(vehicle.msrp),"Vehicle MSRP");
        priceDisqualified = msrp.gt(vehicle.vehicleType === "suv_van_pickup" ? cv.newVehicle.msrpLimitSuvVanPickup : cv.newVehicle.msrpLimitOther);
        statutoryCredit = vehicle.powertrain === "fuel_cell" ? cv.newVehicle.criticalMineralsCredit.plus(cv.newVehicle.batteryComponentsCredit)
          : (vehicle.criticalMineralsRequirementMet ? cv.newVehicle.criticalMineralsCredit : ZERO).plus(vehicle.batteryComponentsRequirementMet ? cv.newVehicle.batteryComponentsCredit : ZERO);
      } else {
        if (vehicle.salePrice === undefined) throw new Error("Actual used vehicle sale price is required");
        const salePrice = finite(d(vehicle.salePrice),"Used vehicle sale price");
        priceDisqualified = salePrice.gt(cv.previouslyOwned.maxSalePrice);
        statutoryCredit = Decimal.min(cv.previouslyOwned.maxCredit,roundDollar(salePrice.times(cv.previouslyOwned.creditRate)));
      }
      if (reportedCredit.gt(statutoryCredit)) throw new Error("Actual seller credit exceeds the statutory vehicle maximum; reconcile the report");
      let priorMagiForOwner = priorYearMagi;
      let priorStatusForOwner = input.priorYearFilingStatus;
      let hasPriorForOwner = priorYearMagiKnown;
      if (vehicle.priorYearMagi !== undefined) {
        if (vehicle.priorYearMagiConfirmed !== true || !vehicle.priorYearFilingStatus) throw new Error("Owner prior-year MAGI and filing status must be confirmed");
        priorMagiForOwner = finite(d(vehicle.priorYearMagi),"Owner prior-year MAGI",false);
        priorStatusForOwner = vehicle.priorYearFilingStatus;
        hasPriorForOwner = true;
      } else if (vehicle.owner === "spouse" && input.priorYearFilingStatus !== "married_filing_jointly") {
        hasPriorForOwner = false;
      }
      const currentOver = currentYearMagi.gt(cv[kind].magiLimit[input.filingStatus]);
      if (currentOver && !hasPriorForOwner) throw new Error("Vehicle owner needs actual prior-year MAGI before eligibility or repayment can be determined");
      const agiDisqualified = currentOver && priorMagiForOwner.gt(cv[kind].magiLimit[priorStatusForOwner ?? input.filingStatus]);
      const wrongYear = !serviceDate.startsWith(`${taxYear}-`);
      const effectiveAcquisition = contractDate > paymentDate ? contractDate : paymentDate;
      const acquiredAfterCutoff = effectiveAcquisition > CLEAN_VEHICLE_ACQUISITION_CUTOFF;
      const usedAcquiredTooEarly = kind === "previouslyOwned" && effectiveAcquisition < "2023-01-01";
      const otherDisqualified = wrongYear || usedAcquiredTooEarly || acquiredAfterCutoff || !vehicle.bindingContractConfirmed || !vehicle.sellerReportReceived || !vehicle.eligibilityConfirmed || priceDisqualified;
      const returned = vehicle.returnedToSellerWithin30Days === true;
      const resold = vehicle.resoldWithin30Days === true;
      const disqualified = otherDisqualified || returned || resold || agiDisqualified;
      const disqualificationReason = disqualified ? (wrongYear ? "Vehicle not placed in service in this tax year" : acquiredAfterCutoff ? "Vehicle acquired after2025-09-30" : returned ? "Vehicle returned to seller within30days" : resold ? "Vehicle resold within30days" : agiDisqualified ? "MAGI exceeds each applicable year's threshold" : "Actual vehicle or buyer qualification failed") : undefined;
      let transferredAmount = ZERO;
      let repayment = ZERO;
      if (vehicle.creditTransferredToDealer) {
        if (vehicle.creditTransferredAmount === undefined) throw new Error("Actual transferred amount from seller report is required");
        transferredAmount = roundDollar(finite(d(vehicle.creditTransferredAmount),"Transferred credit"));
        if (transferredAmount.lte(0) || !transferredAmount.eq(reportedCredit)) throw new Error("Transferred amount must equal the entire actual seller credit");
        if (wrongYear) throw new Error("Transferred vehicle must be reconciled in its actual placed-in-service year");
        if (kind === "newVehicle" && personalPct.lte(50)) throw new Error("New vehicle transfer requires predominantly personal use");
        if (!returned) {
          const transferCount = (transferCounts.get(vehicle.owner) ?? 0)+1;
          transferCounts.set(vehicle.owner,transferCount);
          if (transferCount > 2) throw new Error("Vehicle owner cannot make more than two transfer elections");
        }
        if (returned) {
          if (vehicle.sellerReportUpdatedForReturn !== true) throw new Error("Returned vehicle requires the updated seller report and dealer reconciliation");
          dealerTransferReconciliationAmount = dealerTransferReconciliationAmount.plus(transferredAmount);
        } else {
          if (otherDisqualified) throw new Error("Inconsistent transferred vehicle facts require seller-report reconciliation");
          if (agiDisqualified || resold) repayment = transferredAmount;
        }
      } else if (vehicle.creditTransferredAmount !== undefined && !d(vehicle.creditTransferredAmount).isZero()) {
        throw new Error("Transferred amount conflicts with the known nontransfer election");
      }
      if (kind === "previouslyOwned" && ((!disqualified && reportedCredit.gt(0)) || (vehicle.creditTransferredToDealer && !returned))) {
        const count = (usedClaimCounts.get(vehicle.owner) ?? 0)+1;
        usedClaimCounts.set(vehicle.owner,count);
        if (count > 1) throw new Error("Vehicle owner has conflicting used vehicle credit claims within the same year");
      }
      const available = disqualified || vehicle.creditTransferredToDealer ? ZERO : reportedCredit;
      const businessCredit = kind === "newVehicle" ? roundDollar(available.times(HUNDRED.minus(personalPct)).div(HUNDRED)) : ZERO;
      const personalCredit = available.minus(businessCredit);
      const basisReduction = returned || disqualified ? ZERO : reportedCredit;
      const common = {personalCredit,disqualified,disqualificationReason,creditTransferred:vehicle.creditTransferredToDealer,transferredAmount,repayment,businessCredit,basisReduction};
      if (kind === "newVehicle") {
        newVehicleDetails.push({...common,maxCredit:reportedCredit});
        tentativeNewVehicleCredit = tentativeNewVehicleCredit.plus(personalCredit);
        businessInvestmentCredit = businessInvestmentCredit.plus(businessCredit);
        transferredNewVehicleCreditRepayment = transferredNewVehicleCreditRepayment.plus(repayment);
      } else {
        previouslyOwnedDetails.push({...common,rawCredit:available});
        tentativePreviouslyOwnedCredit = tentativePreviouslyOwnedCredit.plus(personalCredit);
        transferredPreviouslyOwnedCreditRepayment = transferredPreviouslyOwnedCreditRepayment.plus(repayment);
      }
      const id = `${kind === "newVehicle" ? "NV" : "PO"}-${index+1}`;
      audit.record("Form 8936",id,"Verified vehicle personal credit",personalCredit,disqualificationReason ?? "Actual seller credit less rounded business allocation; transferred credit not claimed twice");
      audit.record("Form 8936",`${id}-transfer`,"Actual credit transferred",transferredAmount,"Actual seller report");
      audit.record("Form 8936",`${id}-repayment`,"Taxpayer transfer repayment",repayment,"MAGI failure or resale within30days; return-to-dealer reconciliation excluded");
    }
  }
  const totalPreviouslyOwnedCredit = Decimal.min(tentativePreviouslyOwnedCredit,remainingTax);
  const newLimit = zeroFloor(remainingTax.minus(totalPreviouslyOwnedCredit));
  const totalNewVehicleCredit = Decimal.min(tentativeNewVehicleCredit,newLimit);
  const unusedPersonalCredit = tentativeNewVehicleCredit.plus(tentativePreviouslyOwnedCredit).minus(totalNewVehicleCredit).minus(totalPreviouslyOwnedCredit);
  for (const [line,description,value] of [
    ["6","Business new vehicle credit",businessInvestmentCredit],
    ["9","Tentative personal new vehicle credit",tentativeNewVehicleCredit],
    ["10","Tax before credits",taxBeforeCredits],["11","Credits before new vehicle",taxBeforeCredits.minus(newLimit)],
    ["12","New vehicle tax limit",newLimit],["13","Allowed new personal vehicle credit",totalNewVehicleCredit],
    ["14","Tentative previously owned credit",tentativePreviouslyOwnedCredit],["15","Tax before credits",taxBeforeCredits],
    ["16","Credits before previously owned vehicle",taxBeforeCredits.minus(remainingTax)],["17","Used vehicle tax limit",remainingTax],
    ["18","Allowed previously owned vehicle credit",totalPreviouslyOwnedCredit],
    ["transfer-repayment-new","New vehicle repayment to Schedule2line1b",transferredNewVehicleCreditRepayment],
    ["transfer-repayment-used","Used vehicle repayment to Schedule2line1c",transferredPreviouslyOwnedCreditRepayment],
  ] as const) audit.record("Form 8936",line,description,value,"Actual source worksheet and owner-specific eligibility; used credit precedes new credit");
  return {sourceFactsVerified:true,priorYearMagiKnown,magi,currentYearMagi,priorYearMagi,newVehicleDetails,previouslyOwnedDetails,
    tentativeNewVehicleCredit,tentativePreviouslyOwnedCredit,totalNewVehicleCredit,totalPreviouslyOwnedCredit,businessInvestmentCredit,
    requiresForm3800:businessInvestmentCredit.gt(0),transferredNewVehicleCreditRepayment,transferredPreviouslyOwnedCreditRepayment,
    transferredCreditRepayment:transferredNewVehicleCreditRepayment.plus(transferredPreviouslyOwnedCreditRepayment),
    dealerTransferReconciliationAmount,requiresTransferReconciliation:false,unusedPersonalCredit,
    newVehicleAgiDisqualified:globalDisqualified("newVehicle"),previouslyOwnedAgiDisqualified:globalDisqualified("previouslyOwned"),lines:audit.getLines()};
}
