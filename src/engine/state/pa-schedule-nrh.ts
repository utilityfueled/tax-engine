/**
 * Pennsylvania Schedule NRH — Non-Resident Apportionment
 * Spec: spec/state/pa-schedule-nrh.yaml
 */

import Decimal from "decimal.js";
import { d, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { PA_CONSTANTS } from "@/engine/state/pa-40.js";

export type PAScheduleNRHApportionmentMethod = "working_days" | "business_volume";

export interface PAScheduleNRHCompensationInput {
  method: PAScheduleNRHApportionmentMethod;
  employerReportedPAGrossCompensation?: Decimal;
  grossCompensation?: Decimal;
  totalDaysForEmployer?: number;
  nonworkingDays?: number;
  daysWorkedInPennsylvania?: number;
  totalBusinessVolume?: Decimal;
  pennsylvaniaBusinessVolume?: Decimal;
  unreimbursedEmployeeBusinessExpenses?: Decimal;
  employerReimbursementsNotInW2?: Decimal;
}

export interface PAScheduleNRHBusinessApportionmentInput {
  propertyEverywhere?: Decimal;
  propertyPennsylvania?: Decimal;
  payrollEverywhere?: Decimal;
  payrollPennsylvania?: Decimal;
  salesEverywhere?: Decimal;
  salesPennsylvania?: Decimal;
  totalNetProfits: Decimal;
}

export interface PAScheduleNRHInput {
  taxYear: number;
  compensation?: PAScheduleNRHCompensationInput;
  businessApportionment?: PAScheduleNRHBusinessApportionmentInput;
}

export interface PAScheduleNRHResult {
  workingDays: number;
  workingDayFraction: Decimal;
  businessVolumeFraction: Decimal;
  selectedApportionmentFraction: Decimal;
  employerReportedPAGrossCompensation: Decimal;
  grossCompensation: Decimal;
  apportionedGrossCompensation: Decimal;
  unreimbursedEmployeeBusinessExpenses: Decimal;
  apportionedEmployeeBusinessExpenses: Decimal;
  employerReimbursementsNotInW2: Decimal;
  apportionedExpenseReimbursements: Decimal;
  totalPAGrossCompensation: Decimal;
  netPATaxableCompensation: Decimal;
  propertyFactor?: Decimal;
  payrollFactor?: Decimal;
  salesFactor?: Decimal;
  businessFactorSum?: Decimal;
  businessApplicableFactorCount: number;
  businessApportionmentFraction?: Decimal;
  totalNetProfits?: Decimal;
  paNetProfits?: Decimal;
  lines: CalculatedLine[];
}

interface FactorResult {
  ratio: Decimal;
  applies: boolean;
}

const ZERO = new Decimal(0);
const ONE = new Decimal(1);

function toSixDecimalPlaces(value: Decimal): Decimal {
  return value.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
}

function boundedRatio(numerator: Decimal, denominator: Decimal): Decimal {
  if (!denominator.greaterThan(0)) {
    return ZERO;
  }

  return toSixDecimalPlaces(
    Decimal.min(ONE, Decimal.max(ZERO, numerator.dividedBy(denominator))),
  );
}

function factorRatio(everywhere: Decimal, pennsylvania: Decimal): FactorResult {
  if (!everywhere.greaterThan(0)) {
    return { ratio: ZERO, applies: false };
  }

  return {
    ratio: boundedRatio(pennsylvania, everywhere),
    applies: true,
  };
}

function nonNegativeNumber(value: number | undefined): number {
  return value === undefined ? 0 : Math.max(0, value);
}

export function calculatePAScheduleNRH(input: PAScheduleNRHInput): PAScheduleNRHResult {
  if (!PA_CONSTANTS[input.taxYear]) {
    throw new Error(`PA Schedule NRH constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const compensation = input.compensation;
  const business = input.businessApportionment;

  let workingDays = 0;
  let workingDayFraction = ZERO;
  let businessVolumeFraction = ZERO;
  let selectedApportionmentFraction = ZERO;
  let employerReportedPAGrossCompensation = ZERO;
  let grossCompensation = ZERO;
  let apportionedGrossCompensation = ZERO;
  let unreimbursedEmployeeBusinessExpenses = ZERO;
  let apportionedEmployeeBusinessExpenses = ZERO;
  let employerReimbursementsNotInW2 = ZERO;
  let apportionedExpenseReimbursements = ZERO;
  let totalPAGrossCompensation = ZERO;
  let netPATaxableCompensation = ZERO;

  if (compensation) {
    const totalDaysForEmployer = nonNegativeNumber(compensation.totalDaysForEmployer);
    const nonworkingDays = nonNegativeNumber(compensation.nonworkingDays);
    const daysWorkedInPennsylvania = nonNegativeNumber(compensation.daysWorkedInPennsylvania);

    workingDays = Math.max(totalDaysForEmployer - nonworkingDays, 0);
    workingDayFraction = boundedRatio(
      new Decimal(daysWorkedInPennsylvania),
      new Decimal(workingDays),
    );

    const totalBusinessVolume = zeroFloor(d(compensation.totalBusinessVolume));
    const pennsylvaniaBusinessVolume = zeroFloor(d(compensation.pennsylvaniaBusinessVolume));
    businessVolumeFraction = boundedRatio(pennsylvaniaBusinessVolume, totalBusinessVolume);

    selectedApportionmentFraction = compensation.method === "business_volume"
      ? businessVolumeFraction
      : workingDayFraction;

    employerReportedPAGrossCompensation = roundDollar(d(compensation.employerReportedPAGrossCompensation));
    grossCompensation = roundDollar(d(compensation.grossCompensation));
    apportionedGrossCompensation = roundDollar(grossCompensation.times(selectedApportionmentFraction));
    unreimbursedEmployeeBusinessExpenses = roundDollar(d(compensation.unreimbursedEmployeeBusinessExpenses));
    apportionedEmployeeBusinessExpenses = roundDollar(
      unreimbursedEmployeeBusinessExpenses.times(selectedApportionmentFraction),
    );
    employerReimbursementsNotInW2 = roundDollar(d(compensation.employerReimbursementsNotInW2));
    apportionedExpenseReimbursements = roundDollar(
      employerReimbursementsNotInW2.times(selectedApportionmentFraction),
    );
    totalPAGrossCompensation = sum(
      employerReportedPAGrossCompensation,
      apportionedGrossCompensation,
      apportionedExpenseReimbursements,
    );
    netPATaxableCompensation = zeroFloor(
      totalPAGrossCompensation.minus(apportionedEmployeeBusinessExpenses),
    );

    audit.record(
      "PA-Schedule-NRH",
      "A1",
      "Total days worked for the employer during the year",
      new Decimal(totalDaysForEmployer),
      "Input total days worked for the employer",
    );
    audit.record(
      "PA-Schedule-NRH",
      "A2",
      "Nonworking days",
      new Decimal(nonworkingDays),
      "Input nonworking days",
    );
    audit.record(
      "PA-Schedule-NRH",
      "A3",
      "Working days during the tax year",
      new Decimal(workingDays),
      "Line A1 - Line A2, floor at 0",
    );
    audit.record(
      "PA-Schedule-NRH",
      "A4",
      "Days worked in Pennsylvania",
      new Decimal(daysWorkedInPennsylvania),
      "Input days worked in Pennsylvania",
    );
    audit.record(
      "PA-Schedule-NRH",
      "A5",
      "Working-day apportionment fraction",
      workingDayFraction,
      "Line A4 / Line A3, rounded to six decimal places and capped at 1.000000",
    );
    audit.record(
      "PA-Schedule-NRH",
      "B1",
      "Total business transacted everywhere",
      totalBusinessVolume,
      "Input total business volume attributable to the employee's services",
    );
    audit.record(
      "PA-Schedule-NRH",
      "B2",
      "Business transacted from services performed in Pennsylvania",
      pennsylvaniaBusinessVolume,
      "Input Pennsylvania business volume attributable to the employee's services",
    );
    audit.record(
      "PA-Schedule-NRH",
      "B3",
      "Business-volume apportionment fraction",
      businessVolumeFraction,
      "Line B2 / Line B1, rounded to six decimal places and capped at 1.000000",
    );
    audit.record(
      "PA-Schedule-NRH",
      "C1",
      "Gross compensation from Form W-2",
      grossCompensation,
      "Input gross compensation to apportion",
    );
    audit.record(
      "PA-Schedule-NRH",
      "C4",
      "Apportioned Pennsylvania gross-taxable compensation",
      apportionedGrossCompensation,
      "Line C1 × selected apportionment fraction, rounded to nearest dollar",
      {
        "Selected method": compensation.method,
        "Selected fraction": selectedApportionmentFraction,
      },
    );
    audit.record(
      "PA-Schedule-NRH",
      "D1",
      "Total unreimbursed employee business expenses",
      unreimbursedEmployeeBusinessExpenses,
      "Input total unreimbursed employee business expenses",
    );
    audit.record(
      "PA-Schedule-NRH",
      "D4",
      "Apportioned unreimbursed employee business expenses",
      apportionedEmployeeBusinessExpenses,
      "Line D1 × selected apportionment fraction, rounded to nearest dollar",
      {
        "Selected method": compensation.method,
        "Selected fraction": selectedApportionmentFraction,
      },
    );
    audit.record(
      "PA-Schedule-NRH",
      "E1",
      "Correct PA gross-taxable compensation from Form W-2",
      employerReportedPAGrossCompensation,
      "Input employer-reported PA gross-taxable compensation",
    );
    audit.record(
      "PA-Schedule-NRH",
      "E2",
      "Apportioned PA gross-taxable compensation",
      apportionedGrossCompensation,
      "Carryforward of Line C4",
    );
    audit.record(
      "PA-Schedule-NRH",
      "E3",
      "Apportioned expense reimbursements not included in Form W-2",
      apportionedExpenseReimbursements,
      "Employer reimbursements not in Form W-2 × selected apportionment fraction, rounded to nearest dollar",
    );
    audit.record(
      "PA-Schedule-NRH",
      "E4",
      "Total PA gross-taxable compensation",
      totalPAGrossCompensation,
      "Line E1 + Line E2 + Line E3",
    );
    audit.record(
      "PA-Schedule-NRH",
      "E5",
      "Apportioned employee business expenses",
      apportionedEmployeeBusinessExpenses,
      "Carryforward of Line D4",
    );
    audit.record(
      "PA-Schedule-NRH",
      "E6",
      "Net Pennsylvania-taxable compensation",
      netPATaxableCompensation,
      "Line E4 - Line E5, floor at 0",
    );
  }

  let propertyFactor: Decimal | undefined;
  let payrollFactor: Decimal | undefined;
  let salesFactor: Decimal | undefined;
  let businessFactorSum: Decimal | undefined;
  let businessApplicableFactorCount = 0;
  let businessApportionmentFraction: Decimal | undefined;
  let totalNetProfits: Decimal | undefined;
  let paNetProfits: Decimal | undefined;

  if (business) {
    const property = factorRatio(
      zeroFloor(d(business.propertyEverywhere)),
      zeroFloor(d(business.propertyPennsylvania)),
    );
    const payroll = factorRatio(
      zeroFloor(d(business.payrollEverywhere)),
      zeroFloor(d(business.payrollPennsylvania)),
    );
    const sales = factorRatio(
      zeroFloor(d(business.salesEverywhere)),
      zeroFloor(d(business.salesPennsylvania)),
    );

    propertyFactor = property.ratio;
    payrollFactor = payroll.ratio;
    salesFactor = sales.ratio;
    businessFactorSum = sum(propertyFactor, payrollFactor, salesFactor);
    businessApplicableFactorCount = [property, payroll, sales].filter((factor) => factor.applies).length;
    businessApportionmentFraction = businessApplicableFactorCount > 0
      ? toSixDecimalPlaces(businessFactorSum.dividedBy(businessApplicableFactorCount))
      : ZERO;
    totalNetProfits = roundDollar(d(business.totalNetProfits));
    paNetProfits = roundDollar(totalNetProfits.times(businessApportionmentFraction));

    audit.record(
      "PA-Schedule-NRH",
      "II-1",
      "Property factor",
      propertyFactor,
      "Pennsylvania property / total property, rounded to six decimal places",
    );
    audit.record(
      "PA-Schedule-NRH",
      "II-2",
      "Payroll factor",
      payrollFactor,
      "Pennsylvania compensation / total compensation, rounded to six decimal places",
    );
    audit.record(
      "PA-Schedule-NRH",
      "II-3",
      "Sales factor",
      salesFactor,
      "Pennsylvania sales / total sales, rounded to six decimal places",
    );
    audit.record(
      "PA-Schedule-NRH",
      "II-4",
      "Sum of applicable factors",
      businessFactorSum,
      "Line II-1 + Line II-2 + Line II-3",
    );
    audit.record(
      "PA-Schedule-NRH",
      "II-5",
      "Allocating fraction",
      businessApportionmentFraction,
      "Line II-4 / applicable factor count, rounded to six decimal places",
      {
        "Applicable factor count": new Decimal(businessApplicableFactorCount),
      },
    );
    audit.record(
      "PA-Schedule-NRH",
      "II-6",
      "Total net profits from business, profession, or farm income",
      totalNetProfits,
      "Input total net profits from PA Schedule C or PA Schedule F",
    );
    audit.record(
      "PA-Schedule-NRH",
      "II-7",
      "Net profits allocated to Pennsylvania",
      paNetProfits,
      "Line II-6 × Line II-5, rounded to nearest dollar",
    );
  }

  return {
    workingDays,
    workingDayFraction,
    businessVolumeFraction,
    selectedApportionmentFraction,
    employerReportedPAGrossCompensation,
    grossCompensation,
    apportionedGrossCompensation,
    unreimbursedEmployeeBusinessExpenses,
    apportionedEmployeeBusinessExpenses,
    employerReimbursementsNotInW2,
    apportionedExpenseReimbursements,
    totalPAGrossCompensation,
    netPATaxableCompensation,
    propertyFactor,
    payrollFactor,
    salesFactor,
    businessFactorSum,
    businessApplicableFactorCount,
    businessApportionmentFraction,
    totalNetProfits,
    paNetProfits,
    lines: audit.getLines(),
  };
}
