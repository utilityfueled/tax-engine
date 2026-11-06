/** Actual PA rental worksheet; spec/state/pa-schedule-e.yaml. */
import Decimal from "decimal.js";
import type { RentalProperty } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";
import { getPARentalOwnershipFraction } from "./pa-rental-ownership.js";

const expenseLines = [
  ["advertising", "3"], ["autoTravel", "4"], ["cleaning", "5"], ["commissions", "6"],
  ["insurance", "7"], ["legalProfessional", "8"], ["managementFees", "9"], ["mortgageInterest", "10"],
  ["otherInterest", "11"], ["repairs", "12"], ["supplies", "13"], ["taxes", "14"],
  ["utilities", "15"], ["depreciation", "16"], ["otherExpenses", "18"],
] as const;

export interface PARentalIncomeExpensesResult {
  taxYear: number;
  description: string;
  accountHolder?: RentalProperty["accountHolder"];
  sourceFactsVerified: boolean;
  grossRents: Decimal;
  allowableExpenses: Decimal;
  netIncome: Decimal;
  lines: CalculatedLine[];
}

export function calculatePARentalIncomeExpenses(property: RentalProperty, taxYear: number): PARentalIncomeExpensesResult {
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error("PA rental worksheet year is not supported");
  const source = property.paIncomeExpenses;
  const sourceRequired = taxYear === 2026 || property.sourceFactsConfirmed !== undefined || source !== undefined;
  const share = getPARentalOwnershipFraction(property);
  const audit = new AuditTrail();
  if (sourceRequired) {
    if (!source || source.factsConfirmed !== true || !source.sourceReference?.trim()) throw new Error("PA rental income and expense worksheet requires confirmed actual sources");
    if (source.taxYear !== taxYear) throw new Error("PA rental worksheet source year must match the return year");
    if (source.amountsBeforeOwnershipAllocation !== true || source.expensesAreRentalUseOnly !== true || source.paRulesApplied !== true) {
      throw new Error("PA rental worksheet must use PA rental-use expenses before ownership allocation");
    }
    for (const field of ["grossRents", ...expenseLines.map(([key]) => key)] as const) {
      if (typeof source[field] !== "string" || !source[field].trim() || !d(source[field]).isFinite() || d(source[field]).isNegative()) {
        throw new Error(`PA rental worksheet ${field} requires an actual finite nonnegative amount, including known zero`);
      }
    }
    if (d(source.depreciation).gt(0) && !source.depreciationSourceReference?.trim()) throw new Error("PA rental depreciation requires its actual PA worksheet reference");
    if (property.personalUseDays > 0 && !source.allocationSourceReference?.trim()) throw new Error("PA personal-use property requires the actual rental-use allocation worksheet");
    if (d(source.otherExpenses).gt(0) && !source.otherExpenseDescription?.trim()) throw new Error("PA other rental expenses require actual itemized descriptions");
  }
  const allocated = (amount: string | undefined) => sourceRequired ? roundDollar(d(amount).times(share)) : d(amount).times(share);
  const grossRents = allocated(source?.grossRents ?? property.rents);
  audit.record("PA-Schedule-E-Property", "1", "PA gross rents", grossRents,
    sourceRequired ? "Actual PA gross rents times ownership share; rounded to whole dollars" : "Unverified historical federal-source preview", { ownershipFraction: share });
  audit.record("PA-Schedule-E-Property", "2", "Royalties on this rental-property record", new Decimal(0), "Royalties require a separate actual royalty source record");
  let allowableExpenses = new Decimal(0);
  for (const [field, line] of expenseLines) {
    const amount = allocated(source?.[field] ?? property[field]);
    allowableExpenses = allowableExpenses.plus(amount);
    audit.record("PA-Schedule-E-Property", line, `PA rental ${field}`, amount,
      sourceRequired ? "Actual PA rental-use expense times ownership share; rounded to whole dollars" : "Unverified historical federal-source preview", { ownershipFraction: share });
  }
  audit.record("PA-Schedule-E-Property", "17", "Depletion on this real-estate rental record", new Decimal(0), "Mineral interests require a separate actual depletion worksheet");
  const netIncome = grossRents.minus(allowableExpenses);
  audit.record("PA-Schedule-E-Property", "19", "Total PA property expenses", allowableExpenses, "Sum of printed expense lines3 through18");
  audit.record("PA-Schedule-E-Property", "20", "PA property income", zeroFloor(netIncome), "max(0, line1 - line19)");
  audit.record("PA-Schedule-E-Property", "21", "PA property loss", zeroFloor(netIncome.negated()), "max(0, line19 - line1); signed net retains the loss");
  audit.record("PA Rental Source", "verified", "Actual PA source worksheet verified", new Decimal(sourceRequired ? 1 : 0),
    sourceRequired ? `Year ${taxYear}; source ${source?.sourceReference}; separate PA worksheet, not federal depreciation` : "Historical unconfirmed preview; not evidence of actual PA deductions");
  return { taxYear, description: property.description, accountHolder: property.accountHolder, sourceFactsVerified: sourceRequired,
    grossRents, allowableExpenses, netIncome, lines: audit.getLines() };
}
