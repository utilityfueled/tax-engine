import type Decimal from "decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

interface ConfirmedSale {
  taxYear: 2026;
  saleDate: string;
  qualifyingFarmUseConfirmed: true;
  unitedStatesRealPropertyConfirmed: true;
  activeFarmerBuyerConfirmed: true;
  enforceableTenYearCovenantConfirmed: true;
  covenantIncluded: true;
  wholePropertyQualifies: true;
  allGainRecognizedThisYear: true;
  independentlyReportedGain: string;
}

interface DirectSale {
  transactionType: "direct_sale";
  grossProceeds: string;
  sellingExpenses: string;
  unadjustedBasis: string;
  adjustedBasis: string;
  partnerAllocation?: never;
}

interface PartnershipSale {
  transactionType: "partnership_sale";
  partnerAllocation: {
    sourceForm: "1065";
    sourceBox: "20";
    sourceCode: "ZZ";
    sourceTaxYear: 2026;
    section1062StatementConfirmed: true;
    entityScheduleAMatched: true;
    taxpayerAndEntityMatched: true;
    allocatedGain: string;
  };
  grossProceeds?: never;
  sellingExpenses?: never;
  unadjustedBasis?: never;
  adjustedBasis?: never;
}

export type Form1062ScheduleAInput = ConfirmedSale & (DirectSale | PartnershipSale);

function amount(value: string | undefined, field: string): Decimal {
  if (typeof value !== "string" || !/^\d{1,12}(?:\.\d{1,2})?$/u.test(value)) {
    throw new Error(`Form 1062 Schedule A requires a confirmed nonnegative dollar and cent amount for ${field}`);
  }
  return d(value);
}

/** Worksheet for one fully qualifying 2026 sale. See spec/federal/form-1062-schedule-a.yaml. */
export function calculateForm1062ScheduleA(input: Form1062ScheduleAInput) {
  if (input.taxYear !== 2026 || (input.transactionType !== "direct_sale" && input.transactionType !== "partnership_sale")
    || input.qualifyingFarmUseConfirmed !== true || input.unitedStatesRealPropertyConfirmed !== true
    || input.activeFarmerBuyerConfirmed !== true || input.enforceableTenYearCovenantConfirmed !== true
    || input.covenantIncluded !== true || input.wholePropertyQualifies !== true
    || input.allGainRecognizedThisYear !== true) {
    throw new Error("Form 1062 Schedule A requires every qualification for a whole-property 2026 sale");
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
  let gain: Decimal;
  let formula: string;
  if (input.transactionType === "partnership_sale") {
    const source = input.partnerAllocation;
    if (input.grossProceeds !== undefined || input.sellingExpenses !== undefined
      || input.unadjustedBasis !== undefined || input.adjustedBasis !== undefined
      || source?.sourceForm !== "1065" || source.sourceBox !== "20" || source.sourceCode !== "ZZ"
      || source.sourceTaxYear !== input.taxYear || source.section1062StatementConfirmed !== true
      || source.entityScheduleAMatched !== true || source.taxpayerAndEntityMatched !== true) {
      throw new Error("Form 1062 Schedule A requires a matched Form 1065 section 1062 statement and blank lines 9 through 12");
    }
    gain = amount(source.allocatedGain, "the partner's allocated gain");
    formula = "Confirmed Form 1065 K-1 box 20 section 1062 statement";
  } else {
    if (input.partnerAllocation !== undefined) throw new Error("Form 1062 Schedule A direct sale cannot include a K-1 allocation");
    const grossProceeds = record("9", "Gross sales price", amount(input.grossProceeds, "line 9"), "Confirmed gross proceeds");
    const netProceeds = grossProceeds.minus(amount(input.sellingExpenses, "selling expenses"));
    if (netProceeds.lt(0)) throw new Error("Form 1062 Schedule A selling expenses exceed gross proceeds");
    record("10", "Net sales price", netProceeds, "Line 9 minus confirmed selling expenses");
    record("11", "Unadjusted basis", amount(input.unadjustedBasis, "line 11"), "Confirmed unadjusted basis");
    const adjustedBasis = record("12", "Adjusted basis", amount(input.adjustedBasis, "line 12"), "Confirmed adjusted basis");
    gain = netProceeds.minus(adjustedBasis);
    formula = "Line 10 minus line 12";
  }
  if (!gain.gt(0) || !gain.eq(amount(input.independentlyReportedGain, "independently reported gain"))) {
    throw new Error("Form 1062 Schedule A requires a positive line 13 gain that reconciles to the independently reported gain");
  }
  const recognizedGain = record("13", "Recognized gain", gain, formula);
  return { recognizedGain, lines: audit.getLines() };
}
