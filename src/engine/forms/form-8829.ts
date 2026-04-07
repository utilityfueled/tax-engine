/**
 * Form 8829 — Expenses for Business Use of Your Home
 * Spec: spec/federal/form-8829.yaml
 *
 * This slice supports the actual-expense home-office calculation that flows
 * into Schedule C line 30.
 */

import Decimal from "decimal.js";
import type { Form8829ExpenseBucket, Form8829Input } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, zeroFloor } from "@/utils/decimal.js";

export interface Form8829Result {
  line1: Decimal;
  line2: Decimal;
  line3: Decimal;
  line4: Decimal;
  line5: Decimal;
  line6: Decimal;
  line7: Decimal;
  line8: Decimal;
  line9Direct: Decimal;
  line9Indirect: Decimal;
  line10Direct: Decimal;
  line10Indirect: Decimal;
  line11Direct: Decimal;
  line11Indirect: Decimal;
  line12Direct: Decimal;
  line12Indirect: Decimal;
  line13: Decimal;
  line14: Decimal;
  line15: Decimal;
  line16Direct: Decimal;
  line16Indirect: Decimal;
  line17Direct: Decimal;
  line17Indirect: Decimal;
  line18Direct: Decimal;
  line18Indirect: Decimal;
  line19Direct: Decimal;
  line19Indirect: Decimal;
  line20Direct: Decimal;
  line20Indirect: Decimal;
  line21Direct: Decimal;
  line21Indirect: Decimal;
  line22Direct: Decimal;
  line22Indirect: Decimal;
  line23Direct: Decimal;
  line23Indirect: Decimal;
  line24: Decimal;
  line25: Decimal;
  line26: Decimal;
  line27: Decimal;
  line28: Decimal;
  line29: Decimal;
  line30: Decimal;
  line31: Decimal;
  line32: Decimal;
  line33: Decimal;
  line34: Decimal;
  line35: Decimal;
  line36: Decimal;
  line37: Decimal;
  line38: Decimal;
  line39: Decimal;
  line40: Decimal;
  line41: Decimal;
  line42: Decimal;
  line43: Decimal;
  line44: Decimal;
  lines: CalculatedLine[];
}

const ZERO = new Decimal(0);
const EMPTY_EXPENSE_BUCKET: Form8829ExpenseBucket = {
  casualtyLosses: "0",
  deductibleMortgageInterest: "0",
  realEstateTaxes: "0",
  excessMortgageInterest: "0",
  excessRealEstateTaxes: "0",
  insurance: "0",
  rent: "0",
  repairsAndMaintenance: "0",
  utilities: "0",
  otherExpenses: "0",
};

export function calculateForm8829(input: Form8829Input): Form8829Result {
  const audit = new AuditTrail();
  const directExpenses = input.directExpenses ?? EMPTY_EXPENSE_BUCKET;
  const indirectExpenses = input.indirectExpenses ?? EMPTY_EXPENSE_BUCKET;

  const line1 = new Decimal(input.areaUsedForBusiness);
  const line2 = new Decimal(input.totalAreaOfHome);
  const line3 = line2.isZero() ? ZERO : line1.dividedBy(line2);
  const line4 = input.daycareHoursUsed === undefined ? ZERO : new Decimal(input.daycareHoursUsed);
  const line5 = input.daycareHoursAvailable === undefined ? ZERO : new Decimal(input.daycareHoursAvailable);
  const line6 = line4.isZero() || line5.isZero() ? ZERO : line4.dividedBy(line5);
  const line7 = isDaycareBranch(input) ? line3.times(line6) : line3;
  const line8 = d(input.grossIncomeLimit);

  const line9Direct = expense(directExpenses, "casualtyLosses");
  const line9Indirect = expense(indirectExpenses, "casualtyLosses");
  const line10Direct = expense(directExpenses, "deductibleMortgageInterest");
  const line10Indirect = expense(indirectExpenses, "deductibleMortgageInterest");
  const line11Direct = expense(directExpenses, "realEstateTaxes");
  const line11Indirect = expense(indirectExpenses, "realEstateTaxes");
  const line12Direct = line9Direct.plus(line10Direct).plus(line11Direct);
  const line12Indirect = line9Indirect.plus(line10Indirect).plus(line11Indirect);
  const line13 = roundDollar(line12Indirect.times(line7));
  const line14 = line12Direct.plus(line13);
  const line15 = zeroFloor(line8.minus(line14));

  const line16Direct = expense(directExpenses, "excessMortgageInterest");
  const line16Indirect = expense(indirectExpenses, "excessMortgageInterest");
  const line17Direct = expense(directExpenses, "excessRealEstateTaxes");
  const line17Indirect = expense(indirectExpenses, "excessRealEstateTaxes");
  const line18Direct = expense(directExpenses, "insurance");
  const line18Indirect = expense(indirectExpenses, "insurance");
  const line19Direct = expense(directExpenses, "rent");
  const line19Indirect = expense(indirectExpenses, "rent");
  const line20Direct = expense(directExpenses, "repairsAndMaintenance");
  const line20Indirect = expense(indirectExpenses, "repairsAndMaintenance");
  const line21Direct = expense(directExpenses, "utilities");
  const line21Indirect = expense(indirectExpenses, "utilities");
  const line22Direct = expense(directExpenses, "otherExpenses");
  const line22Indirect = expense(indirectExpenses, "otherExpenses");
  const line23Direct = line16Direct
    .plus(line17Direct)
    .plus(line18Direct)
    .plus(line19Direct)
    .plus(line20Direct)
    .plus(line21Direct)
    .plus(line22Direct);
  const line23Indirect = line16Indirect
    .plus(line17Indirect)
    .plus(line18Indirect)
    .plus(line19Indirect)
    .plus(line20Indirect)
    .plus(line21Indirect)
    .plus(line22Indirect);
  const line24 = roundDollar(line23Indirect.times(line7));
  const line25 = d(input.priorYearOperatingExpensesCarryover);
  const line26 = line23Direct.plus(line24).plus(line25);
  const line27 = min(line15, line26);
  const line28 = zeroFloor(line15.minus(line27));

  const line29 = roundDollar(d(input.excessCasualtyLosses).times(line7));
  const line37 = d(input.adjustedBasisOrFairMarketValue);
  const line38 = min(line37, d(input.landValue));
  const line39 = zeroFloor(line37.minus(line38));
  const line40 = roundDollar(line39.times(line7));
  const line41 = d(input.depreciationPercentage);
  const line42 = roundDollar(line40.times(line41));
  const line30 = line42;
  const priorYearExcessCasualtyLossesCarryover = d(input.priorYearExcessCasualtyLossesCarryover);
  const priorYearDepreciationCarryover = d(input.priorYearDepreciationCarryover);
  const line31 = priorYearExcessCasualtyLossesCarryover.plus(priorYearDepreciationCarryover);
  const line32 = line29.plus(line30).plus(line31);
  const line33 = min(line28, line32);
  const line34 = line14.plus(line27).plus(line33);

  const casualtyPortionOfLine14 = line9Direct.plus(roundDollar(line9Indirect.times(line7)));
  const casualtyPoolFromLines29And31 = line29.plus(priorYearExcessCasualtyLossesCarryover);
  const line35 = casualtyPortionOfLine14.plus(min(line33, casualtyPoolFromLines29And31));
  const line36 = zeroFloor(line34.minus(line35));
  const line43 = zeroFloor(line26.minus(line27));
  const line44 = zeroFloor(line32.minus(line33));

  audit.record("Form 8829", "1", "Area used for business", line1, "Validated business-use area");
  audit.record("Form 8829", "2", "Total area of home", line2, "Validated home area");
  audit.record("Form 8829", "3", "Business-use area percentage", line3, "Line 1 / Line 2", {
    "Form 8829 Line 1": line1,
    "Form 8829 Line 2": line2,
  });
  audit.record("Form 8829", "4", "Daycare hours used", line4,
    isDaycareBranch(input) ? "Validated daycare-use hours" : "No daycare branch");
  audit.record("Form 8829", "5", "Daycare hours available", line5,
    isDaycareBranch(input) ? "Validated daycare-available hours" : "No daycare branch");
  audit.record("Form 8829", "6", "Daycare time-use percentage", line6,
    isDaycareBranch(input) ? "Line 4 / Line 5" : "No daycare branch",
    isDaycareBranch(input)
      ? {
        "Form 8829 Line 4": line4,
        "Form 8829 Line 5": line5,
      }
      : {});
  audit.record("Form 8829", "7", "Business percentage", line7,
    isDaycareBranch(input) ? "Line 3 × Line 6" : "Line 3",
    isDaycareBranch(input)
      ? {
        "Form 8829 Line 3": line3,
        "Form 8829 Line 6": line6,
      }
      : {
        "Form 8829 Line 3": line3,
      });
  audit.record("Form 8829", "8", "Gross-income limitation base", line8, "Validated Form 8829 gross-income limitation input");

  recordPartIExpense(audit, "9", "Casualty losses", line9Direct, line9Indirect, line7);
  recordPartIExpense(audit, "10", "Deductible mortgage interest", line10Direct, line10Indirect, line7);
  recordPartIExpense(audit, "11", "Real estate taxes", line11Direct, line11Indirect, line7);
  audit.record("Form 8829", "12", "Total direct and indirect personal-type home expenses", line12Direct.plus(line12Indirect),
    "Lines 9 through 11 by column",
    {
      "Direct column total": line12Direct,
      "Indirect column total": line12Indirect,
    });
  audit.record("Form 8829", "13", "Allocated indirect personal-type home expenses", line13,
    "Indirect Line 12 total × Line 7, rounded to the nearest dollar",
    {
      "Indirect Line 12 total": line12Indirect,
      "Form 8829 Line 7": line7,
    });
  audit.record("Form 8829", "14", "Allowed casualty, mortgage-interest, and tax amount", line14,
    "Direct Line 12 total + Line 13",
    {
      "Direct Line 12 total": line12Direct,
      "Form 8829 Line 13": line13,
    });
  audit.record("Form 8829", "15", "Remaining gross-income limit", line15,
    "Line 8 - Line 14, floored at zero",
    {
      "Form 8829 Line 8": line8,
      "Form 8829 Line 14": line14,
    });

  recordPartIExpense(audit, "16", "Excess mortgage interest", line16Direct, line16Indirect, line7);
  recordPartIExpense(audit, "17", "Excess real estate taxes", line17Direct, line17Indirect, line7);
  recordPartIExpense(audit, "18", "Insurance", line18Direct, line18Indirect, line7);
  recordPartIExpense(audit, "19", "Rent", line19Direct, line19Indirect, line7);
  recordPartIExpense(audit, "20", "Repairs and maintenance", line20Direct, line20Indirect, line7);
  recordPartIExpense(audit, "21", "Utilities", line21Direct, line21Indirect, line7);
  recordPartIExpense(audit, "22", "Other expenses", line22Direct, line22Indirect, line7);
  audit.record("Form 8829", "23", "Current-year operating expenses subject to the second limit", line23Direct.plus(line23Indirect),
    "Lines 16 through 22 by column",
    {
      "Direct column total": line23Direct,
      "Indirect column total": line23Indirect,
    });
  audit.record("Form 8829", "24", "Allocated indirect operating expenses", line24,
    "Indirect Line 23 total × Line 7, rounded to the nearest dollar",
    {
      "Indirect Line 23 total": line23Indirect,
      "Form 8829 Line 7": line7,
    });
  audit.record("Form 8829", "25", "Prior-year operating expense carryover", line25, "Validated prior-year operating expense carryover");
  audit.record("Form 8829", "26", "Operating expenses available against the limit", line26,
    "Direct Line 23 total + Line 24 + Line 25",
    {
      "Direct Line 23 total": line23Direct,
      "Form 8829 Line 24": line24,
      "Form 8829 Line 25": line25,
    });
  audit.record("Form 8829", "27", "Allowable operating expenses", line27,
    "Smaller of Line 15 or Line 26",
    {
      "Form 8829 Line 15": line15,
      "Form 8829 Line 26": line26,
    });
  audit.record("Form 8829", "28", "Limit remaining for excess casualty losses and depreciation", line28,
    "Line 15 - Line 27, floored at zero",
    {
      "Form 8829 Line 15": line15,
      "Form 8829 Line 27": line27,
    });
  audit.record("Form 8829", "29", "Excess casualty losses", line29,
    "Validated excess casualty losses × Line 7, rounded to the nearest dollar",
    {
      "Validated excess casualty losses": d(input.excessCasualtyLosses),
      "Form 8829 Line 7": line7,
    });
  audit.record("Form 8829", "30", "Depreciation of home", line30, "Form 8829 Line 42", {
    "Form 8829 Line 42": line42,
  });
  audit.record("Form 8829", "31", "Prior-year excess casualty losses and depreciation carryover", line31,
    "Prior-year excess casualty loss carryover + prior-year depreciation carryover",
    {
      "Prior-year excess casualty loss carryover": priorYearExcessCasualtyLossesCarryover,
      "Prior-year depreciation carryover": priorYearDepreciationCarryover,
    });
  audit.record("Form 8829", "32", "Total casualty-loss and depreciation pool", line32,
    "Line 29 + Line 30 + Line 31",
    {
      "Form 8829 Line 29": line29,
      "Form 8829 Line 30": line30,
      "Form 8829 Line 31": line31,
    });
  audit.record("Form 8829", "33", "Allowable excess casualty losses and depreciation", line33,
    "Smaller of Line 28 or Line 32",
    {
      "Form 8829 Line 28": line28,
      "Form 8829 Line 32": line32,
    });
  audit.record("Form 8829", "34", "Total allowable home-use expenses before casualty carveout", line34,
    "Line 14 + Line 27 + Line 33",
    {
      "Form 8829 Line 14": line14,
      "Form 8829 Line 27": line27,
      "Form 8829 Line 33": line33,
    });
  audit.record("Form 8829", "35", "Casualty-loss portion removed from Schedule C", line35,
    "Casualty portion of Line 14 plus the casualty-loss share of Line 33",
    {
      "Casualty portion of Line 14": casualtyPortionOfLine14,
      "Form 8829 Line 33": line33,
      "Current and prior-year excess casualty-loss pool": casualtyPoolFromLines29And31,
    });
  audit.record("Form 8829", "36", "Allowable expenses for business use of home", line36,
    "Line 34 - Line 35",
    {
      "Form 8829 Line 34": line34,
      "Form 8829 Line 35": line35,
    });
  audit.record("Form 8829", "37", "Smaller of home basis or fair market value", line37,
    "Validated smaller of home adjusted basis or fair market value");
  audit.record("Form 8829", "38", "Land value", line38, "Validated land value, limited to Line 37", {
    "Validated land value": d(input.landValue),
    "Form 8829 Line 37": line37,
  });
  audit.record("Form 8829", "39", "Basis of building", line39, "Line 37 - Line 38, floored at zero", {
    "Form 8829 Line 37": line37,
    "Form 8829 Line 38": line38,
  });
  audit.record("Form 8829", "40", "Business basis of building", line40,
    "Line 39 × Line 7, rounded to the nearest dollar",
    {
      "Form 8829 Line 39": line39,
      "Form 8829 Line 7": line7,
    });
  audit.record("Form 8829", "41", "Depreciation percentage", line41, "Validated IRS depreciation percentage");
  audit.record("Form 8829", "42", "Depreciation allowable", line42,
    "Line 40 × Line 41, rounded to the nearest dollar",
    {
      "Form 8829 Line 40": line40,
      "Form 8829 Line 41": line41,
    });
  audit.record("Form 8829", "43", "Operating expenses carried to next year", line43,
    "Line 26 - Line 27, floored at zero",
    {
      "Form 8829 Line 26": line26,
      "Form 8829 Line 27": line27,
    });
  audit.record("Form 8829", "44", "Excess casualty losses and depreciation carried to next year", line44,
    "Line 32 - Line 33, floored at zero",
    {
      "Form 8829 Line 32": line32,
      "Form 8829 Line 33": line33,
    });

  return {
    line1,
    line2,
    line3,
    line4,
    line5,
    line6,
    line7,
    line8,
    line9Direct,
    line9Indirect,
    line10Direct,
    line10Indirect,
    line11Direct,
    line11Indirect,
    line12Direct,
    line12Indirect,
    line13,
    line14,
    line15,
    line16Direct,
    line16Indirect,
    line17Direct,
    line17Indirect,
    line18Direct,
    line18Indirect,
    line19Direct,
    line19Indirect,
    line20Direct,
    line20Indirect,
    line21Direct,
    line21Indirect,
    line22Direct,
    line22Indirect,
    line23Direct,
    line23Indirect,
    line24,
    line25,
    line26,
    line27,
    line28,
    line29,
    line30,
    line31,
    line32,
    line33,
    line34,
    line35,
    line36,
    line37,
    line38,
    line39,
    line40,
    line41,
    line42,
    line43,
    line44,
    lines: audit.getLines(),
  };
}

function expense(expenses: Form8829ExpenseBucket, key: keyof Form8829ExpenseBucket): Decimal {
  return d(expenses[key]);
}

function isDaycareBranch(input: Form8829Input): boolean {
  return input.daycareHoursUsed !== undefined && input.daycareHoursAvailable !== undefined;
}

function recordPartIExpense(
  audit: AuditTrail,
  line: string,
  label: string,
  directAmount: Decimal,
  indirectAmount: Decimal,
  businessPercentage: Decimal
): void {
  audit.record("Form 8829", line, label, directAmount.plus(indirectAmount), "Validated direct and indirect amounts", {
    Direct: directAmount,
    Indirect: indirectAmount,
    "Form 8829 Line 7": businessPercentage,
  });
}
