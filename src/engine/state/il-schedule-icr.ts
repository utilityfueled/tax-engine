/**
 * Illinois Schedule ICR — Nonrefundable Credits
 * Spec: spec/state/il-schedule-icr.yaml
 *
 * Computes three nonrefundable credits applied in order against IL income tax:
 * 1. Property Tax Credit: 5% of qualifying property taxes on principal residence
 * 2. K-12 Education Expense Credit: 25% of expenses over $250, max $750
 * 3. Volunteer Emergency Worker Credit: $500 per qualifying person
 *
 * Property tax and education credits denied if AGI > $250K (single) / $500K (MFJ).
 */

import Decimal from "decimal.js";
import { zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";
import {
  IL_SCHEDULE_ICR_CONSTANTS as SHARED_IL_SCHEDULE_ICR_CONSTANTS,
  type FilingStatus,
  type IllinoisScheduleICRConstants,
} from "@/models/constants.js";
import {
  calculateILK12EducationExpenseWorksheet,
  type ILK12EducationExpenseWorksheetInput,
  type ILK12EducationExpenseWorksheetResult,
} from "./il-k12-education-expense-worksheet.js";

export type ILScheduleICRConstants = IllinoisScheduleICRConstants;
export const IL_ICR_CONSTANTS = SHARED_IL_SCHEDULE_ICR_CONSTANTS;
export type ScheduleICRResidencyType = "resident" | "part_year" | "nonresident";

export interface ILPropertyTaxProperty {
  county: string;
  propertyNumber: string;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ScheduleICRInput {
  taxYear: number;
  /** Residency flag used to deny resident-only credits on explicit nonresident returns. */
  residencyType?: ScheduleICRResidencyType;
  /** Property tax paid on principal residence during tax year */
  propertyTaxPaid: Decimal;
  /** Schedule ICR Lines 4b through 4d county / parcel identifiers supporting the claimed property tax. */
  propertyTaxProperties?: ILPropertyTaxProperty[];
  /** Portion of property tax deducted as business expense on federal return */
  propertyTaxBusinessDeduction: Decimal;
  /** Credit already claimed on another separate Illinois return against the same shared property-tax cap */
  propertyTaxCreditClaimedOnOtherReturns?: Decimal;
  /** Total qualified K-12 education expenses */
  k12EducationExpenses: Decimal;
  /** Optional page-3 worksheet rows that determine Line 7a when provided */
  k12EducationExpenseWorksheet?: ILK12EducationExpenseWorksheetInput;
  /** Credit already claimed on another separate Illinois return against the same shared education-credit cap */
  educationCreditClaimedOnOtherReturns?: Decimal;
  /** Number of persons qualifying for volunteer emergency worker credit (0, 1, or 2) */
  volunteerEmergencyWorkerCount: number;
  /** One IDOR certificate number is required for each claimed volunteer emergency worker. */
  volunteerEmergencyWorkerCertificateNumbers?: string[];
}

/** Extended input used internally — includes values from IL-1040 computation */
export interface ScheduleICRComputedInput extends ScheduleICRInput {
  incomeTax: Decimal;
  otherStateCredit: Decimal;
  federalAGI: Decimal;
  filingStatus: FilingStatus;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface ScheduleICRResult {
  remainingTax: Decimal; // Line 3
  propertyTaxProperties: ILPropertyTaxProperty[];
  propertyTaxCredit: Decimal; // Line 5
  educationCredit: Decimal; // Line 8
  volunteerCredit: Decimal; // Line 11
  totalCredit: Decimal; // Line 13
  k12EducationExpenseWorksheet?: ILK12EducationExpenseWorksheetResult;
  lines: CalculatedLine[];
}

interface NormalizedScheduleICRMonetaryInputs {
  incomeTax: Decimal;
  otherStateCredit: Decimal;
  propertyTaxPaid: Decimal;
  propertyTaxBusinessDeduction: Decimal;
  propertyTaxCreditClaimedOnOtherReturns: Decimal;
  k12EducationExpenses: Decimal;
  educationCreditClaimedOnOtherReturns: Decimal;
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculateScheduleICR(input: ScheduleICRComputedInput): ScheduleICRResult {
  const c = IL_ICR_CONSTANTS[input.taxYear];
  if (!c) {
    throw new Error(`IL Schedule ICR constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const FORM = "Schedule ICR";
  const isMFJ = input.filingStatus === "married_filing_jointly";
  const agiKey = isMFJ ? "mfj" : "other";
  const residencyType = input.residencyType ?? "resident";
  const explicitlyNonresident = residencyType === "nonresident";
  const agiExceedsThreshold = input.federalAGI.greaterThan(c.agiThreshold[agiKey]);
  const propertyTaxProperties = validatePropertyTaxProperties(input, explicitlyNonresident);
  const volunteerEmergencyWorkerCertificateNumbers = validateVolunteerEmergencyWorkerCreditInput(input);
  const normalizedAmounts = validateScheduleICRMonetaryInputs(input);
  let k12EducationExpenseWorksheetResult: ILK12EducationExpenseWorksheetResult | undefined;

  if (input.k12EducationExpenseWorksheet) {
    k12EducationExpenseWorksheetResult = calculateILK12EducationExpenseWorksheet(input.k12EducationExpenseWorksheet);
    audit.merge(k12EducationExpenseWorksheetResult.lines);
  }

  // Line 1: Income tax from IL-1040
  const line1 = audit.record(
    FORM,
    "1",
    "Income tax from IL-1040, Line 14",
    normalizedAmounts.incomeTax,
    "Round IL-1040, Line 14 to the nearest whole dollar",
    { incomeTax: normalizedAmounts.incomeTax },
  );

  // Line 2: Other state credit
  const line2 = audit.record(
    FORM,
    "2",
    "Credit for tax paid to other states",
    normalizedAmounts.otherStateCredit,
    "Round IL-1040, Line 15 to the nearest whole dollar",
    { otherStateCredit: normalizedAmounts.otherStateCredit },
  );

  // Line 3: Remaining tax
  const line3 = audit.record(FORM, "3", "Remaining tax available for credits", zeroFloor(line1.minus(line2)), "max(Line 1 - Line 2, 0)", { line1, line2 });

  // ---- Section A: Property Tax Credit ----
  let propertyTaxCredit = new Decimal(0);
  if (!agiExceedsThreshold && !explicitlyNonresident) {
    const line4a = normalizedAmounts.propertyTaxPaid;
    const line4e = normalizedAmounts.propertyTaxBusinessDeduction;
    const line4f = zeroFloor(line4a.minus(line4e));
    const line4g = roundDollar(line4f.times(c.propertyTaxCreditRate));
    const propertyTaxCreditClaimedOnOtherReturns = normalizedAmounts.propertyTaxCreditClaimedOnOtherReturns;
    const availablePropertyTaxCredit = zeroFloor(line4g.minus(propertyTaxCreditClaimedOnOtherReturns));

    audit.record(
      FORM,
      "4a",
      "Total IL property tax paid on principal residence",
      line4a,
      "Round the supported input amount to the nearest whole dollar",
      {
      propertyTaxPaid: line4a,
      propertyTaxProperties: summarizePropertyTaxProperties(propertyTaxProperties),
      },
    );
    audit.record(
      FORM,
      "4e",
      "Property tax deducted as business expense",
      line4e,
      "Round the supported input amount to the nearest whole dollar",
      { businessDeduction: line4e },
    );
    audit.record(FORM, "4f", "Residential property tax", line4f, "Line 4a - Line 4e", { line4a, line4e });
    audit.record(FORM, "4g", "Property tax credit amount", line4g, "Line 4f × 5%", { line4f, rate: c.propertyTaxCreditRate });

    propertyTaxCredit = Decimal.min(availablePropertyTaxCredit, line3);
  }
  const line5 = audit.record(
    FORM,
    "5",
    "Property tax credit (limited to remaining tax)",
    propertyTaxCredit,
    "min(max(Line 4g - credit claimed on another return, 0), Line 3)",
    {
      propertyTaxCredit,
      line3,
      propertyTaxCreditClaimedOnOtherReturns: normalizedAmounts.propertyTaxCreditClaimedOnOtherReturns,
    },
  );

  const line6 = audit.record(FORM, "6", "Remaining tax after property tax credit", line3.minus(line5), "Line 3 - Line 5", { line3, line5 });

  // ---- Section B: K-12 Education Expense Credit ----
  let educationCredit = new Decimal(0);
  const line7a = k12EducationExpenseWorksheetResult
    ? audit.record(
        FORM,
        "7a",
        "Total qualified K-12 education expenses",
        k12EducationExpenseWorksheetResult.totalQualifiedEducationExpenses,
        "K-12 Education Expense Worksheet, Line 15",
        { worksheetLine15: k12EducationExpenseWorksheetResult.totalQualifiedEducationExpenses },
      )
    : audit.record(
        FORM,
        "7a",
        "Total qualified K-12 education expenses",
        normalizedAmounts.k12EducationExpenses,
        "Round the supported direct total input to the nearest whole dollar",
        { k12Expenses: normalizedAmounts.k12EducationExpenses },
      );
  if (!agiExceedsThreshold && !explicitlyNonresident) {
    const line7b = c.educationExpenseFloor;
    const line7c = zeroFloor(line7a.minus(line7b));
    const rawCredit = roundDollar(line7c.times(c.educationCreditRate));
    const line7d = Decimal.min(rawCredit, c.educationCreditMax);
    const educationCreditClaimedOnOtherReturns = normalizedAmounts.educationCreditClaimedOnOtherReturns;
    const availableEducationCredit = zeroFloor(line7d.minus(educationCreditClaimedOnOtherReturns));

    audit.record(FORM, "7b", "First $250 excluded", line7b, "$250", {});
    audit.record(FORM, "7c", "Expenses over threshold", line7c, "max(Line 7a - Line 7b, 0)", { line7a, line7b });
    audit.record(FORM, "7d", "Education credit amount", line7d, "min(Line 7c × 25%, $750)", { line7c, rate: c.educationCreditRate, max: c.educationCreditMax });

    educationCredit = Decimal.min(availableEducationCredit, line6);
  }
  const line8 = audit.record(
    FORM,
    "8",
      "Education credit (limited to remaining tax)",
      educationCredit,
      "min(max(Line 7d - credit claimed on another return, 0), Line 6)",
      {
        educationCredit,
        line6,
        residencyType,
        educationCreditClaimedOnOtherReturns: normalizedAmounts.educationCreditClaimedOnOtherReturns,
      },
  );

  const line9 = audit.record(FORM, "9", "Remaining tax after education credit", line6.minus(line8), "Line 6 - Line 8", { line6, line8 });

  // ---- Section C: Volunteer Emergency Worker Credit ----
  const rawVolunteerCredit = c.volunteerCreditPerPerson.times(input.volunteerEmergencyWorkerCount);
  const volunteerCredit = Decimal.min(rawVolunteerCredit, line9);
  audit.record(FORM, "10", "Volunteer emergency worker credit amount", rawVolunteerCredit, "$500 × count of supported certificates", {
    count: new Decimal(input.volunteerEmergencyWorkerCount),
    certificates: volunteerEmergencyWorkerCertificateNumbers.join(", ") || "none",
  });
  const line11 = audit.record(FORM, "11", "Volunteer credit (limited to remaining tax)", volunteerCredit, "min(Line 10, Line 9)", { rawVolunteerCredit, line9 });

  // ---- Line 13: Total ----
  const totalCredit = audit.record(FORM, "13", "Total nonrefundable credits from Schedule ICR", line5.plus(line8).plus(line11), "Line 5 + Line 8 + Line 11", { line5, line8, line11 });

  return {
    remainingTax: line3,
    propertyTaxProperties,
    propertyTaxCredit: line5,
    educationCredit: line8,
    volunteerCredit: line11,
    totalCredit,
    k12EducationExpenseWorksheet: k12EducationExpenseWorksheetResult,
    lines: audit.getLines(),
  };
}

function validateVolunteerEmergencyWorkerCreditInput(input: ScheduleICRComputedInput): string[] {
  if (!Number.isInteger(input.volunteerEmergencyWorkerCount) || input.volunteerEmergencyWorkerCount < 0) {
    throw new Error("Schedule ICR volunteer emergency worker count must be a non-negative whole number");
  }

  const maxVolunteerEmergencyWorkers = input.filingStatus === "married_filing_jointly" ? 2 : 1;
  if (input.volunteerEmergencyWorkerCount > maxVolunteerEmergencyWorkers) {
    throw new Error(
      maxVolunteerEmergencyWorkers === 1
        ? "Schedule ICR volunteer emergency worker count cannot exceed 1 unless filing jointly"
        : "Schedule ICR volunteer emergency worker count cannot exceed 2",
    );
  }

  const certificateNumbers = (input.volunteerEmergencyWorkerCertificateNumbers ?? []).map((certificateNumber) => certificateNumber.trim());
  if (certificateNumbers.some((certificateNumber) => certificateNumber.length === 0)) {
    throw new Error("Schedule ICR volunteer emergency worker certificate numbers must be non-empty");
  }

  if (new Set(certificateNumbers).size !== certificateNumbers.length) {
    throw new Error("Schedule ICR volunteer emergency worker certificate numbers must be unique");
  }

  if (certificateNumbers.length !== input.volunteerEmergencyWorkerCount) {
    throw new Error("Schedule ICR volunteer emergency worker certificate count must match the claimed volunteer emergency worker count");
  }

  return certificateNumbers;
}

function validatePropertyTaxProperties(
  input: ScheduleICRComputedInput,
  explicitlyNonresident: boolean,
): ILPropertyTaxProperty[] {
  const normalizedProperties = (input.propertyTaxProperties ?? []).map((property, index) => {
    const county = property.county.trim();
    const propertyNumber = property.propertyNumber.trim();

    if (county.length === 0) {
      throw new Error(`Schedule ICR property tax property ${index + 1} county is required`);
    }

    if (propertyNumber.length === 0) {
      throw new Error(`Schedule ICR property tax property ${index + 1} property number is required`);
    }

    return {
      county,
      propertyNumber,
    };
  });

  if (normalizedProperties.length > 3) {
    throw new Error("Schedule ICR supports at most three county and property number entries on Lines 4b through 4d");
  }

  if (!explicitlyNonresident && roundDollar(input.propertyTaxPaid).greaterThan(0) && normalizedProperties.length === 0) {
    throw new Error("Schedule ICR property tax credit claims require at least one county and property number");
  }

  return normalizedProperties;
}

function validateScheduleICRMonetaryInputs(input: ScheduleICRComputedInput): NormalizedScheduleICRMonetaryInputs {
  validateNonNegativeAmount(input.incomeTax, "Schedule ICR Line 1 income tax");
  validateNonNegativeAmount(input.otherStateCredit, "Schedule ICR Line 2 other state credit");
  validateNonNegativeAmount(input.propertyTaxPaid, "Schedule ICR Line 4a property tax paid");
  validateNonNegativeAmount(input.propertyTaxBusinessDeduction, "Schedule ICR Line 4e business deduction");
  validateNonNegativeAmount(
    input.propertyTaxCreditClaimedOnOtherReturns ?? new Decimal(0),
    "Schedule ICR property tax credit claimed on another return",
  );
  if (!input.k12EducationExpenseWorksheet) {
    validateNonNegativeAmount(input.k12EducationExpenses, "Schedule ICR Line 7a K-12 education expenses");
  }
  validateNonNegativeAmount(
    input.educationCreditClaimedOnOtherReturns ?? new Decimal(0),
    "Schedule ICR education credit claimed on another return",
  );

  const roundedIncomeTax = roundDollar(input.incomeTax);
  const roundedOtherStateCredit = roundDollar(input.otherStateCredit);
  const roundedPropertyTaxPaid = roundDollar(input.propertyTaxPaid);
  const roundedPropertyTaxBusinessDeduction = roundDollar(input.propertyTaxBusinessDeduction);
  const roundedPropertyTaxCreditClaimedOnOtherReturns = roundDollar(
    input.propertyTaxCreditClaimedOnOtherReturns ?? new Decimal(0),
  );
  const roundedK12EducationExpenses = roundDollar(input.k12EducationExpenses);
  const roundedEducationCreditClaimedOnOtherReturns = roundDollar(
    input.educationCreditClaimedOnOtherReturns ?? new Decimal(0),
  );

  if (roundedPropertyTaxBusinessDeduction.greaterThan(roundedPropertyTaxPaid)) {
    throw new Error("Schedule ICR Line 4e business deduction cannot exceed Line 4a property tax paid");
  }

  return {
    incomeTax: roundedIncomeTax,
    otherStateCredit: roundedOtherStateCredit,
    propertyTaxPaid: roundedPropertyTaxPaid,
    propertyTaxBusinessDeduction: roundedPropertyTaxBusinessDeduction,
    propertyTaxCreditClaimedOnOtherReturns: roundedPropertyTaxCreditClaimedOnOtherReturns,
    k12EducationExpenses: roundedK12EducationExpenses,
    educationCreditClaimedOnOtherReturns: roundedEducationCreditClaimedOnOtherReturns,
  };
}

function validateNonNegativeAmount(value: Decimal, description: string): void {
  if (value.lessThan(0)) {
    throw new Error(`${description} must be non-negative`);
  }
}

function summarizePropertyTaxProperties(properties: ILPropertyTaxProperty[]): string {
  if (properties.length === 0) {
    return "none";
  }

  return properties
    .map((property) => `${property.county}:${property.propertyNumber}`)
    .join("; ");
}
