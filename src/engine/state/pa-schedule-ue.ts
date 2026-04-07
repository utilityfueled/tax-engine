/**
 * Pennsylvania Schedule UE — Allowable Employee Business Expenses
 * Spec: spec/state/pa-schedule-ue.yaml
 *
 * PA still allows unreimbursed employee business expenses as a deduction
 * from compensation income (PA-40 Line 1b). Federal eliminated this after
 * TCJA (2017) but PA retained it.
 *
 * The net result flows to PA-40 Line 1b, reducing Class 1 compensation.
 */

import Decimal from "decimal.js";
import { zeroFloor, roundDollar, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export interface PAScheduleUEConstants {
  /** IRS standard mileage rate for business use */
  standardMileageRate: Decimal;
  /** Meal expense limitation percentage (0.50 = 50%) */
  mealLimitationRate: Decimal;
}

export const PA_SCHEDULE_UE_CONSTANTS: Record<number, PAScheduleUEConstants> = {
  2024: {
    standardMileageRate: new Decimal("0.67"),
    mealLimitationRate: new Decimal("0.50"),
  },
  2025: {
    standardMileageRate: new Decimal("0.70"),
    mealLimitationRate: new Decimal("0.50"),
  },
  2026: {
    standardMileageRate: new Decimal("0.70"),
    mealLimitationRate: new Decimal("0.50"),
  },
};

// ---------------------------------------------------------------------------
// Input / Output interfaces
// ---------------------------------------------------------------------------

/** Vehicle expense method: standard mileage rate or actual expenses */
export type VehicleMethod = "standard" | "actual";

export interface ScheduleUEVehicleInput {
  /** Method: standard mileage rate or actual expenses */
  method: VehicleMethod;
  /** Total miles driven during the year */
  totalMiles: number;
  /** Business miles driven (excludes commuting) */
  businessMiles: number;
  /** Actual vehicle expenses (gas, oil, repairs, insurance, depreciation, etc.) — only used with "actual" method */
  actualExpenses?: Decimal;
  /** Parking fees, tolls, and local transportation (100% deductible) */
  parkingAndTolls?: Decimal;
}

export interface ScheduleUETravelInput {
  /** Lodging expenses while away from home overnight */
  lodging?: Decimal;
  /** Meal expenses while traveling (before 50% limitation) */
  meals?: Decimal;
  /** Other travel expenses (airfare, car rental, train, taxi) */
  otherTravel?: Decimal;
}

export interface ScheduleUEOtherExpensesInput {
  /** Union and professional organization dues */
  unionDues?: Decimal;
  /** Work tools and supplies */
  toolsAndSupplies?: Decimal;
  /** Required work clothing/uniforms (not suitable for everyday wear) */
  workClothing?: Decimal;
  /** Education to maintain/improve current job skills */
  education?: Decimal;
  /** Professional licenses and regulatory fees */
  licenseFees?: Decimal;
  /** Trade journals, professional publications */
  subscriptions?: Decimal;
  /** Home office expenses (for employer's convenience) */
  homeOffice?: Decimal;
  /** Other qualifying unreimbursed expenses */
  otherExpenses?: Decimal;
}

export interface ScheduleUEInput {
  taxYear: number;
  /** Part A: Vehicle expenses */
  vehicle?: ScheduleUEVehicleInput;
  /** Part B: Travel expenses */
  travel?: ScheduleUETravelInput;
  /** Part C: Other employee business expenses */
  otherExpenses?: ScheduleUEOtherExpensesInput;
  /** Part D: Employer reimbursements received (accountable plan) */
  employerReimbursements?: Decimal;
}

export interface ScheduleUEResult {
  // Part A — Vehicle
  totalMiles: number;
  businessMiles: number;
  businessUsePercentage: Decimal;
  vehicleMethod: VehicleMethod | "none";
  standardMileageDeduction: Decimal;
  actualVehicleDeduction: Decimal;
  parkingAndTolls: Decimal;
  totalVehicleExpenses: Decimal;

  // Part B — Travel
  lodging: Decimal;
  mealsBeforeLimitation: Decimal;
  mealsAfterLimitation: Decimal;
  otherTravel: Decimal;
  totalTravelExpenses: Decimal;

  // Part C — Other
  unionDues: Decimal;
  toolsAndSupplies: Decimal;
  workClothing: Decimal;
  education: Decimal;
  licenseFees: Decimal;
  subscriptions: Decimal;
  homeOffice: Decimal;
  otherExpenses: Decimal;
  totalOtherExpenses: Decimal;

  // Part D — Summary
  totalExpenses: Decimal;
  employerReimbursements: Decimal;
  /** Net unreimbursed employee business expenses → PA-40 Line 1b */
  netUnreimbursedExpenses: Decimal;

  /** Audit trail */
  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function d(v: Decimal | number | string | undefined): Decimal {
  if (v === undefined || v === null) return new Decimal(0);
  return new Decimal(v);
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculateScheduleUE(input: ScheduleUEInput): ScheduleUEResult {
  const constants = PA_SCHEDULE_UE_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`PA Schedule UE constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const ZERO = new Decimal(0);

  // =========================================================================
  // Part A — Vehicle Expenses
  // =========================================================================

  const vehicle = input.vehicle;
  const totalMiles = vehicle?.totalMiles ?? 0;
  const businessMiles = vehicle?.businessMiles ?? 0;
  const vehicleMethod: VehicleMethod | "none" = vehicle?.method ?? "none";

  // Business use percentage (for actual method)
  const businessUsePercentage = totalMiles > 0
    ? Decimal.min(new Decimal(businessMiles).div(totalMiles), new Decimal(1))
    : ZERO;

  audit.record("PA-UE", "A1", "Total miles driven", new Decimal(totalMiles), "Input");
  audit.record("PA-UE", "A2", "Business miles driven", new Decimal(businessMiles), "Input");
  audit.record("PA-UE", "A3", "Business use percentage", businessUsePercentage, "Line A2 / Line A1");

  let standardMileageDeduction = ZERO;
  let actualVehicleDeduction = ZERO;

  if (vehicle && vehicleMethod === "standard") {
    standardMileageDeduction = roundDollar(
      new Decimal(businessMiles).times(constants.standardMileageRate)
    );
    audit.record("PA-UE", "A4a", "Standard mileage rate deduction", standardMileageDeduction,
      `${businessMiles} miles × $${constants.standardMileageRate}/mile`);
  } else if (vehicle && vehicleMethod === "actual") {
    const actualExp = d(vehicle.actualExpenses);
    actualVehicleDeduction = roundDollar(actualExp.times(businessUsePercentage));
    audit.record("PA-UE", "A4b", "Actual vehicle expenses", actualVehicleDeduction,
      `$${actualExp} × ${businessUsePercentage.times(100).toFixed(1)}% business use`);
  }

  const parkingAndTolls = roundDollar(d(vehicle?.parkingAndTolls));
  audit.record("PA-UE", "A5", "Parking, tolls, and transportation", parkingAndTolls, "Input (100% deductible)");

  const vehicleDeduction = vehicleMethod === "standard" ? standardMileageDeduction : actualVehicleDeduction;
  const totalVehicleExpenses = vehicleDeduction.plus(parkingAndTolls);
  audit.record("PA-UE", "A6", "Total vehicle expenses", totalVehicleExpenses, "Vehicle deduction + parking/tolls");

  // =========================================================================
  // Part B — Travel Expenses
  // =========================================================================

  const travel = input.travel;
  const lodging = roundDollar(d(travel?.lodging));
  const mealsBeforeLimitation = d(travel?.meals);
  const mealsAfterLimitation = roundDollar(mealsBeforeLimitation.times(constants.mealLimitationRate));
  const otherTravel = roundDollar(d(travel?.otherTravel));

  audit.record("PA-UE", "B1", "Lodging", lodging, "Input");
  audit.record("PA-UE", "B2", "Meals (before limitation)", mealsBeforeLimitation, "Input");
  audit.record("PA-UE", "B3", "Meals (after 50% limitation)", mealsAfterLimitation,
    `$${mealsBeforeLimitation} × ${constants.mealLimitationRate.times(100)}%`);
  audit.record("PA-UE", "B4", "Other travel expenses", otherTravel, "Input");

  const totalTravelExpenses = sum(lodging, mealsAfterLimitation, otherTravel);
  audit.record("PA-UE", "B5", "Total travel expenses", totalTravelExpenses, "Line B1 + Line B3 + Line B4");

  // =========================================================================
  // Part C — Other Employee Business Expenses
  // =========================================================================

  const other = input.otherExpenses;
  const unionDues = roundDollar(d(other?.unionDues));
  const toolsAndSupplies = roundDollar(d(other?.toolsAndSupplies));
  const workClothing = roundDollar(d(other?.workClothing));
  const education = roundDollar(d(other?.education));
  const licenseFees = roundDollar(d(other?.licenseFees));
  const subscriptions = roundDollar(d(other?.subscriptions));
  const homeOffice = roundDollar(d(other?.homeOffice));
  const otherExpenses = roundDollar(d(other?.otherExpenses));

  audit.record("PA-UE", "C1", "Union and professional dues", unionDues, "Input");
  audit.record("PA-UE", "C2", "Work tools and supplies", toolsAndSupplies, "Input");
  audit.record("PA-UE", "C3", "Work clothing and uniforms", workClothing, "Input");
  audit.record("PA-UE", "C4", "Education expenses", education, "Input");
  audit.record("PA-UE", "C5", "Professional licenses and fees", licenseFees, "Input");
  audit.record("PA-UE", "C6", "Professional subscriptions", subscriptions, "Input");
  audit.record("PA-UE", "C7", "Home office expenses", homeOffice, "Input");
  audit.record("PA-UE", "C8", "Other unreimbursed expenses", otherExpenses, "Input");

  const totalOtherExpenses = sum(
    unionDues, toolsAndSupplies, workClothing, education,
    licenseFees, subscriptions, homeOffice, otherExpenses,
  );
  audit.record("PA-UE", "C9", "Total other employee expenses", totalOtherExpenses, "Sum of Lines C1-C8");

  // =========================================================================
  // Part D — Summary
  // =========================================================================

  const totalExpenses = sum(totalVehicleExpenses, totalTravelExpenses, totalOtherExpenses);
  audit.record("PA-UE", "D1", "Total expenses", totalExpenses, "Line A6 + Line B5 + Line C9");

  const employerReimbursements = roundDollar(d(input.employerReimbursements));
  audit.record("PA-UE", "D2", "Employer reimbursements", employerReimbursements, "Input (accountable plan)");

  const netUnreimbursedExpenses = zeroFloor(totalExpenses.minus(employerReimbursements));
  audit.record("PA-UE", "D3", "Net unreimbursed employee business expenses", netUnreimbursedExpenses,
    "Line D1 - Line D2, floor at 0 → PA-40 Line 1b");

  return {
    // Part A
    totalMiles,
    businessMiles,
    businessUsePercentage,
    vehicleMethod,
    standardMileageDeduction,
    actualVehicleDeduction,
    parkingAndTolls,
    totalVehicleExpenses,

    // Part B
    lodging,
    mealsBeforeLimitation,
    mealsAfterLimitation,
    otherTravel,
    totalTravelExpenses,

    // Part C
    unionDues,
    toolsAndSupplies,
    workClothing,
    education,
    licenseFees,
    subscriptions,
    homeOffice,
    otherExpenses,
    totalOtherExpenses,

    // Part D
    totalExpenses,
    employerReimbursements,
    netUnreimbursedExpenses,

    lines: audit.getLines(),
  };
}
