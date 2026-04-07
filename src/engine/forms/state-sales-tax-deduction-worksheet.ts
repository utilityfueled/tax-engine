/**
 * State and Local General Sales Tax Deduction Worksheet
 * Spec: spec/federal/state-sales-tax-deduction.yaml
 *
 * Computes the general sales tax deduction for Schedule A Line 5a when the
 * taxpayer elects to deduct sales taxes instead of income taxes.
 *
 * Two methods:
 *   "table"  — IRS Optional State Sales Tax Table lookup from AGI, state,
 *              local rate, and number of exemptions, plus specific-purchase
 *              sales tax.
 *   "actual" — total actual general sales tax from receipts plus specific-
 *              purchase sales tax.
 *
 * Ref: IRC §164(b)(5)(I); Schedule A Instructions.
 */

import Decimal from "decimal.js";
import type { SalesTaxDeduction } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, sum, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import {
  STATE_SALES_TAX_RATES_2025,
  BASE_TAXABLE_SPENDING_2025,
  getExemptionMultiplier,
  getAGIBracketIndex,
} from "@/models/sales-tax-tables.js";

const ZERO = new Decimal(0);

export interface SalesTaxDeductionResult {
  /** Total general sales tax deduction (Line 7 of worksheet) */
  totalSalesTaxDeduction: Decimal;
  /** State general sales tax rate used */
  stateRate: Decimal;
  /** Effective combined rate (state + capped local) */
  combinedRate: Decimal;
  /** IRS table amount before specific purchases (table method only) */
  tableAmount: Decimal;
  /** Total specific-purchase sales tax */
  specificPurchaseTotal: Decimal;
  /** Method used: "table" or "actual" */
  method: string;
  /** Audit trail lines */
  lines: CalculatedLine[];
}

/**
 * Computes the general sales tax deduction.
 *
 * @param input      - SalesTaxDeduction schema input
 * @param agi        - Adjusted gross income for IRS table bracket lookup
 * @param exemptions - Number of personal exemptions (1 + spouse + dependents)
 */
export function calculateSalesTaxDeduction(
  input: SalesTaxDeduction,
  agi: Decimal,
  exemptions: number,
): SalesTaxDeductionResult {
  const audit = new AuditTrail();

  // Step 1: State general sales tax rate
  const stateCode = input.state.toUpperCase();
  const stateRate = STATE_SALES_TAX_RATES_2025[stateCode] ?? ZERO;
  const isAlaskaLocalOnlyState = stateCode === "AK" && stateRate.isZero();
  audit.record("Sales Tax WS", "1", "State general sales tax rate", stateRate,
    stateRate.isZero()
      ? `${stateCode} has no general sales tax`
      : `${stateCode} state rate`);

  // Step 2: Local rate (capped at state rate per IRS instructions, except
  // Alaska's local-only general sales tax path)
  const rawLocalRate = d(input.localSalesTaxRate);
  const localRate = isAlaskaLocalOnlyState
    ? rawLocalRate
    : Decimal.min(rawLocalRate, stateRate);
  audit.record("Sales Tax WS", "2", "Local sales tax rate (capped at state rate)", localRate,
    isAlaskaLocalOnlyState
      ? `Alaska local-only general sales tax rate ${rawLocalRate}`
      : rawLocalRate.greaterThan(stateRate)
      ? `Entered ${rawLocalRate}, capped at state rate ${stateRate}`
      : `Average local rate`);

  // Step 3: Combined rate
  const combinedRate = stateRate.plus(localRate);
  audit.record("Sales Tax WS", "3", "Combined state + local rate", combinedRate,
    `${stateRate} + ${localRate}`);

  // If combined rate is zero, no sales tax deduction is possible
  if (combinedRate.isZero()) {
    return {
      totalSalesTaxDeduction: ZERO,
      stateRate,
      combinedRate,
      tableAmount: ZERO,
      specificPurchaseTotal: ZERO,
      method: input.method,
      lines: audit.getLines(),
    };
  }

  let baseDeduction: Decimal;

  if (input.method === "table") {
    // Step 4: IRS Optional Sales Tax Table lookup
    const bracketIndex = getAGIBracketIndex(agi);
    const baseSpending = BASE_TAXABLE_SPENDING_2025[bracketIndex];

    // Table amount for 1 exemption = base spending × combined rate
    const singleExemptionAmount = roundDollar(baseSpending.times(combinedRate));

    // Apply exemption multiplier
    const multiplier = getExemptionMultiplier(exemptions);
    const tableAmount = roundDollar(singleExemptionAmount.times(multiplier));

    audit.record("Sales Tax WS", "4", "IRS table base amount (1 exemption)", singleExemptionAmount,
      `Base spending $${baseSpending} × combined rate ${combinedRate}`);

    audit.record("Sales Tax WS", "5", "Table amount with exemption multiplier", tableAmount,
      `$${singleExemptionAmount} × ${multiplier} (${exemptions} exemption${exemptions !== 1 ? "s" : ""})`);

    baseDeduction = tableAmount;
  } else {
    // Actual method: use provided total
    const actualAmount = d(input.actualGeneralSalesTax);
    audit.record("Sales Tax WS", "4", "Actual general sales tax from receipts", actualAmount,
      "Total from taxpayer records");
    baseDeduction = actualAmount;
  }

  // Step 6: Specific large purchases
  const specificPurchaseTotal = sum(
    ...input.specificPurchaseSalesTax.map((p) => d(p.salesTaxPaid))
  );

  if (specificPurchaseTotal.greaterThan(0)) {
    for (const purchase of input.specificPurchaseSalesTax) {
      audit.record("Sales Tax WS", "6", `Specific purchase: ${purchase.description}`,
        d(purchase.salesTaxPaid), "Actual sales tax on motor vehicle/boat/aircraft/home");
    }
    if (input.specificPurchaseSalesTax.length > 1) {
      audit.record("Sales Tax WS", "6t", "Total specific purchase sales tax",
        specificPurchaseTotal,
        `Sum of ${input.specificPurchaseSalesTax.length} specific purchases`);
    }
  }

  // Step 7: Total
  const totalSalesTaxDeduction = baseDeduction.plus(specificPurchaseTotal);
  audit.record("Sales Tax WS", "7", "Total general sales tax deduction", totalSalesTaxDeduction,
    input.method === "table"
      ? `Table amount $${baseDeduction} + specific purchases $${specificPurchaseTotal}`
      : `Actual receipts $${baseDeduction} + specific purchases $${specificPurchaseTotal}`);

  return {
    totalSalesTaxDeduction,
    stateRate,
    combinedRate,
    tableAmount: input.method === "table" ? baseDeduction : ZERO,
    specificPurchaseTotal,
    method: input.method,
    lines: audit.getLines(),
  };
}
