/**
 * Actual 2025 Ohio IT RC, printed lines1–7.
 * Spec: spec/state/oh-resident-credit.yaml. R.C.5747.05(B),(C),(D).
 * The caller supplies actual qualifying Ohio-resident-period income and tax
 * paid, excluding income already receiving NRC. This scalar worksheet does
 * not establish residency, source/payment proof, or filing qualification.
 */
import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, zeroFloor } from "@/utils/decimal.js";

const OHIO_RECIPROCITY_STATES = new Set(["IN", "KY", "MI", "PA", "WV"]);
// Exact other-state/DC rows printed on the actual2025 IT RC. No local/foreign taxes.
const VALID_JURISDICTIONS = new Set([
  "AL", "AR", "AZ", "CA", "CO", "CT", "DC", "DE", "GA", "HI", "IA",
  "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN",
  "MO", "MS", "MT", "NC", "ND", "NE", "NJ", "NM", "NY", "OK", "OR",
  "PA", "RI", "SC", "UT", "VA", "VT", "WI", "WV",
]);
export type OhioResidentCreditIncomeType = "compensation" | "other";
export interface OtherStateTaxEntry {
  stateCode: string;
  incomeType?: OhioResidentCreditIncomeType;
  /** Actual qualifying income included in Ohio AGI; source proof belongs to caller. */
  doubleTaxedIncome: Decimal | string | number;
  /** Actual net state income tax liability paid, after that state's credits. */
  taxPaid: Decimal | string | number;
}
export interface OhioResidentCreditInput {
  ohioAgi: Decimal | string | number;
  /** Actual Schedule of Credits37 minus38, after earlier credits. */
  ohioTaxBeforeCredits: Decimal | string | number;
  otherStates: OtherStateTaxEntry[];
}
/** Actual source rows; the printed form does not allocate credit to each state. */
export interface OtherStateCreditDetail {
  stateCode: string;
  incomeType: OhioResidentCreditIncomeType;
  doubleTaxedIncome: Decimal;
  taxPaidToOtherState: Decimal;
  includedInColumns: boolean;
}
export interface OhioResidentCreditResult {
  ohioAgi: Decimal;
  ohioTaxBeforeCredits: Decimal;
  stateDetails: OtherStateCreditDetail[];
  line1_totalDoubleTaxedIncome: Decimal;
  line2_totalOtherStateTax: Decimal;
  line3_ohioAgi: Decimal;
  line4_apportionmentFraction: Decimal;
  line5_taxAvailable: Decimal;
  line6_ohioTaxOnOtherStateIncome: Decimal;
  line7_residentCredit: Decimal;
  totalResidentCredit: Decimal;
  lines: CalculatedLine[];
}
function actualAmount(value: Decimal | string | number, label: string, signed = false): Decimal {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    throw new Error(`Ohio resident credit requires an actual ${label}`);
  }
  const amount = d(value);
  if (!amount.isFinite() || (!signed && amount.lt(0))) {
    throw new Error(`Ohio resident credit ${label} must be finite${signed ? "" : " and nonnegative"}`);
  }
  return amount;
}
export function calculateOhioResidentCredit(input: OhioResidentCreditInput): OhioResidentCreditResult {
  const audit = new AuditTrail();
  const ohioAgi = roundDollar(actualAmount(input.ohioAgi, "Ohio AGI", true));
  const ohioTax = roundDollar(zeroFloor(actualAmount(input.ohioTaxBeforeCredits, "tax available after earlier credits", true)));
  const byState = new Map<string, { income: Decimal; tax: Decimal }>();
  // Validate originals before zero-base shortcuts: unavailable facts are never known0.
  const stateDetails = input.otherStates.map((entry, index): OtherStateCreditDetail => {
    const stateCode = entry.stateCode.trim().toUpperCase();
    if (!VALID_JURISDICTIONS.has(stateCode)) {
      throw new Error("Ohio resident credit applies only to another U.S. state or DC with a printed2025 income-tax row");
    }
    let incomeType = entry.incomeType;
    if (incomeType === undefined) {
      if (OHIO_RECIPROCITY_STATES.has(stateCode)) {
        throw new Error(`Ohio resident credit entry for ${stateCode} must specify incomeType because reciprocity excludes compensation income`);
      }
      incomeType = "other";
    }
    if (incomeType !== "compensation" && incomeType !== "other") {
      throw new Error("Ohio resident credit requires an actual supported income type");
    }
    const income = actualAmount(entry.doubleTaxedIncome, "other-state income");
    const tax = actualAmount(entry.taxPaid, "other-state tax paid");
    const reciprocalCompensation = incomeType === "compensation" && OHIO_RECIPROCITY_STATES.has(stateCode);
    if (!reciprocalCompensation && income.gt(0) !== tax.gt(0)) {
      throw new Error("Ohio IT RC requires both actual positive income and tax paid, or both known zero");
    }
    const includedInColumns = !reciprocalCompensation && income.gt(0) && tax.gt(0);
    if (includedInColumns) {
      const previous = byState.get(stateCode) ?? { income: new Decimal(0), tax: new Decimal(0) };
      byState.set(stateCode, { income: previous.income.plus(income), tax: previous.tax.plus(tax) });
    }
    const sourceStatus = reciprocalCompensation ? "Excluded reciprocal-state compensation" : includedInColumns ? "Actual eligible column source" : "Both amounts explicitly known zero";
    audit.record("OH-RESIDENT-CREDIT", `${stateCode}/A-${index + 1}`, `Actual ${stateCode} income source`, income, sourceStatus);
    audit.record("OH-RESIDENT-CREDIT", `${stateCode}/B-${index + 1}`, `Actual ${stateCode} net income tax paid source`, tax, sourceStatus);
    return { stateCode, incomeType, doubleTaxedIncome: income, taxPaidToOtherState: tax, includedInColumns };
  });
  let line1 = new Decimal(0);
  let line2 = new Decimal(0);
  for (const row of byState.values()) {
    // Multiple actual rows for one state form one whole-dollar A/B pair.
    line1 = line1.plus(roundDollar(row.income));
    line2 = line2.plus(roundDollar(row.tax));
  }
  const line4 = ohioAgi.gt(0)
    ? min(new Decimal(1), line1.div(ohioAgi).toDecimalPlaces(4, Decimal.ROUND_DOWN))
    : new Decimal(0);
  const line6 = roundDollar(line4.times(ohioTax));
  const line7 = min(line2, line6);
  audit.record("OH-RESIDENT-CREDIT", "1", "Total eligible other-state income", line1, "Sum of whole-dollar IT RC Column A amounts");
  audit.record("OH-RESIDENT-CREDIT", "2", "Total actual other-state income tax paid", line2, "Sum of corresponding whole-dollar IT RC Column B amounts");
  audit.record("OH-RESIDENT-CREDIT", "3", "Ohio adjusted gross income", ohioAgi, "IT1040 line3");
  audit.record("OH-RESIDENT-CREDIT", "4", "Aggregate apportionment fraction", line4, "min(1,truncate4(line1 / line3)); zero when line3 is nonpositive");
  audit.record("OH-RESIDENT-CREDIT", "5", "Ohio tax available after earlier credits", ohioTax, "max(0,actual ScheduleCredits37 minus38)");
  audit.record("OH-RESIDENT-CREDIT", "6", "Ohio tax on aggregate other-state income", line6, "roundDollar(line4 * line5)");
  audit.record("OH-RESIDENT-CREDIT", "7", "Ohio resident credit", line7, "min(line2,line6); ScheduleCredits39");
  return { ohioAgi, ohioTaxBeforeCredits: ohioTax, stateDetails,
    line1_totalDoubleTaxedIncome: line1, line2_totalOtherStateTax: line2,
    line3_ohioAgi: ohioAgi, line4_apportionmentFraction: line4,
    line5_taxAvailable: ohioTax, line6_ohioTaxOnOtherStateIncome: line6,
    line7_residentCredit: line7, totalResidentCredit: line7, lines: audit.getLines() };
}
