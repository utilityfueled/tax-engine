/**
 * Illinois Use Tax Worksheet (IL-1040 Line 21)
 * Spec: spec/state/il-use-tax.yaml
 *
 * Two computation modes:
 * 1. UT Table: standard amounts based on federal AGI brackets
 * 2. UT Worksheet: actual use tax from out-of-state purchase amounts
 *
 * Use tax applies to out-of-state purchases where IL sales tax was not collected.
 * If net use tax ≥ $600 ($1,200 MFJ), taxpayer must file ST-44 separately.
 */

import Decimal from "decimal.js";
import { zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";
import {
  IL_USE_TAX_CONSTANTS as SHARED_IL_USE_TAX_CONSTANTS,
  type FilingStatus,
  type IllinoisUseTaxConstants,
  type IllinoisUseTaxTableBracket,
} from "@/models/constants.js";

export type UseTaxTableBracket = IllinoisUseTaxTableBracket;
export type ILUseTaxConstants = IllinoisUseTaxConstants;
export const IL_USE_TAX_CONSTANTS = SHARED_IL_USE_TAX_CONSTANTS;

// ---------------------------------------------------------------------------
// UT Table Lookup
// ---------------------------------------------------------------------------

/**
 * Look up the standard use tax amount from the UT Table based on federal AGI.
 * Returns $0 for negative AGI. For AGI > $100,000: AGI × 0.0005 rounded.
 */
export function lookupUseTaxTable(federalAGI: Decimal, taxYear: number): Decimal {
  const c = IL_USE_TAX_CONSTANTS[taxYear];
  if (!c) {
    throw new Error(`IL Use Tax constants not available for tax year ${taxYear}`);
  }

  if (federalAGI.isNegative()) {
    return new Decimal(0);
  }

  // Check if AGI exceeds the formula threshold
  if (federalAGI.greaterThan(c.formulaThreshold)) {
    return roundDollar(federalAGI.times(c.formulaRate));
  }

  // Look up in table brackets
  for (const bracket of c.table) {
    if (federalAGI.lessThanOrEqualTo(bracket.upperBound)) {
      return bracket.amount;
    }
  }

  // Fallback (shouldn't reach here if table covers up to formulaThreshold)
  return roundDollar(federalAGI.times(c.formulaRate));
}

// ---------------------------------------------------------------------------
// UT Worksheet Input / Result
// ---------------------------------------------------------------------------

export interface UseTaxWorksheetInput {
  taxYear: number;
  filingStatus: FilingStatus;
  federalAGI: Decimal;

  /** Line 1: Cost of general merchandise purchased from out-of-state retailers */
  generalMerchandisePurchases: Decimal;

  /** Line 3: Cost of qualifying food, drugs, and medical appliances from out-of-state */
  qualifyingFoodDrugMedicalPurchases: Decimal;

  /** Line 5: Sales tax already paid to other states on these purchases */
  salesTaxPaidToOtherStates: Decimal;
}

export interface UseTaxWorksheetResult {
  /** UT Table standard amount (for comparison) */
  tableAmount: Decimal;

  /** Line 2: General merchandise tax (purchases × 6.25%) */
  generalMerchandiseTax: Decimal;

  /** Line 4: Qualifying items tax (purchases × 1%) */
  qualifyingItemsTax: Decimal;

  /** Line 5: Sales tax credit from other states */
  salesTaxCredit: Decimal;

  /** Line 6: Net use tax = max(general + qualifying - credit, 0) */
  netUseTax: Decimal;

  /** Whether net use tax meets or exceeds ST-44 filing threshold */
  requiresST44: boolean;

  /** IL-1040 Line 21 amount after applying the ST-44 filing rule */
  reportableUseTax: Decimal;

  /** Audit trail */
  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculateUseTaxWorksheet(input: UseTaxWorksheetInput): UseTaxWorksheetResult {
  const c = IL_USE_TAX_CONSTANTS[input.taxYear];
  if (!c) {
    throw new Error(`IL Use Tax constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const FORM = "UT Worksheet";

  // Table amount for reference
  const tableAmount = lookupUseTaxTable(input.federalAGI, input.taxYear);
  audit.record(FORM, "Table", "UT Table standard amount", tableAmount,
    "AGI-based table lookup", { federalAGI: input.federalAGI });

  // Line 1: General merchandise purchases
  const line1 = audit.record(FORM, "1", "General merchandise purchases",
    input.generalMerchandisePurchases, "Input",
    { purchases: input.generalMerchandisePurchases });

  // Line 2: General merchandise use tax
  const line2 = audit.record(FORM, "2", "General merchandise use tax",
    roundDollar(line1.times(c.generalMerchandiseRate)),
    "Line 1 × 6.25%", { line1, rate: c.generalMerchandiseRate });

  // Line 3: Qualifying food/drugs/medical purchases
  const line3 = audit.record(FORM, "3", "Qualifying food, drugs, medical appliance purchases",
    input.qualifyingFoodDrugMedicalPurchases, "Input",
    { purchases: input.qualifyingFoodDrugMedicalPurchases });

  // Line 4: Qualifying items use tax
  const line4 = audit.record(FORM, "4", "Qualifying items use tax",
    roundDollar(line3.times(c.qualifyingItemRate)),
    "Line 3 × 1%", { line3, rate: c.qualifyingItemRate });

  // Line 5: Sales tax already paid
  const line5 = audit.record(FORM, "5", "Sales tax paid to other states",
    input.salesTaxPaidToOtherStates, "Input",
    { salesTaxPaid: input.salesTaxPaidToOtherStates });

  // Line 6: Net use tax
  const grossTax = line2.plus(line4);
  const netUseTax = zeroFloor(grossTax.minus(line5));
  audit.record(FORM, "6", "Net use tax", netUseTax,
    "max(Line 2 + Line 4 - Line 5, 0)", { line2, line4, line5 });

  // ST-44 threshold check
  const isMFJ = input.filingStatus === "married_filing_jointly";
  const threshold = isMFJ ? c.st44Threshold.mfj : c.st44Threshold.other;
  const requiresST44 = netUseTax.greaterThanOrEqualTo(threshold);
  const reportableUseTax = requiresST44 ? new Decimal(0) : netUseTax;

  audit.record(
    FORM,
    "21",
    "IL-1040 reportable use tax",
    reportableUseTax,
    requiresST44
      ? "ST-44 required, so IL-1040 Line 21 is 0"
      : "Worksheet Line 6 flows to IL-1040 Line 21",
    {
      netUseTax,
      threshold,
      requiresST44: requiresST44 ? "yes" : "no",
    },
  );

  return {
    tableAmount,
    generalMerchandiseTax: line2,
    qualifyingItemsTax: line4,
    salesTaxCredit: line5,
    netUseTax,
    requiresST44,
    reportableUseTax,
    lines: audit.getLines(),
  };
}
