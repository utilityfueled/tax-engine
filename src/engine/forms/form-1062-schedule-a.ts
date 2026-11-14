import type Decimal from "decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

export interface Form1062ScheduleAInput {
  taxYear: 2026;
  transactionType: "direct_sale";
  saleDate: string;
  qualifyingFarmUseConfirmed: true;
  unitedStatesRealPropertyConfirmed: true;
  activeFarmerBuyerConfirmed: true;
  enforceableTenYearCovenantConfirmed: true;
  covenantIncluded: true;
  wholePropertyQualifies: true;
  allGainRecognizedThisYear: true;
  grossProceeds: string;
  sellingExpenses: string;
  unadjustedBasis: string;
  adjustedBasis: string;
  independentlyReportedGain: string;
}

function amount(value: string | undefined, field: string): Decimal {
  if (typeof value !== "string" || !/^\d{1,12}(?:\.\d{1,2})?$/u.test(value)) {
    throw new Error(`Form 1062 Schedule A requires a confirmed nonnegative dollar and cent amount for ${field}`);
  }
  return d(value);
}

/** Worksheet for one fully qualifying 2026 sale. See spec/federal/form-1062-schedule-a.yaml. */
export function calculateForm1062ScheduleA(input: Form1062ScheduleAInput) {
  if (input.taxYear !== 2026 || input.transactionType !== "direct_sale"
    || input.qualifyingFarmUseConfirmed !== true || input.unitedStatesRealPropertyConfirmed !== true
    || input.activeFarmerBuyerConfirmed !== true || input.enforceableTenYearCovenantConfirmed !== true
    || input.covenantIncluded !== true || input.wholePropertyQualifies !== true
    || input.allGainRecognizedThisYear !== true) {
    throw new Error("Form 1062 Schedule A requires every qualification for a whole-property 2026 direct sale");
  }
  const date = typeof input.saleDate === "string" && /^2026-\d{2}-\d{2}$/u.test(input.saleDate)
    ? new Date(input.saleDate)
    : undefined;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.saleDate) {
    throw new Error("Form 1062 Schedule A requires a confirmed 2026 calendar sale date");
  }

  const audit = new AuditTrail();
  const record = (line: string, description: string, value: Decimal, formula: string) =>
    audit.record("Schedule A (Form 1062)", line, description, value, formula);
  const grossProceeds = record("9", "Gross sales price", amount(input.grossProceeds, "line 9"), "Confirmed gross proceeds");
  const netProceeds = grossProceeds.minus(amount(input.sellingExpenses, "selling expenses"));
  if (netProceeds.lt(0)) throw new Error("Form 1062 Schedule A selling expenses exceed gross proceeds");
  record("10", "Net sales price", netProceeds, "Line 9 minus confirmed selling expenses");
  record("11", "Unadjusted basis", amount(input.unadjustedBasis, "line 11"), "Confirmed unadjusted basis");
  const adjustedBasis = record("12", "Adjusted basis", amount(input.adjustedBasis, "line 12"), "Confirmed adjusted basis");
  const gain = netProceeds.minus(adjustedBasis);
  if (!gain.gt(0) || !gain.eq(amount(input.independentlyReportedGain, "independently reported gain"))) {
    throw new Error("Form 1062 Schedule A requires a positive line 13 gain that reconciles to the independently reported gain");
  }
  const recognizedGain = record("13", "Recognized gain", gain, "Line 10 minus line 12");
  return { recognizedGain, lines: audit.getLines() };
}
