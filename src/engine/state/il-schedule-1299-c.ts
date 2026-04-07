/**
 * Illinois Schedule 1299-C — Step 3 Nonrefundable Credit Ordering
 * Spec: spec/state/il-schedule-1299-c.yaml
 *
 * Supported slice: compute the Step 3 credit grid that flows to IL-1040 Line 17.
 * Credit eligibility and Step 2 worksheet math remain upstream and must be
 * provided as validated credit rows.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { zeroFloor } from "@/utils/decimal.js";

export const IL_SCHEDULE_1299_C_CREDIT_NAMES = {
  "0160": "Apprenticeship Education",
  "1000": "Historic Preservation",
  "1030": "Historic Preservation",
  "1050": "AIM High Impact Business Investment",
  "1060": "Reimagining Energy and Vehicles in Illinois (REV Illinois) Investment",
  "2000": "TECH-PREP Youth Vocational Programs",
  "2010": "Dependent Care Assistance Program",
  "2020": "Film Production Services",
  "2030": "Jobs Tax",
  "2040": "Veteran Employment",
  "2050": "Student-Assistance Contribution",
  "2060": "Agricultural Areas Conservation and Protection",
  "2070": "Enterprise Zone / Foreign Trade Zone Employee",
  "2090": "REV Illinois / Enterprise Zone Construction Jobs",
  "2100": "Data Center Investment",
  "2110": "Apprenticeship Education Expense",
  "2120": "Research and Development",
  "2130": "Instructional Materials and Supplies",
  "2140": "Volunteer Emergency Worker",
  "2150": "Adoption",
  "2160": "Manufacturing Illinois Chips for Real Opportunity Act (MICRO)",
  "2170": "Illinois Gives",
  "2180": "Property Tax and K-12 Education Expense",
  "2190": "Angel Investment - Innovation",
  "2200": "Angel Investment",
  "2210": "Affordable Housing Donations",
  "2220": "High Impact Business Dividend",
  "2230": "New Markets Development Program",
  "2240": "River Edge Historic Preservation",
  "2250": "Live Theater Production",
  "2260": "Film Production Services Transfer",
  "2270": "New Markets Development Program Transfer",
  "2280": "River Edge Historic Preservation Transfer",
  "2290": "Angel Investment Transfer",
  "2300": "High Impact Business Dividend",
  "2310": "Affordable Housing Donations Recapture",
  "2320": "New Markets Development Program Recapture",
  "2330": "River Edge Historic Preservation Recapture",
  "2340": "Angel Investment Recapture",
  "5100": "Apprenticeship Education",
  "5110": "Historic Preservation",
  "5140": "Historic Preservation",
  "5160": "REV Illinois Investment",
  "6100": "TECH-PREP Youth Vocational Programs",
  "6110": "Dependent Care Assistance Program",
  "6120": "Film Production Services",
  "6130": "Jobs Tax",
  "6140": "Veteran Employment",
  "6150": "Student-Assistance Contribution",
  "6160": "Agricultural Areas Conservation and Protection",
  "6170": "Enterprise Zone / Foreign Trade Zone Employee",
  "6190": "REV Illinois / Enterprise Zone Construction Jobs",
  "6200": "Data Center Investment",
  "6210": "Apprenticeship Education Expense",
  "6220": "Research and Development",
  "6230": "Instructional Materials and Supplies",
  "6240": "Volunteer Emergency Worker",
  "6250": "Adoption",
  "6260": "MICRO",
  "6270": "Illinois Gives",
  "6280": "Property Tax and K-12 Education Expense",
  "6290": "Angel Investment - Innovation",
  "6300": "Angel Investment",
  "6310": "Affordable Housing Donations",
  "6320": "High Impact Business Dividend",
  "6330": "New Markets Development Program",
  "6340": "River Edge Historic Preservation",
  "6350": "Live Theater Production",
  "6360": "Film Production Services Transfer",
  "6370": "New Markets Development Program Transfer",
  "6380": "River Edge Historic Preservation Transfer",
  "6390": "Angel Investment Transfer",
  "6400": "High Impact Business Dividend",
  "6410": "Affordable Housing Donations Recapture",
  "6420": "New Markets Development Program Recapture",
  "6430": "River Edge Historic Preservation Recapture",
  "6440": "Angel Investment Recapture",
} as const;

export type ILSchedule1299CCreditCode = keyof typeof IL_SCHEDULE_1299_C_CREDIT_NAMES;
export type ILSchedule1299CCarryforwardPeriodYears = 0 | 2 | 5 | 10;

export interface Schedule1299CCreditInput {
  yearsLeftToCarry: number;
  carryforwardPeriodYears: ILSchedule1299CCarryforwardPeriodYears;
  creditCode: ILSchedule1299CCreditCode;
  creditYearEnding: string;
  identifyingNumber?: string;
  creditEarnedOrCarried: Decimal;
  distributiveShareOrTransfer?: Decimal;
}

export interface Schedule1299CAttachmentInput {
  taxYear: number;
  credits: Schedule1299CCreditInput[];
}

export interface Schedule1299CInput extends Schedule1299CAttachmentInput {
  incomeTax: Decimal;
  otherStateAndScheduleICRCredits: Decimal;
}

export interface Schedule1299CComputedCredit extends Schedule1299CCreditInput {
  distributiveShareOrTransfer: Decimal;
  totalCredit: Decimal;
  remainingTaxAfterCredit?: Decimal;
  creditApplied: Decimal;
  creditCarryforward: Decimal;
}

export interface Schedule1299CResult {
  incomeTax: Decimal;
  otherStateAndScheduleICRCredits: Decimal;
  remainingIncomeTaxAfterOtherCredits: Decimal;
  availableIncomeTax: Decimal;
  credits: Schedule1299CComputedCredit[];
  totalCreditApplied: Decimal;
  credit: Decimal;
  lines: CalculatedLine[];
}

const FORM = "Schedule 1299-C";
const SUPPORTED_TAX_YEARS = new Set([2025]);
const MAX_CREDIT_ROWS = 21;
const ZERO = new Decimal(0);
const CREDIT_YEAR_ENDING_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function calculateSchedule1299C(input: Schedule1299CInput): Schedule1299CResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(`Schedule 1299-C is not supported for tax year ${input.taxYear}`);
  }

  validateWholeDollarAmount(input.incomeTax, "Schedule 1299-C Line 17 income tax");
  validateWholeDollarAmount(
    input.otherStateAndScheduleICRCredits,
    "Schedule 1299-C Line 18 prior Illinois credits",
  );

  if (input.credits.length > MAX_CREDIT_ROWS) {
    throw new Error(`Schedule 1299-C supports at most ${MAX_CREDIT_ROWS} credit rows on Lines 21 through 41`);
  }

  const normalizedCredits = input.credits.map(normalizeCreditInput).sort(compareCreditOrdering);
  const audit = new AuditTrail();

  const line17 = audit.record(
    FORM,
    "17",
    "Income tax from IL-1040",
    input.incomeTax,
    "IL-1040, Line 14",
    { incomeTax: input.incomeTax },
  );
  const line18 = audit.record(
    FORM,
    "18",
    "Credits already claimed on IL-1040 Lines 15 and 16",
    input.otherStateAndScheduleICRCredits,
    "IL-1040 Line 15 + IL-1040 Line 16",
    { otherStateAndScheduleICRCredits: input.otherStateAndScheduleICRCredits },
  );
  const line19 = audit.record(
    FORM,
    "19",
    "Income tax available for Schedule 1299-C",
    zeroFloor(line17.minus(line18)),
    "max(Line 17 - Line 18, 0)",
    { line17, line18 },
  );
  const line20 = audit.record(
    FORM,
    "20",
    "Available income tax carried to the credit grid",
    line19,
    "Line 19",
    { line19 },
  );

  let remainingTaxBeforeCredit = line20;
  let taxExhausted = remainingTaxBeforeCredit.lte(0);
  const computedCredits: Schedule1299CComputedCredit[] = [];

  normalizedCredits.forEach((credit, index) => {
    const lineNumber = String(21 + index);
    const totalCredit = audit.record(
      FORM,
      `${lineNumber}G`,
      `Line ${lineNumber} total credit`,
      credit.creditEarnedOrCarried.plus(credit.distributiveShareOrTransfer),
      "Column E + Column F",
      {
        columnE: credit.creditEarnedOrCarried,
        columnF: credit.distributiveShareOrTransfer,
      },
    );

    let remainingTaxAfterCredit: Decimal | undefined;
    let creditApplied = ZERO;

    if (!taxExhausted) {
      remainingTaxAfterCredit = remainingTaxBeforeCredit.minus(totalCredit);
      creditApplied = remainingTaxAfterCredit.gte(0)
        ? totalCredit
        : totalCredit.plus(remainingTaxAfterCredit);

      audit.record(
        FORM,
        `${lineNumber}H`,
        `Line ${lineNumber} remaining tax after current credit`,
        remainingTaxAfterCredit,
        `${index === 0 ? "Line 20" : `Line ${20 + index}H`} - Line ${lineNumber}G`,
        {
          priorRemainingTax: remainingTaxBeforeCredit,
          totalCredit,
        },
      );

      if (remainingTaxAfterCredit.lte(0)) {
        taxExhausted = true;
      } else {
        remainingTaxBeforeCredit = remainingTaxAfterCredit;
      }
    }

    const creditCarryforward = credit.yearsLeftToCarry === 0
      ? ZERO
      : totalCredit.minus(creditApplied);

    audit.record(
      FORM,
      `${lineNumber}I`,
      `Line ${lineNumber} credit applied`,
      creditApplied,
      remainingTaxAfterCredit === undefined
        ? "0 because a prior credit row exhausted available tax"
        : remainingTaxAfterCredit.gte(0)
          ? `Line ${lineNumber}G`
          : `Line ${lineNumber}G + Line ${lineNumber}H`,
      {
        totalCredit,
        remainingTaxAfterCredit: remainingTaxAfterCredit ?? ZERO,
      },
    );
    audit.record(
      FORM,
      `${lineNumber}J`,
      `Line ${lineNumber} carryforward credit`,
      creditCarryforward,
      credit.yearsLeftToCarry === 0 ? "0 because Column A is 0" : `Line ${lineNumber}G - Line ${lineNumber}I`,
      {
        totalCredit,
        creditApplied,
        yearsLeftToCarry: String(credit.yearsLeftToCarry),
      },
    );

    computedCredits.push({
      ...credit,
      totalCredit,
      remainingTaxAfterCredit,
      creditApplied,
      creditCarryforward,
    });
  });

  const line42 = audit.record(
    FORM,
    "42",
    "Total credit applied",
    computedCredits.reduce((sum, credit) => sum.plus(credit.creditApplied), ZERO),
    "Sum of Column I for Lines 21 through 41",
    computedCredits.reduce<Record<string, Decimal>>((inputs, credit, index) => {
      inputs[`line${21 + index}I`] = credit.creditApplied;
      return inputs;
    }, {}),
  );
  const line43 = audit.record(
    FORM,
    "43",
    "Schedule 1299-C credit for IL-1040 Line 17",
    Decimal.min(line20, line42),
    "min(Line 20, Line 42)",
    { line20, line42 },
  );

  return {
    incomeTax: line17,
    otherStateAndScheduleICRCredits: line18,
    remainingIncomeTaxAfterOtherCredits: line19,
    availableIncomeTax: line20,
    credits: computedCredits,
    totalCreditApplied: line42,
    credit: line43,
    lines: audit.getLines(),
  };
}

function validateWholeDollarAmount(value: Decimal, label: string): void {
  if (value.lt(0)) {
    throw new Error(`${label} cannot be negative`);
  }

  if (!value.isInteger()) {
    throw new Error(`${label} must be a whole-dollar amount`);
  }
}

function normalizeCreditInput(input: Schedule1299CCreditInput): Schedule1299CCreditInput & {
  distributiveShareOrTransfer: Decimal;
} {
  if (!Number.isInteger(input.yearsLeftToCarry) || input.yearsLeftToCarry < 0 || input.yearsLeftToCarry > 10) {
    throw new Error("Schedule 1299-C Column A years left to carry must be a whole number from 0 through 10");
  }

  if (input.carryforwardPeriodYears === 0 && input.yearsLeftToCarry !== 0) {
    throw new Error(
      `Schedule 1299-C credit ${input.creditCode} cannot have ${input.yearsLeftToCarry} years left to carry with a 0-year carryforward period`,
    );
  }

  if (input.yearsLeftToCarry > input.carryforwardPeriodYears) {
    throw new Error(
      `Schedule 1299-C credit ${input.creditCode} cannot have ${input.yearsLeftToCarry} years left to carry with a ${input.carryforwardPeriodYears}-year carryforward period`,
    );
  }

  if (!CREDIT_YEAR_ENDING_PATTERN.test(input.creditYearEnding)) {
    throw new Error(`Schedule 1299-C credit ${input.creditCode} credit year ending must use YYYY-MM format`);
  }

  if (input.identifyingNumber !== undefined && input.identifyingNumber.trim().length === 0) {
    throw new Error(`Schedule 1299-C credit ${input.creditCode} identifying number cannot be empty`);
  }

  validateWholeDollarAmount(input.creditEarnedOrCarried, `Schedule 1299-C credit ${input.creditCode} Column E amount`);
  const distributiveShareOrTransfer = input.distributiveShareOrTransfer ?? ZERO;
  validateWholeDollarAmount(
    distributiveShareOrTransfer,
    `Schedule 1299-C credit ${input.creditCode} Column F amount`,
  );

  return {
    ...input,
    identifyingNumber: input.identifyingNumber?.trim(),
    distributiveShareOrTransfer,
  };
}

function compareCreditOrdering(left: Schedule1299CCreditInput, right: Schedule1299CCreditInput): number {
  return (
    left.yearsLeftToCarry - right.yearsLeftToCarry
    || left.carryforwardPeriodYears - right.carryforwardPeriodYears
    || left.creditCode.localeCompare(right.creditCode)
    || left.creditYearEnding.localeCompare(right.creditYearEnding)
    || (left.identifyingNumber ?? "").localeCompare(right.identifyingNumber ?? "")
  );
}
